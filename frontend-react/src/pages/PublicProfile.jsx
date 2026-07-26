import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, Users, Film } from 'lucide-react'
import { useAuth } from '@clerk/clerk-react'
import { fetchPublicProfile, fetchBlend } from '../api'
import MovieCard from '../components/movie/MovieCard'
import { EmptyState } from '../components/ui/EmptyState'

export default function PublicProfile() {
  const { slug } = useParams()
  const { getToken, isSignedIn } = useAuth()
  const [blend, setBlend] = useState(null)
  const [blending, setBlending] = useState(false)

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['public-profile', slug],
    queryFn: () => fetchPublicProfile(slug),
  })

  const runBlend = async () => {
    setBlending(true)
    try {
      setBlend(await fetchBlend(await getToken(), slug))
    } catch {
      setBlend({ error: true })
    } finally {
      setBlending(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-color)]">
        <div className="w-8 h-8 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className="min-h-screen bg-[var(--bg-color)]">
        <Header />
        <EmptyState title="Profile not found" subtitle="This share link may have been disabled." />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-main)]">
      <Header />
      <main className="max-w-4xl mx-auto p-6 md:p-10">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent)] mb-2">Cinecrack taste profile</p>
        <h1 className="text-3xl md:text-4xl font-black mb-2">{profile.display_name}</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          {profile.stats?.liked ?? 0} liked · {profile.stats?.watched ?? 0} watched
        </p>

        {profile.taste_summary && (
          <div className="mb-8 p-5 rounded-2xl border border-[var(--border-color)] bg-[var(--surface)]">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--accent)] mb-2">
              <Sparkles size={13} /> Their taste
            </p>
            <p className="text-base leading-relaxed">{profile.taste_summary}</p>
          </div>
        )}

        {profile.top_genres?.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wide mb-3">Top genres</h2>
            <div className="flex flex-wrap gap-2">
              {profile.top_genres.map((g) => (
                <span key={g} className="px-3 py-1.5 rounded-full border border-[var(--border-color)] bg-[var(--surface)] text-sm font-semibold">
                  {g}
                </span>
              ))}
            </div>
          </div>
        )}

        {profile.favorites?.length > 0 && (
          <div className="mb-12">
            <h2 className="flex items-center gap-2 text-lg font-bold mb-4">
              <Film size={18} className="text-[var(--accent)]" /> Favorites
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {profile.favorites.map((m) => (
                <MovieCard key={m.id} movie={m} />
              ))}
            </div>
          </div>
        )}

        {/* What should we watch — blend */}
        <div className="border-t border-[var(--border-color)] pt-8">
          <h2 className="flex items-center gap-2 text-lg font-bold mb-3">
            <Users size={18} className="text-[var(--accent)]" /> What should we watch?
          </h2>
          {!isSignedIn ? (
            <p className="text-sm text-[var(--text-muted)]">
              <Link to="/" className="text-[var(--accent)] font-semibold">Sign in</Link> to blend your taste with {profile.display_name} and get shared picks.
            </p>
          ) : (
            <>
              <button
                onClick={runBlend}
                disabled={blending}
                className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white font-bold hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
              >
                {blending ? 'Blending…' : 'Blend with my taste'}
              </button>

              {blend?.error && (
                <p className="text-sm text-red-500 mt-4">Something went wrong. Please try again.</p>
              )}
              {blend?.cold_start && (
                <p className="text-sm text-[var(--text-muted)] mt-4">
                  One of you hasn't rated enough movies yet to blend. Like or watch a few first!
                </p>
              )}
              {blend?.picks?.length > 0 && (
                <div className="mt-6">
                  <p className="text-sm text-[var(--text-muted)] mb-3">Picks for you and {blend.with_name}:</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                    {blend.picks.map((m) => (
                      <MovieCard key={m.id} movie={m} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-10 h-14 flex items-center px-6 border-b border-[var(--border-color)] bg-[var(--bg-color)]/80 backdrop-blur-xl">
      <Link
        to="/"
        className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-main)] to-[var(--accent)] tracking-tight"
      >
        Cinecrack
      </Link>
    </header>
  )
}
