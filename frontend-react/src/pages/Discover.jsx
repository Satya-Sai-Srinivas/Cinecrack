import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { SlidersHorizontal } from 'lucide-react'
import { fetchDiscover } from '../api'
import { useIntersectionObserver } from '../hooks/useInfiniteScroll'
import { MovieCard } from '../components/movie/MovieCard'
import { SkeletonGrid } from '../components/ui/SkeletonCard'
import { EmptyState } from '../components/ui/EmptyState'

const CURRENT_YEAR = new Date().getFullYear()

const TMDB_GENRES = [
  { id: 28, name: 'Action' }, { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' }, { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' }, { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' }, { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' }, { id: 36, name: 'History' },
  { id: 27, name: 'Horror' }, { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' }, { id: 10749, name: 'Romance' },
  { id: 878, name: 'Science Fiction' }, { id: 10770, name: 'TV Movie' },
  { id: 53, name: 'Thriller' }, { id: 10752, name: 'War' },
  { id: 37, name: 'Western' },
]

const LANG_OPTIONS = [
  { value: '', label: 'All Languages' },
  { value: 'en', label: 'English' },
  { value: 'te', label: 'Telugu' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'ko', label: 'Korean' },
  { value: 'ja', label: 'Japanese' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
]

function buildFiltersFromParams(params) {
  return {
    release_year_gte: params.get('year_min') || '2000',
    release_year_lte: params.get('year_max') || String(CURRENT_YEAR),
    min_rating: params.get('min_rating') || '0',
    genre: params.get('genre') || '',
    language: params.get('language') || '',
  }
}

export default function Discover() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Initialize filters from URL
  const [filters, setFilters] = useState(() => buildFiltersFromParams(searchParams))
  const [applied, setApplied] = useState(() => buildFiltersFromParams(searchParams))

  // Debounce timer
  const debounceRef = useRef(null)

  // Sync filters when URL params change (e.g., from chatbot tool_call redirect)
  useEffect(() => {
    const f = buildFiltersFromParams(searchParams)
    setFilters(f)
    setApplied(f)
  }, [searchParams.toString()])  // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useInfiniteQuery({
      queryKey: ['discover', applied],
      queryFn: ({ pageParam = 1 }) => fetchDiscover({ ...applied, page: pageParam }),
      getNextPageParam: (lastPage, pages) =>
        lastPage.length < 20 ? undefined : pages.length + 1,
      staleTime: 5 * 60 * 1000,
    })

  const movies = data?.pages.flat() ?? []

  const sentinelRef = useIntersectionObserver(
    useCallback(() => {
      if (hasNextPage && !isFetchingNextPage) fetchNextPage()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]),
    { rootMargin: '240px 0px 240px 0px' }
  )

  // Apply filters with debounce (220ms for sliders, 80ms for selects)
  const scheduleApply = useCallback(
    (delay = 220) => {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        setApplied({ ...filters })
        // Sync URL
        const next = new URLSearchParams()
        if (filters.genre)            next.set('genre',      filters.genre)
        if (filters.language)         next.set('language',   filters.language)
        if (filters.release_year_gte) next.set('year_min',   filters.release_year_gte)
        if (filters.release_year_lte) next.set('year_max',   filters.release_year_lte)
        if (filters.min_rating && filters.min_rating !== '0') next.set('min_rating', filters.min_rating)
        setSearchParams(next, { replace: true })
      }, delay)
    },
    [filters, setSearchParams]
  )

  const handleSliderChange = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const handleSliderCommit = () => scheduleApply(220)

  const handleSelectChange = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }))
    // Immediate apply for selects (80ms debounce)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setApplied((prev) => ({ ...prev, [key]: value }))
      const next = new URLSearchParams(searchParams)
      if (value) next.set(key === 'genre' ? 'genre' : 'language', value)
      else next.delete(key === 'genre' ? 'genre' : 'language')
      setSearchParams(next, { replace: true })
    }, 80)
  }

  const yearRangeValid = Number(filters.release_year_gte) <= Number(filters.release_year_lte)

  return (
    <div className="p-6 md:p-8 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <SlidersHorizontal size={20} className="text-[var(--accent)]" />
        <h1 className="text-xl font-bold text-[var(--text-main)]">Discover Movies</h1>
      </div>

      {/* Filter toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 p-5 rounded-2xl border border-[var(--border-color)] bg-[var(--surface)]">
        {/* Genre */}
        <FilterGroup label="Genre">
          <select
            value={filters.genre}
            onChange={(e) => handleSelectChange('genre', e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="">All Genres</option>
            {TMDB_GENRES.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </FilterGroup>

        {/* Language */}
        <FilterGroup label="Language">
          <select
            value={filters.language}
            onChange={(e) => handleSelectChange('language', e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
          >
            {LANG_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </FilterGroup>

        {/* Year range */}
        <FilterGroup label={`Year Range: ${filters.release_year_gte} – ${filters.release_year_lte}`}>
          <div className="flex gap-2 items-center">
            <input
              type="range" min="1900" max={CURRENT_YEAR}
              value={filters.release_year_gte}
              onChange={(e) => handleSliderChange('release_year_gte', e.target.value)}
              onMouseUp={handleSliderCommit} onTouchEnd={handleSliderCommit}
              className="flex-1 accent-[var(--accent)]"
            />
            <input
              type="range" min="1900" max={CURRENT_YEAR}
              value={filters.release_year_lte}
              onChange={(e) => handleSliderChange('release_year_lte', e.target.value)}
              onMouseUp={handleSliderCommit} onTouchEnd={handleSliderCommit}
              className="flex-1 accent-[var(--accent)]"
            />
          </div>
          {!yearRangeValid && (
            <p className="text-xs text-red-500 mt-1">Min year must be ≤ max year</p>
          )}
        </FilterGroup>

        {/* Min rating */}
        <FilterGroup label={`Min Rating: ${Number(filters.min_rating).toFixed(1)}`}>
          <input
            type="range" min="0" max="10" step="0.5"
            value={filters.min_rating}
            onChange={(e) => handleSliderChange('min_rating', e.target.value)}
            onMouseUp={handleSliderCommit} onTouchEnd={handleSliderCommit}
            className="w-full accent-[var(--accent)]"
          />
        </FilterGroup>
      </div>

      {/* Results */}
      {isLoading ? (
        <SkeletonGrid />
      ) : isError ? (
        <EmptyState
          title="Failed to load results"
          subtitle="Something went wrong. Please try again."
          action={
            <button onClick={() => refetch()} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm">
              Retry
            </button>
          }
        />
      ) : movies.length === 0 ? (
        <EmptyState title="No movies match these filters" subtitle="Try loosening your criteria." />
      ) : (
        <>
          <p className="text-sm text-[var(--text-muted)] mb-4">{movies.length}+ result{movies.length !== 1 ? 's' : ''}</p>
          <div className="movie-grid">
            {movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} sourceRef="discover" />
            ))}
          </div>
          <div ref={sentinelRef} className="h-4 mt-4" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FilterGroup({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}
