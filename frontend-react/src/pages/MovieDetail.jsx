import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { ArrowLeft, Play, ExternalLink, Calendar, Tv, User } from 'lucide-react'
import { fetchMovieDetail } from '../api'
import { useRegionStore } from '../store/useAppStore'
import MovieActions from '../components/movie/MovieActions'

const PLACEHOLDER_POSTER = 'https://placehold.co/300x450/1e293b/94a3b8?text=No+Image'
const PLACEHOLDER_PERSON = 'https://placehold.co/150x225/1e293b/94a3b8?text=No+Image'

function PersonCard({ person, movieId }) {
  return (
    <Link
      to={`/person/${person.id}`}
      state={{ from: `/movie/${movieId}` }}
      className="group flex flex-col items-center text-center w-28 shrink-0"
    >
      <div className="w-20 h-28 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface)] mb-2 group-hover:border-[var(--accent)] transition-colors">
        <img
          src={person.image_url || PLACEHOLDER_PERSON}
          alt={person.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          loading="lazy"
          onError={(e) => { e.target.src = PLACEHOLDER_PERSON }}
        />
      </div>
      <p className="text-xs font-semibold text-[var(--text-main)] line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
        {person.name}
      </p>
      <p className="text-[11px] text-[var(--accent)] font-medium mt-0.5">
        {person.character_name || person.job}
      </p>
      {person.well_known_for?.length > 0 && (
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 line-clamp-2">
          {person.well_known_for.map((w) => `${w.title} (${w.release_year ?? 'N/A'})`).join(', ')}
        </p>
      )}
    </Link>
  )
}

export default function MovieDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getToken, isSignedIn } = useAuth()
  const { currentRegion } = useRegionStore()

  const { data: movie, isLoading, isError } = useQuery({
    queryKey: ['movie', id, currentRegion],
    queryFn: async () => {
      const token = isSignedIn ? await getToken() : null
      return fetchMovieDetail(id, currentRegion, token)
    },
    staleTime: 15 * 60 * 1000,
    enabled: Boolean(id),
  })

  const goBack = () => {
    navigate(-1);
  }

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-screen-xl">
        <BackButton onClick={goBack} />
        <div className="flex flex-col md:flex-row gap-8 mt-6">
          <div className="skeleton w-44 h-64 rounded-2xl shrink-0" />
          <div className="flex flex-col gap-3 flex-1">
            <div className="skeleton h-9 w-1/2 rounded" />
            <div className="skeleton h-4 w-1/3 rounded" />
            <div className="skeleton h-24 w-full rounded mt-2" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !movie) {
    return (
      <div className="p-6 md:p-8">
        <BackButton onClick={goBack} />
        <div className="mt-8 text-center">
          <p className="text-[var(--text-muted)]">Movie not found or failed to load.</p>
          <button onClick={goBack} className="mt-4 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm">
            Go back
          </button>
        </div>
      </div>
    )
  }

  const { release_details } = movie

  return (
    <div className="p-6 md:p-8 max-w-screen-xl">
      <BackButton onClick={goBack} />

      {/* Hero section */}
      <div className="flex flex-col md:flex-row gap-8 mt-6 mb-10">
        <img
          src={movie.poster_url || PLACEHOLDER_POSTER}
          alt={movie.title}
          className="w-44 md:w-52 rounded-2xl border border-[var(--border-color)] shadow-lg object-cover self-start shrink-0"
          onError={(e) => { e.target.src = PLACEHOLDER_POSTER }}
        />

        <div className="flex flex-col gap-4 flex-1">
          <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--text-main)] leading-tight">
            {movie.title}
          </h1>

          {/* Genres */}
          {movie.genres?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {movie.genres.map((g) => (
                <span
                  key={g}
                  className="text-xs font-medium px-2.5 py-1 rounded-full border border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-muted)]"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Release info */}
          <div className="flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
            {release_details?.theatrical_release_date && (
              <span className="flex items-center gap-1.5">
                <Calendar size={13} />
                {release_details.theatrical_release_date}
              </span>
            )}
          </div>

          {/* OTT platforms */}
          {release_details?.available_on?.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tv size={14} className="text-[var(--text-muted)]" />
              {release_details.available_on.map((p) => (
                <a
                  key={p.name}
                  href={p.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] border border-[var(--border-color)] px-2.5 py-1 rounded-lg hover:border-[var(--accent)] transition-colors"
                >
                  {p.name}
                </a>
              ))}
            </div>
          )}
          {release_details?.available_on?.length === 0 && (
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
              <Tv size={13} /> Not currently available to stream.
            </p>
          )}

          {/* User actions: Watchlist / Watched / Like / Dislike */}
          <MovieActions movieId={movie.id} />

          {/* Storyline */}
          {movie.storyline && (
            <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-2xl">
              {movie.storyline}
            </p>
          )}

          {/* Action links */}
          <div className="flex flex-wrap gap-3 mt-2">
            {movie.trailer_url && (
              <ActionLink href={movie.trailer_url} icon={<Play size={15} />} label="Watch Trailer" />
            )}
            {movie.wikipedia_url && (
              <ActionLink href={movie.wikipedia_url} icon={<ExternalLink size={15} />} label="Wikipedia" />
            )}
          </div>
        </div>
      </div>

      {/* Cast */}
      {movie.lead_cast?.length > 0 && (
        <Section title="Lead Cast" icon={<User size={16} />}>
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2">
            {movie.lead_cast.map((p) => (
              <PersonCard key={p.id} person={p} movieId={id} />
            ))}
          </div>
        </Section>
      )}

      {/* Technicians */}
      {movie.technicians?.length > 0 && (
        <Section title="Crew & Technicians" icon={<User size={16} />}>
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2">
            {movie.technicians.map((p) => (
              <PersonCard key={p.id} person={p} movieId={id} />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function BackButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
    >
      <ArrowLeft size={16} /> Back
    </button>
  )
}

function ActionLink({ href, icon, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-sm font-medium text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
    >
      {icon} {label}
    </a>
  )
}

function Section({ title, icon, children }) {
  return (
    <section className="mb-10">
      <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text-main)] mb-4">
        {icon} {title}
      </h2>
      {children}
    </section>
  )
}
