import { useQuery } from '@tanstack/react-query'
import { Globe, ChevronRight } from 'lucide-react'
import { fetchRegionalHub } from '../api'
import MovieCard from '../components/movie/MovieCard'

const SECTIONS = [
  { key: 'tollywood',    label: '🎬 Tollywood', subtitle: 'Telugu Cinema' },
  { key: 'bollywood',    label: '🌟 Bollywood', subtitle: 'Hindi Cinema' },
  { key: 'kollywood',    label: '🎭 Kollywood', subtitle: 'Tamil Cinema' },
  { key: 'mollywood',    label: '🌴 Mollywood', subtitle: 'Malayalam Cinema' },
  { key: 'international', label: '🌍 International', subtitle: 'World Cinema' },
]

function SkeletonRow() {
  return (
    <div className="flex gap-4 overflow-hidden w-full">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] flex flex-col gap-2">
          <div className="skeleton aspect-[2/3] w-full rounded-xl" />
          <div className="skeleton h-4 w-3/4 rounded mt-2" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
      ))}
    </div>
  )
}

function CinemaRow({ label, subtitle, movies, isLoading, isError }) {
  return (
    <section className="mb-10 w-full">
      <div className="flex items-center gap-3 mb-4 group cursor-pointer">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-main)] tracking-tight">{label}</h2>
          <p className="text-sm font-medium text-[var(--text-muted)] mt-0.5">{subtitle}</p>
        </div>
        <ChevronRight size={20} className="text-[var(--text-muted)] ml-auto opacity-50 transition-transform group-hover:translate-x-1 group-hover:opacity-100 group-hover:text-[var(--accent)]" />
      </div>

      {isLoading ? (
        <SkeletonRow />
      ) : isError ? (
        <p className="text-sm text-[var(--text-muted)] pl-1">Failed to load. Please refresh.</p>
      ) : !movies?.length ? (
        <p className="text-sm text-[var(--text-muted)] pl-1">No movies available right now.</p>
      ) : (
        /* The momentum-scroll wrapper for Native-App swiping */
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-6 momentum-scroll w-full">
          {movies.map((m) => (
            <div key={m.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] snap-item">
              <MovieCard movie={m} />
            </div>
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
    <div className="p-6 md:p-8 max-w-screen-xl mx-auto w-full">
      {/* Upgraded Header */}
      <header className="flex items-center gap-3 mb-10 border-b border-[var(--border-color)]/50 pb-6">
        <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
          <Globe size={22} className="text-[var(--accent)]" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-[var(--text-main)] tracking-tight">Cinema Hub</h1>
          <p className="text-sm font-medium text-[var(--text-muted)] mt-1">Now Playing Globally</p>
        </div>
      </header>

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