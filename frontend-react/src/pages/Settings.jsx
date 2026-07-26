import { useState } from 'react'
import { Tv, Search } from 'lucide-react'
import { useAuth } from '@clerk/clerk-react'
import { useRegionStore } from '../store/useAppStore'
import ProviderToggles from '../components/movie/ProviderToggles'
import { EmptyState } from '../components/ui/EmptyState'

export default function Settings() {
  const { isLoaded, isSignedIn } = useAuth()
  const region = useRegionStore((s) => s.currentRegion)
  const [query, setQuery] = useState('')

  if (isLoaded && !isSignedIn) {
    return (
      <div className="p-6 md:p-8 max-w-screen-xl">
        <EmptyState
          title="Sign in required"
          subtitle="Please sign in to manage your streaming services."
        />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-screen-xl">
      <div className="flex items-center gap-2 mb-2">
        <Tv size={20} className="text-[var(--accent)]" />
        <h1 className="text-xl font-bold text-[var(--text-main)]">My Services</h1>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Toggle the streaming services you subscribe to in <strong>{region}</strong>. We'll use
        these to recommend movies you can actually watch.
      </p>

      <div className="relative max-w-sm mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services…"
          className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>

      <ProviderToggles query={query} />

      <p className="text-[11px] text-[var(--text-muted)] mt-8">
        Streaming availability data provided by JustWatch.
      </p>
    </div>
  )
}
