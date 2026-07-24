import { useQuery } from '@tanstack/react-query'
import { Bookmark } from 'lucide-react'
import { useAuth } from '@clerk/clerk-react'
import { fetchWatchlistMovies } from '../api'
import MovieCard from '../components/movie/MovieCard'
import { SkeletonGrid } from '../components/ui/SkeletonCard'
import { EmptyState } from '../components/ui/EmptyState'

export default function Watchlist() {
  const { getToken, isLoaded, isSignedIn } = useAuth()

  const { data: movies = [], isLoading, isError } = useQuery({
    // Prefix-matches ['watchlist'] so useWatchlist's invalidation refreshes this page too.
    queryKey: ['watchlist', 'movies'],
    queryFn: async () => {
      const token = await getToken()
      return fetchWatchlistMovies(token)
    },
    enabled: isLoaded && isSignedIn,
    staleTime: 60 * 1000,
  })

  if (isLoaded && !isSignedIn) {
    return (
      <div className="p-6 md:p-8 max-w-screen-xl">
        <EmptyState
          title="Sign in required"
          subtitle="Please sign in using the sidebar to view your watchlist."
        />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-screen-xl">
      <div className="flex items-center gap-2 mb-6">
        <Bookmark size={20} className="text-[var(--accent)]" />
        <h1 className="text-xl font-bold text-[var(--text-main)]">My Watchlist</h1>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : isError ? (
        <EmptyState title="Failed to load watchlist" subtitle="Please try again later." />
      ) : movies.length === 0 ? (
        <EmptyState
          title="Your watchlist is empty"
          subtitle="Tap the bookmark on any movie to save it here."
        />
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
