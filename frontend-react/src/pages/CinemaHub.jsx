import { useQuery } from '@tanstack/react-query'
import { Globe, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchRegionalHub } from '../api'

const PLACEHOLDER = 'https://placehold.co/300x450/1e293b/94a3b8?text=No+Image'

const SECTIONS = [
  { key: 'tollywood',    label: '🎬 Tollywood', subtitle: 'Telugu Cinema' },
  { key: 'bollywood',    label: '🌟 Bollywood', subtitle: 'Hindi Cinema' },
  { key: 'kollywood',    label: '🎭 Kollywood', subtitle: 'Tamil Cinema' },
  { key: 'mollywood',    label: '🌴 Mollywood', subtitle: 'Malayalam Cinema' },
  { key: 'international', label: '🌍 International', subtitle: 'World Cinema' },
]

function HubMovieCard({ movie }) {
  return (
    <Link
      to={`/movie/${movie.id}`}
      state={{ from: '/hub' }}
      className="group flex-shrink-0 w-36"
    >
      <div className="overflow-hidden rounded-xl aspect-[2/3] bg-[var(--surface)] border border-[var(--border-color)] shadow-sm transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-md">
        <img
          src={movie.poster_url || PLACEHOLDER}
          alt={movie.title}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => { e.target.src = PLACEHOLDER }}
        />
      </div>
      <p className="text-xs font-semibold text-[var(--text-main)] mt-2 line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
        {movie.title}
      </p>
      <p className="text-[11px] text-[var(--text-muted)]">{movie.release_date?.slice(0, 4) ?? ''}</p>
    </Link>
  )
}

function SkeletonRow() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex-shrink-0 w-36 flex flex-col gap-2">
          <div className="skeleton aspect-[2/3] w-full rounded-xl" />
          <div className="skeleton h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  )
}

function CinemaRow({ label, subtitle, movies, isLoading, isError }) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-main)]">{label}</h2>
          <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <ChevronRight size={16} className="text-[var(--text-muted)] ml-auto" />
      </div>

      {isLoading ? (
        <SkeletonRow />
      ) : isError ? (
        <p className="text-sm text-[var(--text-muted)] pl-1">Failed to load. Please refresh.</p>
      ) : !movies?.length ? (
        <p className="text-sm text-[var(--text-muted)] pl-1">No movies available right now.</p>
      ) : (
        <div className="snap-row flex gap-4 pb-2">
          {movies.map((m) => (
            <HubMovieCard key={m.id} movie={m} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function CinemaHub() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['regional-hub'],
    queryFn: fetchRegionalHub,
    staleTime: 10 * 60 * 1000,  // Cache 10 minutes — 5 concurrent calls become instant on revisit
  })

  return (
    <div className="p-6 md:p-8 max-w-screen-xl">
      <div className="flex items-center gap-2 mb-8">
        <Globe size={20} className="text-[var(--accent)]" />
        <h1 className="text-xl font-bold text-[var(--text-main)]">Cinema Hub</h1>
        <span className="text-xs text-[var(--text-muted)] ml-1">— Now Playing Globally</span>
      </div>

      {SECTIONS.map(({ key, label, subtitle }) => (
        <CinemaRow
          key={key}
          label={label}
          subtitle={subtitle}
          movies={data?.[key]}
          isLoading={isLoading}
          isError={isError}
        />
      ))}
    </div>
  )
}
