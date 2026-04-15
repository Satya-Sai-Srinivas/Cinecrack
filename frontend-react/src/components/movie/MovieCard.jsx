import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'

const PLACEHOLDER = 'https://placehold.co/300x450/1e293b/94a3b8?text=No+Image'

export function MovieCard({ movie, sourceRef }) {
  const poster = movie.poster_url || PLACEHOLDER
  const year = movie.release_date ? movie.release_date.slice(0, 4) : ''
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : null

  return (
    <Link
      to={`/movie/${movie.id}`}
      state={{ from: sourceRef }}
      className="group block"
    >
      <div className="relative overflow-hidden rounded-xl aspect-[2/3] bg-[var(--surface)] border border-[var(--border-color)] shadow-sm transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-md">
        <img
          src={poster}
          alt={movie.title}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => { e.target.src = PLACEHOLDER }}
        />
        {rating && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-yellow-400 text-xs font-bold px-2 py-1 rounded-full">
            <Star size={10} fill="currentColor" />
            {rating}
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-sm font-semibold text-[var(--text-main)] line-clamp-2 leading-tight group-hover:text-[var(--accent)] transition-colors">
          {movie.title}
        </p>
        {year && <p className="text-xs text-[var(--text-muted)] mt-0.5">{year}</p>}
      </div>
    </Link>
  )
}
