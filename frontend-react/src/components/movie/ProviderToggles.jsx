import { Check } from 'lucide-react'
import { useSubscriptions } from '../../hooks/useSubscriptions'

/** Reusable grid of streaming-provider toggles (used by Settings + onboarding). */
export default function ProviderToggles({ limit, query = '' }) {
  const { providers, providersLoading, subscribedIds, toggle, isPending } = useSubscriptions()

  let list = providers
  if (query) {
    const q = query.toLowerCase()
    list = list.filter((p) => p.provider_name.toLowerCase().includes(q))
  }
  if (limit) list = list.slice(0, limit)

  if (providersLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading services…</p>
  }
  if (!list.length) {
    return <p className="text-sm text-[var(--text-muted)]">No services found.</p>
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {list.map((p) => {
        const on = subscribedIds.has(p.provider_id)
        return (
          <button
            key={p.provider_id}
            onClick={() => toggle(p)}
            disabled={isPending}
            className={`relative flex items-center gap-3 p-3 rounded-xl border text-left transition-all disabled:opacity-60 ${
              on
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 ring-2 ring-[var(--accent)]/30'
                : 'border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--accent)]'
            }`}
          >
            {p.logo_url && (
              <img
                src={p.logo_url}
                alt={p.provider_name}
                className="w-8 h-8 rounded-lg object-cover shrink-0"
              />
            )}
            <span className="text-sm font-semibold text-[var(--text-main)] line-clamp-2">
              {p.provider_name}
            </span>
            {on && (
              <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center">
                <Check size={12} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
