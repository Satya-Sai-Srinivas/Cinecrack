import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { fetchSubscriptions } from '../api'
import ProviderToggles from './movie/ProviderToggles'

const KEY = 'cinecrack-services-onboarded'

/** One-time nudge after first sign-in to pick streaming services. */
export default function ServicesOnboarding() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(KEY) === '1')
  const [open, setOpen] = useState(false)

  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => fetchSubscriptions(await getToken()),
    enabled: isLoaded && isSignedIn && !dismissed,
    staleTime: 60 * 1000,
  })

  // Open once when a signed-in user with no services first loads. Stays open
  // when they toggle their first service — only closing the modal dismisses it.
  useEffect(() => {
    if (isLoaded && isSignedIn && !dismissed && !isLoading && subscriptions.length === 0) {
      setOpen(true)
    }
  }, [isLoaded, isSignedIn, dismissed, isLoading, subscriptions.length])

  const close = () => {
    localStorage.setItem(KEY, '1')
    setDismissed(true)
    setOpen(false)
  }

  if (!open || dismissed) return null

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--bg-color)] border border-[var(--border-color)] shadow-2xl p-6">
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-xl font-black text-[var(--text-main)]">Which services do you have?</h2>
          <button onClick={close} className="text-[var(--text-muted)] hover:text-[var(--text-main)]">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-5">
          Pick your streaming subscriptions so we can recommend movies you can actually watch.
          You can change these anytime in <strong>My Services</strong>.
        </p>

        <ProviderToggles limit={12} />

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={close}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)]"
          >
            Skip for now
          </button>
          <button
            onClick={close}
            className="px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
