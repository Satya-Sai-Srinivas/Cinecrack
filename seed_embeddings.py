import asyncio
import os
from typing import Dict, List

import httpx
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from sqlalchemy import select

from database import AsyncSessionLocal, MovieEmbedding, init_db

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
BASE_URL = "https://api.themoviedb.org/3"
EMBEDDING_MODEL = "text-embedding-3-small"
SEED_PAGES = int(os.getenv("EMBEDDING_SEED_PAGES", "5"))

HEADERS = {"accept": "application/json"}
AUTH_PARAMS = {}
if TMDB_API_KEY.startswith("eyJ"):
    HEADERS["Authorization"] = f"Bearer {TMDB_API_KEY}"
else:
    AUTH_PARAMS["api_key"] = TMDB_API_KEY


def build_storyline_blob(movie: Dict, genre_lookup: Dict[int, str]) -> str:
    genre_names = [genre_lookup.get(gid, f"Genre-{gid}") for gid in movie.get("genre_ids", [])]
    genre_text = ", ".join(genre_names) if genre_names else "Unknown genres"
    title = movie.get("title", "Unknown Title")
    overview = movie.get("overview", "").strip() or "No synopsis available."
    release_date = movie.get("release_date", "Unknown release date")
    return (
        f"Title: {title}\n"
        f"Genres: {genre_text}\n"
        f"Release Date: {release_date}\n"
        f"Overview: {overview}"
    )


async def fetch_genres(client: httpx.AsyncClient) -> Dict[int, str]:
    response = await client.get(f"{BASE_URL}/genre/movie/list", headers=HEADERS, params=AUTH_PARAMS)
    response.raise_for_status()
    payload = response.json()
    return {genre["id"]: genre["name"] for genre in payload.get("genres", [])}


async def fetch_popular_movies(client: httpx.AsyncClient, pages: int) -> List[Dict]:
    all_movies: List[Dict] = []
    for page in range(1, pages + 1):
        response = await client.get(
            f"{BASE_URL}/movie/popular",
            headers=HEADERS,
            params={"page": page, **AUTH_PARAMS},
        )
        response.raise_for_status()
        payload = response.json()
        all_movies.extend(payload.get("results", []))
    return all_movies


async def upsert_embeddings(movies: List[Dict], genre_lookup: Dict[int, str]) -> None:
    embedding_client = OpenAIEmbeddings(model=EMBEDDING_MODEL)
    async with AsyncSessionLocal() as db:
        for movie in movies:
            movie_id = movie.get("id")
            if not movie_id:
                continue

            title = movie.get("title", "Unknown Title")
            storyline_blob = build_storyline_blob(movie, genre_lookup)
            embedding = await embedding_client.aembed_query(storyline_blob)

            existing = await db.execute(
                select(MovieEmbedding).where(MovieEmbedding.movie_id == movie_id)
            )
            row = existing.scalars().first()
            if row:
                row.title = title
                row.storyline = storyline_blob
                row.embedding = embedding
            else:
                db.add(
                    MovieEmbedding(
                        movie_id=movie_id,
                        title=title,
                        storyline=storyline_blob,
                        embedding=embedding,
                    )
                )

        await db.commit()


async def main() -> None:
    if not TMDB_API_KEY:
        raise RuntimeError("TMDB_API_KEY is missing. Add it to your environment.")
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is missing. Add it to your environment.")

    await init_db()
    async with httpx.AsyncClient(timeout=30.0) as client:
        genres = await fetch_genres(client)
        movies = await fetch_popular_movies(client, SEED_PAGES)
    await upsert_embeddings(movies, genres)
    print(f"Seeded embeddings for {len(movies)} popular movies.")


if __name__ == "__main__":
    asyncio.run(main())
