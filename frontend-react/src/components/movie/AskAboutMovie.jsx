import { useState } from 'react'
import { HelpCircle, Send, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@clerk/clerk-react'
import { askMovie } from '../../api'

/** Spoiler-safe plot Q&A for a movie. */
export default function AskAboutMovie({ movieId }) {
  const { getToken, isSignedIn } = useAuth()
  const [question, setQuestion] = useState('')
  const [reveal, setReveal] = useState(false)
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const q = question.trim()
    if (!q || loading) return
    setLoading(true)
    setAnswer('')
    try {
      const token = isSignedIn ? await getToken() : null
      const res = await askMovie(movieId, q, reveal, token)
      setAnswer(res.answer || 'No answer.')
    } catch {
      setAnswer('Sorry, something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mt-10 max-w-2xl">
      <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text-main)] mb-3">
        <HelpCircle size={18} className="text-[var(--accent)]" /> Ask about this movie
      </h2>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Does it have a happy ending? Is it scary?"
            className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white disabled:opacity-50 flex items-center gap-2 shrink-0"
          >
            <Send size={16} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className={`self-start flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
            reveal
              ? 'border-red-400 text-red-500 bg-red-500/10'
              : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)]'
          }`}
        >
          {reveal ? <Eye size={13} /> : <EyeOff size={13} />}
          {reveal ? 'Spoilers on' : 'Spoilers off'}
        </button>
      </form>

      {loading && <p className="text-sm text-[var(--text-muted)] mt-3">Thinking…</p>}
      {answer && !loading && (
        <div className="mt-3 p-4 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">
          {answer}
        </div>
      )}
    </section>
  )
}
