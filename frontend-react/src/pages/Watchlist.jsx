import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bookmark, Check } from 'lucide-react'
import { useAuth } from '@clerk/clerk-react'
import { fetchWatchlistMovies } from '../api'
import MovieCard from '../components/movie/MovieCard'
import { SkeletonGrid } from '../components/ui/SkeletonCard'
import { EmptyState } from '../components/ui/EmptyState'

const TABS = [
  { key: 'WATCHLIST', label: 'Watchlist', icon: Bookmark },
  { key: 'WATCHED', label: 'Watched', icon: Check },
]

export default function Watchlist() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [tab, setTab] = useState('WATCHLIST')

  const { data: movies = [], isLoading, isError } = useQuery({
    // Prefix-matches ['watchlist'] so useMovieStatus's invalidation refreshes this page too.
    queryKey: ['watchlist', 'movies', tab],
    queryFn: async () => fetchWatchlistMovies(await getToken(), tab),
    enabled: isLoaded && isSignedIn,
    staleTime: 60 * 1000,
  })

  if (isLoaded && !isSignedIn) {
    return (
      <div className="p-6 md:p-8 max-w-screen-xl">
        <EmptyState
          title="Sign in required"
          subtitle="Please sign in using the sidebar to view your lists."
        />
      </div>
    )
  }

  const emptyCopy =
    tab === 'WATCHLIST'
      ? { title: 'Your watchlist is empty', subtitle: 'Tap the bookmark on any movie to save it here.' }
      : { title: 'Nothing marked watched yet', subtitle: 'Tap the check on a movie once you’ve seen it.' }

  return (
    <div className="p-6 md:p-8 max-w-screen-xl">
      <h1 className="text-xl font-bold text-[var(--text-main)] mb-6">My Movies</h1>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-8">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
              tab === key
                ? 'bg-[var(--accent)] border-[var(--accent)] text-white shadow-md'
                : 'bg-[var(--surface)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : isError ? (
        <EmptyState title="Failed to load" subtitle="Please try again later." />
      ) : movies.length === 0 ? (
        <EmptyState title={emptyCopy.title} subtitle={emptyCopy.subtitle} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 w-full">
          {movies.map((m) => (
            <MovieCard key={m.id} movie={m} />
          ))}
        </div>
      )}
    </div>
  )
}
