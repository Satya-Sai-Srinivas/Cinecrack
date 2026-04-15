import { useRef, useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  MessageCircle, X, Trash2, Send, Bot, Film,
} from 'lucide-react'
import { useChatStore } from '../../store/useAppStore'
import { useAIChat } from '../../hooks/useAIChat'
import { useToast } from '../ui/Toast'

const PLACEHOLDER_POSTER = 'https://placehold.co/300x450/1e293b/94a3b8?text=No+Image'

const WELCOME = "Welcome. Describe a vibe, character arc, ending tone, or visual atmosphere, and I will curate cinematic matches."

// ---- Mini movie card used inside chatbot bubbles ----
function CompactMovieCard({ movie }) {
  return (
    <Link
      to={`/movie/${movie.id}`}
      state={{ from: '/chat' }}
      className="flex-shrink-0 w-28 group"
    >
      <div className="overflow-hidden rounded-lg aspect-[2/3] bg-[var(--surface)] border border-[var(--border-color)]">
        <img
          src={movie.poster_url || PLACEHOLDER_POSTER}
          alt={movie.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          loading="lazy"
          onError={(e) => { e.target.src = PLACEHOLDER_POSTER }}
        />
      </div>
      <p className="text-xs text-[var(--text-main)] mt-1 line-clamp-2 font-medium leading-tight">{movie.title}</p>
      <p className="text-[10px] text-[var(--text-muted)]">{movie.release_date?.slice(0, 4) ?? ''}</p>
    </Link>
  )
}

// ---- Single message bubble ----
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  const isStreaming = msg.role === 'assistant' && msg.content === '' && (!msg.recommendations || msg.recommendations.length === 0)

  return (
    <article className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center mr-2 mt-1 shrink-0">
          <Bot size={14} className="text-white" />
        </div>
      )}
      <div className="max-w-[85%]">
        <div
          className={`px-3 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-[var(--accent)] text-white rounded-tr-sm'
              : 'bg-[var(--surface)] text-[var(--text-main)] border border-[var(--border-color)] rounded-tl-sm'
          }`}
        >
          {isStreaming ? (
            <div className="flex items-center gap-2 py-1">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-[var(--text-muted)]">Composing a cinematic answer…</span>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{msg.content || ''}</p>
          )}
        </div>

        {/* Recommendation row */}
        {msg.role === 'assistant' && msg.recommendations?.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar pb-1">
            {msg.recommendations.map((m) => (
              <CompactMovieCard key={m.id} movie={m} />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

// ---- Main ChatbotWidget ----
export function ChatbotWidget() {
  const { isOpen, history, toggleOpen, clearHistory } = useChatStore()
  const { sendMessage, isStreaming } = useAIChat()
  const toast = useToast()

  const [input, setInput] = useState('')
  const threadRef = useRef(null)
  const textareaRef = useRef(null)

  // Auto-scroll thread to bottom when messages update
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [history])

  // Auto-resize textarea
  const handleInput = useCallback((e) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      if (!input.trim() || isStreaming) return
      const msg = input
      setInput('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      await sendMessage(msg)
    },
    [input, isStreaming, sendMessage]
  )

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit(e)
      }
    },
    [handleSubmit]
  )

  const handleClear = useCallback(() => {
    clearHistory()
    toast?.('Chat history cleared.', 'success')
  }, [clearHistory, toast])

  // Show welcome message when history is empty
  const displayMessages =
    history.length === 0
      ? [{ role: 'assistant', content: WELCOME, id: 'welcome' }]
      : history

  return (
    <>
      {/* FAB */}
      <button
        onClick={toggleOpen}
        className="fixed bottom-6 right-6 z-[1001] w-14 h-14 rounded-full bg-[var(--accent)] text-white shadow-lg hover:bg-[var(--accent-hover)] hover:scale-105 transition-all duration-200 flex items-center justify-center"
        aria-label="Toggle AI Assistant"
      >
        {isOpen ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {/* Chat window */}
      <div
        className={`fixed bottom-24 right-6 z-[1000] w-[380px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl shadow-2xl border border-[var(--border-color)] bg-[var(--card-bg)] overflow-hidden transition-all duration-300 ${
          isOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        style={{ maxHeight: '80vh' }}
        aria-label="AI Assistant chat"
      >
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--surface)]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center">
              <Film size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm text-[var(--text-main)]">AI Cinema Guru</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleClear}
              title="Clear chat"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={toggleOpen}
              title="Close"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-color)] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        {/* Thread */}
        <div
          ref={threadRef}
          className="flex-1 overflow-y-auto p-4 min-h-0"
          style={{ maxHeight: 'calc(80vh - 120px)' }}
        >
          {displayMessages.map((msg, i) => (
            <MessageBubble key={msg.id ?? i} msg={msg} />
          ))}
        </div>

        {/* Input form */}
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 px-3 py-3 border-t border-[var(--border-color)] bg-[var(--surface)]"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Ask for movie moods, themes, arcs…"
            disabled={isStreaming}
            className="flex-1 resize-none rounded-xl px-3 py-2 text-sm bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors overflow-hidden"
            style={{ maxHeight: 120 }}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </>
  )
}
