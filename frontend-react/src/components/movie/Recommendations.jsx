import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useAuth } from '@clerk/clerk-react'
import { useRegionStore } from '../../store/useAppStore'
import { fetchRecommendations } from '../../api'
import MovieCard from './MovieCard'

const PLACEHOLDER = 'https://placehold.co/300x450/1e293b/94a3b8?text=No+Image'

/** Signed-in personalized shelf: Movie of the Day hero + a "Top picks" row. */
export default function Recommendations() {
  const { getToken, isSignedIn } = useAuth()
  const region = useRegionStore((s) => s.currentRegion)

  const { data, isLoading } = useQuery({
    queryKey: ['recommendations', region],
    queryFn: async () => fetchRecommendations(await getToken(), region),
    enabled: isSignedIn,
    staleTime: 30 * 60 * 1000,
  })

  if (!isSignedIn) return null

  if (isLoading) {
    return (
      <section className="mb-12">
        <div className="skeleton h-40 w-full max-w-2xl rounded-2xl mb-6" />
        <div className="flex gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3] w-[150px] rounded-xl shrink-0" />
          ))}
        </div>
      </section>
    )
  }

  if (!data || (!data.movie_of_the_day && !data.picks?.length)) return null

  const { cold_start, movie_of_the_day, picks = [] } = data

  return (
    <section className="mb-12">
      {cold_start && (
        <div className="mb-6 p-4 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-sm text-[var(--text-main)]">
          Like, watch, or save a few movies to unlock recommendations tuned to your taste.
          For now, here's what's popular.
        </div>
      )}

      {movie_of_the_day && (
        <MovieOfTheDay card={movie_of_the_day} coldStart={cold_start} />
      )}

      {picks.length > 0 && (
        <>
          <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text-main)] mb-4">
            <Sparkles size={18} className="text-[var(--accent)]" />
            {cold_start ? 'Popular right now' : 'Top picks for you'}
          </h2>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 snap-row">
            {picks.map((pick) => (
              <div key={pick.id} className="w-[150px] shrink-0">
                <MovieCard movie={pick} />
                {pick.reason && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-1.5 line-clamp-2">{pick.reason}</p>
                )}
                {pick.available === false && (
                  <p className="text-[10px] text-[var(--text-muted)] italic">Not on your services</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function MovieOfTheDay({ card, coldStart }) {
  const year = card.release_date ? new Date(card.release_date).getFullYear() : null
  return (
    <Link to={`/movie/${card.id}`} className="block mb-8 group">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[var(--accent)] mb-3">
        <Sparkles size={13} /> {coldStart ? 'Popular Pick' : 'Movie of the Day'}
      </p>
      <div className="flex gap-5 p-4 rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--accent)] hover:shadow-lg transition-all max-w-2xl">
        <img
          src={card.poster_url || PLACEHOLDER}
          alt={card.title}
          className="w-28 md:w-36 rounded-xl object-cover shrink-0"
          onError={(e) => { e.target.src = PLACEHOLDER }}
        />
        <div className="flex flex-col justify-center gap-2">
          <h3 className="text-2xl font-black text-[var(--text-main)] group-hover:text-[var(--accent)] transition-colors leading-tight">
            {card.title}
          </h3>
          {year && <p className="text-sm text-[var(--text-muted)] font-semibold">{year}</p>}
          {(card.why || card.reason) && (
            <p className="text-sm text-[var(--accent)] font-medium">{card.why || card.reason}</p>
          )}
          {card.available === false && (
            <p className="text-xs text-[var(--text-muted)] italic">Not on your services</p>
          )}
        </div>
      </div>
    </Link>
  )
}
