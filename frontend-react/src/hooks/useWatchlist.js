import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { fetchWatchlist, addToWatchlist, removeFromWatchlist } from '../api'
import { useToast } from '../components/ui/Toast'

/**
 * Shared, app-level watchlist state backed by React Query.
 *
 * Every MovieCard calls this hook, but the ['watchlist'] query is deduped and
 * cached, so it's a single network fetch. Because the cache lives above the
 * components, saved state survives card unmount/remount and always reflects
 * the server.
 */
export function useWatchlist() {
  const { getToken, isSignedIn } = useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: items = [] } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const token = await getToken()
      return fetchWatchlist(token)
    },
    enabled: Boolean(isSignedIn),
    staleTime: 60 * 1000,
  })

  const savedIds = new Set(items.map((i) => i.movie_id))

  const mutation = useMutation({
    mutationFn: async ({ movieId, saved }) => {
      const token = await getToken()
      return saved ? removeFromWatchlist(token, movieId) : addToWatchlist(token, movieId)
    },
    // Optimistic update so the bookmark flips instantly.
    onMutate: async ({ movieId, saved }) => {
      await queryClient.cancelQueries({ queryKey: ['watchlist'] })
      const prev = queryClient.getQueryData(['watchlist'])
      queryClient.setQueryData(['watchlist'], (old = []) =>
        saved
          ? old.filter((i) => i.movie_id !== movieId)
          : [...old, { movie_id: movieId, status: 'WATCHLIST' }]
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['watchlist'], ctx.prev)
      toast?.('Something went wrong. Please try again.', 'error')
    },
    onSuccess: (_data, { saved }) => {
      toast?.(saved ? 'Removed from watchlist' : 'Added to watchlist', 'success')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  const toggle = (movieId) => {
    if (!isSignedIn) {
      toast?.('Sign in to save movies', 'info')
      return
    }
    mutation.mutate({ movieId, saved: savedIds.has(movieId) })
  }

  return { savedIds, toggle, isPending: mutation.isPending, isSignedIn }
}
