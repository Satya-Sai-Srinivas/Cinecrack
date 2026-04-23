import { Link } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';

export default function MovieCard({ movie }) {
  const { getToken, isSignedIn } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault(); // Prevents the Link from triggering!
    e.stopPropagation();

    if (!isSignedIn) {
      alert("Please sign in to save movies!");
      return;
    }

    setIsSaving(true);
    try {
      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/v1/user/watchlist`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ movie_id: movie.id, status: 'WATCHLIST' })
      });

      if (response.ok) {
        setIsSaved(!isSaved);
      }
    } catch (error) {
      console.error("Failed to save movie", error);
    } finally {
      setIsSaving(false);
    }
  };

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

      {/* NEW: Bookmark Button */}
      <button 
        onClick={handleSave}
        disabled={isSaving}
        className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-50"
      >
        <Bookmark size={18} fill={isSaved ? "currentColor" : "none"} className={isSaved ? "text-white" : ""} />
      </button>

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