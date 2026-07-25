import { Bookmark, Check, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useMovieStatus } from '../../hooks/useMovieStatus'

/** Full labelled action bar for the movie detail page. */
export default function MovieActions({ movieId }) {
  const {
    savedIds, watchedIds, reactionOf,
    toggleSave, toggleWatched, setLike,
    isPending, reactionPending,
  } = useMovieStatus()

  const isSaved = savedIds.has(movieId)
  const isWatched = watchedIds.has(movieId)
  const reaction = reactionOf(movieId)

  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        active={isSaved}
        disabled={isPending}
        onClick={() => toggleSave(movieId)}
        icon={<Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />}
        label={isSaved ? 'Saved' : 'Watchlist'}
      />
      <ActionButton
        active={isWatched}
        disabled={isPending}
        onClick={() => toggleWatched(movieId)}
        icon={<Check size={15} />}
        label={isWatched ? 'Watched' : 'Mark watched'}
        activeClass="bg-green-500 border-green-500 text-white"
      />
      <ActionButton
        active={reaction === 'LIKE'}
        disabled={reactionPending}
        onClick={() => setLike(movieId, 'LIKE')}
        icon={<ThumbsUp size={15} fill={reaction === 'LIKE' ? 'currentColor' : 'none'} />}
        label="Like"
      />
      <ActionButton
        active={reaction === 'DISLIKE'}
        disabled={reactionPending}
        onClick={() => setLike(movieId, 'DISLIKE')}
        icon={<ThumbsDown size={15} fill={reaction === 'DISLIKE' ? 'currentColor' : 'none'} />}
        label="Dislike"
        activeClass="bg-red-500 border-red-500 text-white"
      />
    </div>
  )
}

function ActionButton({ active, disabled, onClick, icon, label, activeClass = 'bg-[var(--accent)] border-[var(--accent)] text-white' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all disabled:opacity-50 ${
        active
          ? activeClass
          : 'bg-[var(--surface)] border-[var(--border-color)] text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
      }`}
    >
      {icon} {label}
    </button>
  )
}
