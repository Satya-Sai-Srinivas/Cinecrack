import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { streamChat } from '../api'
import { useChatStore } from '../store/useAppStore'

/**
 * Ports the SSE streaming logic from chatbot.js verbatim.
 *
 * SSE payload types:
 *  { type: "text",            content: string }
 *  { type: "recommendations", items: Movie[] }
 *  { type: "tool_call",       tool: string, arguments: {...} }
 *  { type: "error",           message: string }
 *  { type: "done" }
 */
export function useAIChat() {
  const navigate = useNavigate()
  const { getToken, isSignedIn } = useAuth()
  const { history, addMessage, updateLastAssistant } = useChatStore()

  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef(null)

  const sendMessage = useCallback(
    async (userInput) => {
      const trimmed = userInput.trim()
      if (!trimmed || isStreaming) return

      // Push user message
      addMessage({ role: 'user', content: trimmed })

      // Push an empty assistant placeholder that we'll stream into
      addMessage({ role: 'assistant', content: '', recommendations: [] })

      setIsStreaming(true)

      // Build history to send (exclude the empty placeholder we just added)
      const historyToSend = history
        .concat({ role: 'user', content: trimmed })
        .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content))
        .map(({ role, content }) => ({ role, content }))

      let streamedText = ''
      let streamedRecs = []
      let buffer = ''

      try {
        const token = isSignedIn ? await getToken() : null
        const body = await streamChat(trimmed, historyToSend, token)
        const reader = body.getReader()
        const decoder = new TextDecoder()

        // Store reader so we can cancel
        abortRef.current = reader

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // SSE messages are separated by '\n\n'
          const parts = buffer.split('\n\n')
          // Keep the last (potentially incomplete) chunk in buffer
          buffer = parts.pop() ?? ''

          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data:')) continue
            const jsonStr = line.slice(5).trim()
            if (!jsonStr) continue

            let payload
            try {
              payload = JSON.parse(jsonStr)
            } catch {
              continue
            }

            if (payload.type === 'text') {
              streamedText += payload.content
              updateLastAssistant(streamedText, streamedRecs)
            } else if (payload.type === 'recommendations') {
              streamedRecs = payload.items ?? []
              updateLastAssistant(streamedText, streamedRecs)
            } else if (payload.type === 'tool_call') {
              handleToolCall(payload, navigate)
            } else if (payload.type === 'error') {
              streamedText += `\n\n⚠️ ${payload.message}`
              updateLastAssistant(streamedText, streamedRecs)
            } else if (payload.type === 'done') {
              break
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          const errMsg = streamedText
            ? streamedText + '\n\n⚠️ Connection interrupted.'
            : '⚠️ Sorry, something went wrong. Please try again.'
          updateLastAssistant(errMsg, streamedRecs)
        }
      } finally {
        abortRef.current = null
        setIsStreaming(false)
      }
    },
    [history, isStreaming, addMessage, updateLastAssistant, navigate, getToken, isSignedIn]
  )

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.cancel()
      abortRef.current = null
      setIsStreaming(false)
    }
  }, [])

  return { sendMessage, isStreaming, cancelStream }
}

/**
 * Handles tool_call payloads exactly as chatbot.js does:
 * apply_discover_filters → navigate to /discover with URL params.
 */
function handleToolCall(payload, navigate) {
  if (payload.tool !== 'apply_discover_filters') return

  const args = payload.arguments ?? {}
  const params = new URLSearchParams()

  if (args.genre_id)    params.set('genre',       args.genre_id)
  if (args.start_year) {
    params.set('year_min', args.start_year)
    params.set('year_max', args.start_year + 9)
  }
  if (args.min_rating)  params.set('min_rating',  args.min_rating)

  navigate(`/discover?${params.toString()}`)
}
