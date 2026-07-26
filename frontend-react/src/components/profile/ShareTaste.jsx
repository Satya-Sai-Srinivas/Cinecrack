import { useState } from 'react'
import { Share2, Copy, Check } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth, useUser } from '@clerk/clerk-react'
import { fetchShareLink, createShareLink, deleteShareLink } from '../../api'
import { useToast } from '../ui/Toast'

export default function ShareTaste() {
  const { getToken, isSignedIn } = useAuth()
  const { user } = useUser()
  const qc = useQueryClient()
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  const { data } = useQuery({
    queryKey: ['share-link'],
    queryFn: async () => fetchShareLink(await getToken()),
    enabled: isSignedIn,
  })

  const create = useMutation({
    mutationFn: async () =>
      createShareLink(await getToken(), user?.firstName || user?.fullName || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['share-link'] })
      toast?.('Your share link is ready!', 'success')
    },
    onError: () => toast?.('Could not create link. Try again.', 'error'),
  })

  const disable = useMutation({
    mutationFn: async () => deleteShareLink(await getToken()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['share-link'] })
      toast?.('Sharing disabled.', 'info')
    },
  })

  if (!isSignedIn) return null

  const slug = data?.slug
  const url = slug ? `${window.location.origin}/u/${slug}` : null

  const copy = () => {
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="mt-12 max-w-2xl border-t border-[var(--border-color)] pt-8">
      <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text-main)] mb-2">
        <Share2 size={18} className="text-[var(--accent)]" /> Share your taste
      </h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        A public page with your top genres, an AI summary of your taste, and your favorites.
        Friends can even blend their taste with yours for movie night.
      </p>

      {url ? (
        <>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              className="flex-1 px-3 py-2.5 text-sm rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-main)] focus:outline-none"
            />
            <button
              onClick={copy}
              className="px-3 py-2.5 rounded-xl bg-[var(--accent)] text-white shrink-0 flex items-center gap-2"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <div className="flex items-center gap-4 mt-3 text-sm">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] font-semibold">
              View my profile →
            </a>
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-50"
            >
              {create.isPending ? 'Refreshing…' : 'Refresh summary'}
            </button>
            <button
              onClick={() => disable.mutate()}
              className="text-[var(--text-muted)] hover:text-red-500"
            >
              Disable sharing
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white font-bold hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
        >
          {create.isPending ? 'Creating…' : 'Create share link'}
        </button>
      )}
    </section>
  )
}
