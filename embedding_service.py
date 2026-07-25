"""On-the-fly movie embedding.

Whenever a user engages with a movie (like/dislike, watched, watchlist save)
that isn't in `movie_embeddings` yet, generate + store its embedding so the
recommender's taste vector and candidate pool cover movies people actually care
about. Self-contained (opens its own DB session) so it's safe to run as a
FastAPI background task.
"""

import os
from typing import Any, Dict, Optional, Tuple

import httpx
from sqlalchemy import select

from database import AsyncSessionLocal, MovieCache, MovieEmbedding
from ai_services import generate_embedding

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "").strip()
BASE_URL = "https://api.themoviedb.org/3"
HEADERS = {"accept": "application/json"}
AUTH_PARAMS: Dict[str, str] = {}
if TMDB_API_KEY.startswith("eyJ"):
    HEADERS["Authorization"] = f"Bearer {TMDB_API_KEY}"
else:
    AUTH_PARAMS["api_key"] = TMDB_API_KEY


def _blob_from_cache(movie_data: Dict[str, Any]) -> Tuple[str, str]:
    """Build (title, storyline_blob) from a cached MovieDetailResponse dict."""
    title = movie_data.get("title", "Unknown Title")
    genres = movie_data.get("genres") or []
    genre_text = ", ".join(genres) if genres else "Unknown genres"
    cast = [c.get("name") for c in (movie_data.get("lead_cast") or []) if c.get("name")]
    cast_text = ", ".join(cast) if cast else "Unknown"
    overview = (movie_data.get("storyline") or "").strip() or "No synopsis available."
    blob = f"Title: {title}\nGenres: {genre_text}\nCast: {cast_text}\nOverview: {overview}"
    return title, blob


async def _blob_from_tmdb(movie_id: int) -> Optional[Tuple[str, str]]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            f"{BASE_URL}/movie/{movie_id}", headers=HEADERS, params=AUTH_PARAMS
        )
        if response.status_code != 200:
            return None
        data = response.json()
    title = data.get("title", "Unknown Title")
    genres = [g["name"] for g in data.get("genres") or []]
    genre_text = ", ".join(genres) if genres else "Unknown genres"
    overview = (data.get("overview") or "").strip() or "No synopsis available."
    blob = f"Title: {title}\nGenres: {genre_text}\nOverview: {overview}"
    return title, blob


async def ensure_movie_embedding(movie_id: int) -> None:
    """Generate + store an embedding for a movie if it doesn't already have one."""
    async with AsyncSessionLocal() as db:
        existing = await db.execute(
            select(MovieEmbedding.id).where(MovieEmbedding.movie_id == movie_id)
        )
        if existing.scalars().first():
            return

        # Prefer cached movie data (no extra TMDB call); fall back to TMDB.
        cache_row = await db.execute(
            select(MovieCache).where(MovieCache.movie_id == movie_id)
        )
        cache = cache_row.scalars().first()
        if cache and cache.movie_data:
            title, blob = _blob_from_cache(cache.movie_data)
        else:
            built = await _blob_from_tmdb(movie_id)
            if not built:
                return
            title, blob = built

        try:
            embedding = await generate_embedding(blob)
        except Exception as exc:
            print(f"[embed] embedding generation failed for movie {movie_id}: {exc}")
            return
        if not embedding:
            return

        # Re-check after the (slow) embedding call to avoid a duplicate insert race.
        recheck = await db.execute(
            select(MovieEmbedding.id).where(MovieEmbedding.movie_id == movie_id)
        )
        if recheck.scalars().first():
            return

        db.add(
            MovieEmbedding(movie_id=movie_id, title=title, storyline=blob, embedding=embedding)
        )
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            print(f"[embed] commit failed for movie {movie_id}: {exc}")
