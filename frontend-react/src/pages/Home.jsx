import { useState, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Search, X, MapPin } from 'lucide-react'
import { fetchNowPlaying, fetchSearchMovies } from '../api'
import { useRegionStore } from '../store/useAppStore'
import { useLocationDetect } from '../hooks/useLocation'
import { useIntersectionObserver } from '../hooks/useInfiniteScroll'
import { MovieCard } from '../components/movie/MovieCard'
import { SkeletonGrid } from '../components/ui/SkeletonCard'
import { EmptyState } from '../components/ui/EmptyState'

const LANG_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'te',  label: 'Telugu' },
  { value: 'hi',  label: 'Hindi' },
  { value: 'ta',  label: 'Tamil' },
  { value: 'ml',  label: 'Malayalam' },
]

function getSectionTitle({ currentRegion, currentCity, currentLang, searchQuery, searchCount }) {
  if (searchQuery) {
    return searchCount !== undefined
      ? `Results for "${searchQuery}" (${searchCount})`
      : `Results for "${searchQuery}"`
  }
  if (currentCity) return `Now Playing in ${currentCity} Theaters`
  if (currentRegion === 'US') return 'Now Playing in US Theaters'
  if (currentRegion === 'IN') {
    const names = { all: 'Indian', te: 'Telugu', hi: 'Hindi', ta: 'Tamil', ml: 'Malayalam' }
    return `Now Playing in Theaters (${names[currentLang] ?? currentLang})`
  }
  return `Now Playing in Theaters (${currentRegion})`
}

export default function Home() {
  useLocationDetect()

  const { currentRegion, currentLang, currentCity, detectedRegion, detectedCity, setRegion, setLang } =
    useRegionStore()

  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const isSearchMode = Boolean(searchQuery)

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

  // ---------- Market switching ----------
  const handleMarket = useCallback(
    (target) => {
      if (target === 'LOCAL') {
        setRegion(detectedRegion, detectedCity)
      } else {
        setRegion(target)
      }
      if (isSearchMode) handleClearSearch()
    },
    [detectedRegion, detectedCity, setRegion, isSearchMode, handleClearSearch]
  )

  // Determine active market button
  const activeMarket =
    currentCity && currentCity === detectedCity
      ? 'LOCAL'
      : currentRegion

  const totalCount = isSearchMode ? movies.length : undefined
  const sectionTitle = getSectionTitle({
    currentRegion,
    currentCity,
    currentLang,
    searchQuery,
    searchCount: totalCount,
  })

  return (
    <div className="p-6 md:p-8 max-w-screen-xl">
      {/* Search bar */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-xl">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search movies…"
            className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          {searchInput && (
            <button onClick={handleClearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)]">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
        >
          Search
        </button>
      </div>

      {/* Market + language filters (only in now-playing mode) */}
      {!isSearchMode && (
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            {detectedCity && (
              <MarketBtn
                label={<><MapPin size={12} className="inline mr-1" />{detectedCity}</>}
                active={activeMarket === 'LOCAL'}
                onClick={() => handleMarket('LOCAL')}
              />
            )}
            <MarketBtn label="🇺🇸 US" active={activeMarket === 'US'} onClick={() => handleMarket('US')} />
            <MarketBtn label="🇮🇳 IN" active={activeMarket === 'IN'} onClick={() => handleMarket('IN')} />
          </div>

          {currentRegion === 'IN' && (
            <div className="flex items-center gap-2 flex-wrap">
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLang(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    currentLang === opt.value
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section title */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--text-main)]">{sectionTitle}</h1>
        {isSearchMode && (
          <button
            onClick={handleClearSearch}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-1"
          >
            <X size={14} /> Clear search
          </button>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <SkeletonGrid />
      ) : isError ? (
        <EmptyState
          title="Something went wrong"
          subtitle="Could not load movies. Please check your connection."
          action={
            <button
              onClick={() => activeQuery.refetch()}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)]"
            >
              Retry
            </button>
          }
        />
      ) : movies.length === 0 ? (
        <EmptyState
          title={isSearchMode ? `No results for "${searchQuery}"` : 'No movies available'}
          subtitle={isSearchMode ? 'Try different keywords or check the spelling.' : 'Check back later.'}
        />
      ) : (
        <>
          <div className="movie-grid">
            {movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} sourceRef="home" />
            ))}
          </div>

          {/* Sentinel + bottom loading indicator */}
          <div ref={sentinelRef} className="h-4 mt-4" />
          {isFetchingNext && (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MarketBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
        active
          ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
          : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
      }`}
    >
      {label}
    </button>
  )
}
