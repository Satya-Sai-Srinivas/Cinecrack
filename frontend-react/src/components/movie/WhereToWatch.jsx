import { useQuery } from '@tanstack/react-query'
import { Tv, ExternalLink, Check } from 'lucide-react'
import { useAuth } from '@clerk/clerk-react'
import { useRegionStore } from '../../store/useAppStore'
import { fetchMovieProviders } from '../../api'

/** Streaming availability for a movie, highlighting services the user has. */
export default function WhereToWatch({ movieId }) {
  const { getToken, isSignedIn } = useAuth()
  const region = useRegionStore((s) => s.currentRegion)

  const { data } = useQuery({
    queryKey: ['movie-providers', movieId, region, isSignedIn],
    queryFn: async () => {
      const token = isSignedIn ? await getToken() : null
      return fetchMovieProviders(movieId, region, token)
    },
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(movieId),
  })

  const flatrate = data?.flatrate ?? []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Tv size={14} />
        <span className="font-semibold text-[var(--text-main)]">Where to watch</span>
        <span className="text-xs">({region})</span>
      </div>

      {flatrate.length > 0 ? (
        <div className="flex items-center gap-2 flex-wrap">
          {flatrate.map((p) => (
            <div
              key={p.provider_id}
              title={p.subscribed ? `${p.provider_name} — you have this` : p.provider_name}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${
                p.subscribed
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                  : 'border-[var(--border-color)] bg-[var(--surface)]'
              }`}
            >
              {p.logo_url && (
                <img src={p.logo_url} alt={p.provider_name} className="w-5 h-5 rounded object-cover" />
              )}
              <span className="text-xs font-semibold text-[var(--text-main)]">{p.provider_name}</span>
              {p.subscribed && <Check size={12} className="text-[var(--accent)]" />}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">Not on streaming in {region} right now.</p>
      )}

      {data?.link && (
        <a
          href={data.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 w-fit"
        >
          <ExternalLink size={11} /> All watch options
        </a>
      )}

      <p className="text-[10px] text-[var(--text-muted)]">Availability via JustWatch.</p>
    </div>
  )
}
