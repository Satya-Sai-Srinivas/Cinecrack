import { Link } from 'react-router-dom';
import { Bookmark, Check } from 'lucide-react';
import { useMovieStatus } from '../../hooks/useMovieStatus';

export default function MovieCard({ movie }) {
  const { savedIds, watchedIds, toggleSave, toggleWatched, isPending } = useMovieStatus();
  const isSaved = savedIds.has(movie.id);
  const isWatched = watchedIds.has(movie.id);

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleSave = (e) => { stop(e); toggleSave(movie.id); };
  const handleWatched = (e) => { stop(e); toggleWatched(movie.id); };

  return (
    <Link
      to={`/movie/${movie.id}`}
      className="group relative block overflow-hidden rounded-xl bg-[var(--surface)] shadow-md transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-[var(--accent)]/30 border border-[var(--border-color)]/30"
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-[var(--surface)] relative">
        {movie.poster_url ? (
          <img
            src={movie.poster_url}
            alt={movie.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--text-muted)]">
            <span className="text-sm font-medium tracking-wide">No Image</span>
          </div>
        )}

        {/* Cinematic Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/40 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      </div>

      {/* Action cluster: Watched + Save */}
      <div
        className={`absolute top-3 right-3 z-10 flex gap-1.5 transition-all duration-300 ${
          isSaved || isWatched ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <button
          onClick={handleWatched}
          disabled={isPending}
          aria-label={isWatched ? 'Remove from watched' : 'Mark as watched'}
          className={`p-2 rounded-full backdrop-blur-md border transition-all duration-300 disabled:opacity-50 ${
            isWatched
              ? 'bg-green-500 border-green-500 text-white'
              : 'bg-black/40 border-white/20 text-white hover:bg-green-500 hover:border-green-500'
          }`}
        >
          <Check size={16} />
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          aria-label={isSaved ? 'Remove from watchlist' : 'Add to watchlist'}
          className={`p-2 rounded-full backdrop-blur-md border transition-all duration-300 disabled:opacity-50 ${
            isSaved
              ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
              : 'bg-black/40 border-white/20 text-white hover:bg-[var(--accent)] hover:border-[var(--accent)]'
          }`}
        >
          <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Title Reveal */}
      <div className="absolute bottom-0 left-0 w-full p-4 translate-y-6 opacity-0 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100">
        <h3 className="font-bold text-white line-clamp-2 text-md leading-snug drop-shadow-lg">
          {movie.title}
        </h3>
        {movie.release_date && (
          <p className="mt-1 text-xs text-slate-300 font-semibold uppercase tracking-widest">
            {new Date(movie.release_date).getFullYear()}
          </p>
        )}
      </div>
    </Link>
  );
}
