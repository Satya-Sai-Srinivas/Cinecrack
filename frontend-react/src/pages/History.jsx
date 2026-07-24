import { useQuery } from '@tanstack/react-query'
import { History as HistoryIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '@clerk/clerk-react'
import { fetchHistory } from '../api'

export default function History() {
  // Grab the auth details from Clerk
  const { getToken, isLoaded, isSignedIn } = useAuth()

  // Securely fetch the history using the Clerk JWT
  const { data, isLoading, isError } = useQuery({
    queryKey: ['history'],
    queryFn: async () => {
      const token = await getToken()
      return fetchHistory(token)
    },
    enabled: isLoaded && isSignedIn, // Only fetch if Clerk is ready AND the user is logged in
    staleTime: 60 * 1000,
  })

  // Show a clean message if they aren't logged in
  if (isLoaded && !isSignedIn) {
    return (
      <div className="p-6 md:p-8 max-w-screen-xl">
        <EmptyState 
          title="Sign in required" 
          subtitle="Please sign in using the sidebar to view your history." 
        />
      </div>
    )
  }

  // Deduplicate by movie_id (matches vanilla JS behaviour)
  const unique = []
  const seen = new Set()
  for (const item of data ?? []) {
    if (!seen.has(item.movie_id)) {
      seen.add(item.movie_id)
      unique.push(item)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-screen-xl">
      <div className="flex items-center gap-2 mb-6">
        <HistoryIcon size={20} className="text-[var(--accent)]" />
        <h1 className="text-xl font-bold text-[var(--text-main)]">Recent History</h1>
      </div>

      {isLoading ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-28 rounded-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState title="Failed to load history" subtitle="Please try again later." />
      ) : unique.length === 0 ? (
        <EmptyState title="No history yet" subtitle="Movies you view will appear here." />
      ) : (
        <div className="flex flex-wrap gap-2">
          {unique.slice(0, 20).map((h) => (
            <Link
              key={h.movie_id}
              to={`/movie/${h.movie_id}`}
              className="px-4 py-2 rounded-full border border-[var(--border-color)] bg-[var(--surface)] text-sm text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors font-medium"
            >
              {h.movie_title}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}