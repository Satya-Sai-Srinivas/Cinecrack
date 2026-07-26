import { useState, useCallback } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { fetchNowPlaying, fetchSearchMovies, fetchCountries, fetchLanguages } from '../api'
import { useRegionStore } from '../store/useAppStore'
import { useIntersectionObserver } from '../hooks/useInfiniteScroll'
import MovieCard from '../components/movie/MovieCard'
import Recommendations from '../components/movie/Recommendations'
import { SkeletonGrid } from '../components/ui/SkeletonCard'
import { EmptyState } from '../components/ui/EmptyState'

function getSectionTitle({ countryName, languageName, searchQuery }) {
  if (searchQuery) {
    return `Results for "${searchQuery}"`
  }
  const where = countryName || 'Theaters'
  return languageName
    ? `Now Playing in ${where} (${languageName})`
    : `Now Playing in ${where}`
}

export default function Home() {
  const { currentRegion, currentLang, setRegion, setLang } = useRegionStore()

  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const isSearchMode = Boolean(searchQuery)

  // ---------- Country / language options (cached TMDB config) ----------
  const { data: countries = [] } = useQuery({
    queryKey: ['config', 'countries'],
    queryFn: fetchCountries,
    staleTime: Infinity,
  })
  const { data: languages = [] } = useQuery({
    queryKey: ['config', 'languages'],
    queryFn: fetchLanguages,
    staleTime: Infinity,
  })

  const countryName = countries.find((c) => c.code === currentRegion)?.name
  const languageName =
    currentLang !== 'all' ? languages.find((l) => l.code === currentLang)?.name : null

  // ---------- Infinite query: now-playing ----------
  const nowPlayingQuery = useInfiniteQuery({
    queryKey: ['now-playing', currentRegion, currentLang],
    queryFn: ({ pageParam = 1 }) =>
      fetchNowPlaying({ region: currentRegion, lang: currentLang, page: pageParam }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < 20 ? undefined : pages.length + 1,
    staleTime: 5 * 60 * 1000,
    enabled: !isSearchMode,
  })

  // ---------- Infinite query: search ----------
  const searchResultsQuery = useInfiniteQuery({
    queryKey: ['search', searchQuery],
    queryFn: ({ pageParam = 1 }) =>
      fetchSearchMovies({ query: searchQuery, page: pageParam }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < 20 ? undefined : pages.length + 1,
    staleTime: 2 * 60 * 1000,
    enabled: isSearchMode,
  })

  const activeQuery = isSearchMode ? searchResultsQuery : nowPlayingQuery
  const movies = activeQuery.data?.pages.flat() ?? []
  const isLoading = activeQuery.isLoading
  const isError = activeQuery.isError
  const isFetchingNext = activeQuery.isFetchingNextPage
  const hasNextPage = activeQuery.hasNextPage

  // Sentinel for infinite scroll
  const sentinelRef = useIntersectionObserver(
    useCallback(() => {
      if (hasNextPage && !isFetchingNext) activeQuery.fetchNextPage()
    }, [hasNextPage, isFetchingNext, activeQuery])
  )

  // ---------- Search handlers ----------
  const handleSearch = useCallback(() => {
    const q = searchInput.trim()
    if (!q) return
    setSearchQuery(q)
  }, [searchInput])

  const handleClearSearch = useCallback(() => {
    setSearchInput('')
    setSearchQuery('')
  }, [])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
  }

  const sectionTitle = getSectionTitle({ countryName, languageName, searchQuery })

  return (
    <main className="flex-1 h-screen overflow-y-auto bg-[var(--bg-color)] transition-colors duration-300">
      <div className="w-full max-w-[1600px] p-6 md:p-10">
        
        {/* Search bar Area */}
        <section className="flex flex-col md:flex-row gap-4 mb-10 w-full max-w-4xl">
        <div className="relative flex-1 group">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search movies, actors, or genres..."
              className="w-full pl-12 pr-12 py-3.5 text-sm rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-main)] shadow-sm focus:ring-4 focus:ring-[var(--accent)]/10 focus:border-[var(--accent)] transition-all outline-none"
            />
            {searchInput && (
              <button onClick={handleClearSearch} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-red-500 transition-colors">
                <X size={18} />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="px-8 py-3.5 rounded-2xl bg-[var(--accent)] text-white font-bold shadow-lg shadow-[var(--accent)]/20 hover:bg-[var(--accent-hover)] hover:-translate-y-0.5 active:translate-y-0 transition-all"
          >
            Search
          </button>
        </section>

        {/* Personalized recommendations (signed-in only) */}
        {!isSearchMode && <Recommendations />}

        {/* Filters: Country + Language */}
        {!isSearchMode && (
          <div className="flex flex-col sm:flex-row gap-4 mb-10 w-full max-w-2xl">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Country</label>
              <select
                value={currentRegion}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10 transition-all"
              >
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Language</label>
              <select
                value={currentLang}
                onChange={(e) => setLang(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10 transition-all"
              >
                <option value="all">All Languages</option>
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Dynamic Title Bar */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-[var(--text-main)] tracking-tight">{sectionTitle}</h1>
            <div className="h-1 w-12 bg-[var(--accent)] rounded-full mt-2" />
          </div>
          {isSearchMode && (
            <button
              onClick={handleClearSearch}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-main)] transition-all flex items-center gap-2"
            >
              <X size={16} /> Exit Search
            </button>
          )}
        </header>

        {/* Results Grid */}
        <section className="min-h-[400px]">
          {isLoading ? (
            <SkeletonGrid />
          ) : isError ? (
            <EmptyState
              title="Connection Lost"
              subtitle="We couldn't reach the cinematic archives. Check your internet."
              action={
                <button
                  onClick={() => activeQuery.refetch()}
                  className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white font-bold hover:bg-[var(--accent-hover)] transition-all"
                >
                  Retry Connection
                </button>
              }
            />
          ) : movies.length === 0 ? (
            <EmptyState
              title={isSearchMode ? `No matches for "${searchQuery}"` : 'The marquee is empty'}
              subtitle={isSearchMode ? 'Try a different title, actor, or vibe.' : 'Check back shortly for new releases.'}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-6 animate-in fade-in duration-700 w-full">
  {movies.map(movie => (
    <MovieCard key={movie.id} movie={movie} />
  ))}
</div>

              {/* Infinite Scroll Sentinel */}
              <div ref={sentinelRef} className="h-20 flex items-center justify-center">
                {isFetchingNext && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Loading more</span>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

