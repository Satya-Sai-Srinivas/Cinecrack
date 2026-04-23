import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Camera, Cake, MapPin, ExternalLink } from 'lucide-react'
import { fetchPerson } from '../api'
import { SkeletonGrid } from '../components/ui/SkeletonCard'
import { EmptyState } from '../components/ui/EmptyState'

const PLACEHOLDER_PERSON = 'https://placehold.co/300x450/1e293b/94a3b8?text=No+Photo'
const PLACEHOLDER_POSTER = 'https://placehold.co/300x450/1e293b/94a3b8?text=No+Image'

export default function PersonProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const { data: person, isLoading, isError } = useQuery({
    queryKey: ['person', id],
    queryFn: () => fetchPerson(id),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(id),
  })

  const goBack = () => {
    const from = location.state?.from
    if (from) navigate(from)
    else navigate(-1)
  }

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-screen-xl">
        <BackButton onClick={goBack} />
        <div className="flex gap-8 mt-6 mb-8">
          <div className="skeleton w-40 h-60 rounded-2xl shrink-0" />
          <div className="flex flex-col gap-3 flex-1 pt-4">
            <div className="skeleton h-8 w-1/3 rounded" />
            <div className="skeleton h-4 w-1/4 rounded" />
            <div className="skeleton h-4 w-1/4 rounded" />
            <div className="skeleton h-20 w-full rounded mt-2" />
          </div>
        </div>
        <SkeletonGrid count={8} />
      </div>
    )
  }

  if (isError || !person) {
    return (
      <div className="p-6 md:p-8">
        <BackButton onClick={goBack} />
        <EmptyState title="Profile not found" subtitle="Could not load this person's profile." />
      </div>
    )
  }

  const s = person.social_handles ?? {}

  return (
    <div className="p-6 md:p-8 max-w-screen-xl">
      <BackButton onClick={goBack} />

      {/* Hero */}
      <div className="flex flex-col sm:flex-row gap-6 mt-6 mb-10">
        <img
          src={person.profile_url || PLACEHOLDER_PERSON}
          alt={person.name}
          className="w-36 h-52 sm:w-44 sm:h-64 object-cover rounded-2xl border border-[var(--border-color)] shadow-md shrink-0"
          onError={(e) => { e.target.src = PLACEHOLDER_PERSON }}
        />
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-extrabold text-[var(--text-main)]">{person.name}</h1>

          <div className="flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
            {person.known_for_department && (
              <span className="flex items-center gap-1.5">
                <Camera size={13} /> {person.known_for_department}
              </span>
            )}
            {person.birthday && (
              <span className="flex items-center gap-1.5">
                <Cake size={13} /> {person.birthday}
              </span>
            )}
            {person.place_of_birth && (
              <span className="flex items-center gap-1.5">
                <MapPin size={13} /> {person.place_of_birth}
              </span>
            )}
          </div>

          {/* Social handles */}
          {Object.values(s).some(Boolean) && (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {s.wikipedia && <SocialLink href={s.wikipedia} label="Wikipedia" />}
              {s.instagram && <SocialLink href={s.instagram} label="Instagram" />}
              {s.twitter   && <SocialLink href={s.twitter}   label="Twitter/X" />}
              {s.facebook  && <SocialLink href={s.facebook}  label="Facebook" />}
              {s.imdb      && <SocialLink href={s.imdb}      label="IMDb" />}
            </div>
          )}

          {person.biography && (
            <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-2xl line-clamp-6 mt-2">
              {person.biography}
            </p>
          )}
        </div>
      </div>

      {/* Filmography */}
      <h2 className="text-lg font-bold text-[var(--text-main)] mb-4">Filmography</h2>
      {person.credits?.length === 0 ? (
        <EmptyState title="No filmography data available." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 w-full">
          {person.credits.map((credit) => (
            <Link
              key={credit.id}
              to={`/movie/${credit.id}`}
              state={{ from: `/person/${id}` }}
              className="group block"
            >
              <div className="relative overflow-hidden rounded-xl aspect-[2/3] bg-[var(--surface)] border border-[var(--border-color)] shadow-sm transition-transform duration-200 group-hover:-translate-y-1">
                <img
                  src={credit.poster_url || PLACEHOLDER_POSTER}
                  alt={credit.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => { e.target.src = PLACEHOLDER_POSTER }}
                />
              </div>
              <div className="mt-2 px-0.5">
                <p className="text-sm font-semibold text-[var(--text-main)] line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                  {credit.title}
                </p>
                {credit.role && (
                  <p className="text-xs text-[var(--accent)] font-medium mt-0.5">{credit.role}</p>
                )}
                <p className="text-xs text-[var(--text-muted)]">
                  {credit.release_date ? credit.release_date.slice(0, 4) : 'Upcoming'}
                </p>
              </div>
            </Link>
          ))}
        </div>
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

function SocialLink({ href, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium border border-[var(--border-color)] px-2.5 py-1 rounded-lg hover:border-[var(--accent)] transition-colors"
    >
      <ExternalLink size={11} /> {label}
    </a>
  )
}