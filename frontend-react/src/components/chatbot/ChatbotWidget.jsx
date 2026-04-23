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

// Helper to format **bold** text from the AI markdown
const formatText = (text) => {
  if (!text) return null;
  return text.split('**').map((part, index) => 
    index % 2 === 1 ? <strong key={index} className="font-bold text-[var(--accent)]">{part}</strong> : part
  );
};

// ---- Mini movie card used inside chatbot bubbles ----
function CompactMovieCard({ movie }) {
  return (
    <Link
      to={`/movie/${movie.id}`}
      state={{ from: '/chat' }}
      className="flex-shrink-0 w-28 group"
    >
      <div className="overflow-hidden rounded-lg aspect-[2/3] bg-[var(--surface)] border border-[var(--border-color)] shadow-md transition-all duration-300 group-hover:shadow-lg group-hover:shadow-[var(--accent)]/20">
        <img
          src={movie.poster_url || PLACEHOLDER_POSTER}
          alt={movie.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
          loading="lazy"
          onError={(e) => { e.target.src = PLACEHOLDER_POSTER }}
        />
      </div>
      <p className="text-xs text-[var(--text-main)] mt-2 line-clamp-2 font-semibold leading-tight">{movie.title}</p>
      <p className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5">{movie.release_date?.slice(0, 4) ?? ''}</p>
    </Link>
  )
}

// ---- Single message bubble ----
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  const isStreaming = msg.role === 'assistant' && msg.content === '' && (!msg.recommendations || msg.recommendations.length === 0)

  return (
    <article className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center mr-3 mt-1 shrink-0 shadow-md">
          <Bot size={16} className="text-white" />
        </div>
      )}
      <div className="max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
            isUser
              ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] text-white rounded-tr-sm shadow-[var(--accent)]/20'
              : 'bg-[var(--surface)]/80 backdrop-blur-sm text-[var(--text-main)] border border-[var(--border-color)]/50 rounded-tl-sm'
          }`}
        >
          {isStreaming ? (
            <div className="flex items-center gap-3 py-1">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-xs font-medium text-[var(--text-muted)]">Curating cinema…</span>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{formatText(msg.content || '')}</p>
          )}
        </div>

        {/* Recommendation row */}
        {msg.role === 'assistant' && msg.recommendations?.length > 0 && (
          <div className="flex gap-3 mt-3 overflow-x-auto no-scrollbar pb-2 pt-1 snap-row">
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
      {/* FAB with pulse effect */}
      <div className="fixed bottom-6 right-6 z-[1001]">
        {!isOpen && (
          <div className="absolute inset-0 rounded-full bg-[var(--accent)] animate-ping opacity-20 duration-1000" />
        )}
        <button
          onClick={toggleOpen}
          className="relative w-14 h-14 rounded-full bg-gradient-to-tr from-[var(--accent)] to-[var(--accent-hover)] text-white shadow-xl shadow-[var(--accent)]/30 hover:scale-110 hover:shadow-2xl transition-all duration-300 flex items-center justify-center"
          aria-label="Toggle AI Assistant"
        >
          {isOpen ? <X size={24} className="animate-in spin-in-90 duration-300" /> : <MessageCircle size={24} className="animate-in zoom-in duration-300" />}
        </button>
      </div>

      {/* Chat window - Upgraded with Glassmorphism and Smooth Origin Scaling */}
      <div
        className={`fixed bottom-24 right-6 z-[1000] w-[380px] h-[600px] max-h-[calc(100vh-8rem)] flex flex-col rounded-2xl shadow-2xl shadow-black/20 border border-[var(--border-color)]/50 bg-[var(--overlay-bg)] backdrop-blur-xl overflow-hidden transition-all duration-500 ease-out origin-bottom-right ${
          isOpen
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-90 translate-y-10 pointer-events-none'
        }`}
        aria-label="AI Assistant chat"
      >
        {/* Header - Transparent to allow blur to show through */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]/40 bg-transparent">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center shadow-md">
              <Film size={14} className="text-white" />
            </div>
            <span className="font-bold text-[var(--text-main)] tracking-wide">AI Cinema Guru</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleClear}
              title="Clear chat"
              className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={toggleOpen}
              title="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--text-muted)]/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Thread */}
        <div
          ref={threadRef}
          className="flex-1 overflow-y-auto p-5 min-h-0 scroll-smooth"
        >
          {displayMessages.map((msg, i) => (
            <MessageBubble key={msg.id ?? i} msg={msg} />
          ))}
        </div>

        {/* Input form - Hardcoded backgrounds for text legibility */}
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 px-4 py-4 border-t border-[var(--border-color)]/40 bg-[var(--surface)]"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Ask for moods, themes, eras…"
            disabled={isStreaming}
            className="flex-1 resize-none rounded-xl px-4 py-3 text-sm bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-all overflow-hidden shadow-inner"
            style={{ maxHeight: 120 }}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] text-white shadow-lg hover:shadow-[var(--accent)]/30 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none transition-all shrink-0"
          >
            <Send size={18} className="ml-1" />
          </button>
        </form>
      </div>
    </>
  )
}