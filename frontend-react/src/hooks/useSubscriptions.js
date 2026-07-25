import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { useRegionStore } from '../store/useAppStore'
import {
  fetchProviders,
  fetchSubscriptions,
  addSubscription,
  removeSubscription,
} from '../api'
import { useToast } from '../components/ui/Toast'

/**
 * Streaming subscriptions for the user's current region (the Home country
 * selector). Providers come from a cached TMDB list; subscriptions are stored
 * per-region and toggled optimistically.
 */
export function useSubscriptions() {
  const { getToken, isSignedIn } = useAuth()
  const region = useRegionStore((s) => s.currentRegion)
  const qc = useQueryClient()
  const toast = useToast()

  const { data: providers = [], isLoading: providersLoading } = useQuery({
    queryKey: ['providers', region],
    queryFn: () => fetchProviders(region),
    staleTime: Infinity,
  })

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => fetchSubscriptions(await getToken()),
    enabled: Boolean(isSignedIn),
    staleTime: 60 * 1000,
  })

  const subscribedIds = new Set(
    subscriptions.filter((s) => s.region === region).map((s) => s.provider_id)
  )

  const mutation = useMutation({
    mutationFn: async ({ provider, subscribed }) => {
      const token = await getToken()
      return subscribed
        ? removeSubscription(token, provider.provider_id, region)
        : addSubscription(token, {
            provider_id: provider.provider_id,
            provider_name: provider.provider_name,
            region,
          })
    },
    onMutate: async ({ provider, subscribed }) => {
      await qc.cancelQueries({ queryKey: ['subscriptions'] })
      const prev = qc.getQueryData(['subscriptions'])
      qc.setQueryData(['subscriptions'], (old = []) =>
        subscribed
          ? old.filter((s) => !(s.provider_id === provider.provider_id && s.region === region))
          : [...old, { provider_id: provider.provider_id, provider_name: provider.provider_name, region }]
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['subscriptions'], ctx.prev)
      toast?.('Something went wrong. Please try again.', 'error')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  })

  const toggle = (provider) => {
    if (!isSignedIn) {
      toast?.('Sign in to save your services', 'info')
      return
    }
    mutation.mutate({ provider, subscribed: subscribedIds.has(provider.provider_id) })
  }

  return {
    providers,
    providersLoading,
    subscribedIds,
    subscriptions,
    toggle,
    region,
    isSignedIn,
    isPending: mutation.isPending,
  }
}
