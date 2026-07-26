import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import {
  fetchWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  fetchReactions,
  setReaction,
  clearReaction,
} from '../api'
import { useToast } from '../components/ui/Toast'

/**
 * Shared, app-level movie status: watchlist ("want to see"), watched ("seen"),
 * and reactions (like / dislike). Letterboxd model — a movie lives in exactly
 * one of WATCHLIST / WATCHED, so marking watched auto-removes it from the
 * watchlist. Backed by two cached React Query queries, so state survives
 * remounts and stays in sync across every card.
 */
export function useMovieStatus() {
  const { getToken, isSignedIn } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const { data: watchlist = [] } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => fetchWatchlist(await getToken()),
    enabled: Boolean(isSignedIn),
    staleTime: 60 * 1000,
  })
  const { data: reactions = [] } = useQuery({
    queryKey: ['reactions'],
    queryFn: async () => fetchReactions(await getToken()),
    enabled: Boolean(isSignedIn),
    staleTime: 60 * 1000,
  })

  const savedIds = new Set(watchlist.filter((w) => w.status === 'WATCHLIST').map((w) => w.movie_id))
  const watchedIds = new Set(watchlist.filter((w) => w.status === 'WATCHED').map((w) => w.movie_id))
  const reactionOf = (movieId) => reactions.find((r) => r.movie_id === movieId)?.reaction ?? null

  // ---- Watchlist / watched (single row, status flips) ----
  const watchlistMutation = useMutation({
    mutationFn: async ({ movieId, action }) => {
      const token = await getToken()
      if (action === 'REMOVE') return removeFromWatchlist(token, movieId)
      return addToWatchlist(token, movieId, action) // 'WATCHLIST' | 'WATCHED'
    },
    onMutate: async ({ movieId, action }) => {
      await qc.cancelQueries({ queryKey: ['watchlist'] })
      const prev = qc.getQueryData(['watchlist'])
      qc.setQueryData(['watchlist'], (old = []) => {
        const rest = old.filter((w) => w.movie_id !== movieId)
        return action === 'REMOVE' ? rest : [...rest, { movie_id: movieId, status: action }]
      })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['watchlist'], ctx.prev)
      toast?.('Something went wrong. Please try again.', 'error')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] })
      qc.invalidateQueries({ queryKey: ['recommendations'] })
    },
  })

  // ---- Reactions (like / dislike / clear) ----
  const reactionMutation = useMutation({
    mutationFn: async ({ movieId, value }) => {
      const token = await getToken()
      return value === null ? clearReaction(token, movieId) : setReaction(token, movieId, value)
    },
    onMutate: async ({ movieId, value }) => {
      await qc.cancelQueries({ queryKey: ['reactions'] })
      const prev = qc.getQueryData(['reactions'])
      qc.setQueryData(['reactions'], (old = []) => {
        const rest = old.filter((r) => r.movie_id !== movieId)
        return value === null ? rest : [...rest, { movie_id: movieId, reaction: value }]
      })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['reactions'], ctx.prev)
      toast?.('Something went wrong. Please try again.', 'error')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['reactions'] })
      qc.invalidateQueries({ queryKey: ['recommendations'] })
    },
  })

  const requireAuth = () => {
    if (!isSignedIn) {
      toast?.('Sign in to track movies', 'info')
      return false
    }
    return true
  }

  const toggleSave = (movieId) => {
    if (!requireAuth()) return
    const saved = savedIds.has(movieId)
    watchlistMutation.mutate(
      { movieId, action: saved ? 'REMOVE' : 'WATCHLIST' },
      { onSuccess: () => toast?.(saved ? 'Removed from watchlist' : 'Added to watchlist', 'success') }
    )
  }

  const toggleWatched = (movieId) => {
    if (!requireAuth()) return
    const watched = watchedIds.has(movieId)
    watchlistMutation.mutate(
      { movieId, action: watched ? 'REMOVE' : 'WATCHED' },
      { onSuccess: () => toast?.(watched ? 'Removed from watched' : 'Marked as watched', 'success') }
    )
  }

  const setLike = (movieId, value) => {
    if (!requireAuth()) return
    const next = reactionOf(movieId) === value ? null : value
    reactionMutation.mutate(
      { movieId, value: next },
      {
        onSuccess: () =>
          toast?.(
            next === 'LIKE' ? 'Liked' : next === 'DISLIKE' ? 'Disliked' : 'Reaction removed',
            'success'
          ),
      }
    )
  }

  return {
    savedIds,
    watchedIds,
    reactionOf,
    toggleSave,
    toggleWatched,
    setLike,
    isSignedIn,
    isPending: watchlistMutation.isPending,
    reactionPending: reactionMutation.isPending,
  }
}
