import asyncio
import os
import re
from typing import Dict, List, Optional

import httpx
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from sqlalchemy import select

from database import AsyncSessionLocal, MovieEmbedding, init_db

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
BASE_URL = "https://api.themoviedb.org/3"
WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php"
EMBEDDING_MODEL = "text-embedding-3-small"
SEED_PAGES = int(os.getenv("EMBEDDING_SEED_PAGES", "5"))
EMBEDDING_BATCH_SIZE = 50

HEADERS = {"accept": "application/json"}
WIKIPEDIA_HEADERS = {
    "accept": "application/json",
    "User-Agent": "CineCrackBot/1.0 (movie-embedding-seeder)",
}
AUTH_PARAMS = {}
if TMDB_API_KEY.startswith("eyJ"):
    HEADERS["Authorization"] = f"Bearer {TMDB_API_KEY}"
else:
    AUTH_PARAMS["api_key"] = TMDB_API_KEY


def extract_year_from_release_date(release_date: str) -> Optional[int]:
    if not release_date:
        return None
    try:
        return int(release_date[:4])
    except (TypeError, ValueError):
        return None


def extract_plot_section(wikipedia_extract: str) -> Optional[str]:
    if not wikipedia_extract:
        return None

    section_pattern = re.compile(r"^\s*==\s*(.*?)\s*==\s*$")
    sections: Dict[str, List[str]] = {}
    current_section: Optional[str] = None

    for raw_line in wikipedia_extract.splitlines():
        match = section_pattern.match(raw_line)
        if match:
            current_section = match.group(1).strip().lower()
            sections.setdefault(current_section, [])
            continue

        if current_section is not None:
            sections[current_section].append(raw_line)

    for heading in ("plot", "premise"):
        for section_name, lines in sections.items():
            normalized = section_name.strip().lower()
            if normalized == heading or normalized.startswith(f"{heading} "):
                text = "\n".join(line.strip() for line in lines if line.strip()).strip()
                if text:
                    return text

    return None


async def fetch_wikipedia_plot(
    client: httpx.AsyncClient, title: str, release_date: str
) -> Optional[str]:
    year = extract_year_from_release_date(release_date) or ""

    search_params = {
        "action": "query",
        "list": "search",
        "srsearch": f"\"{title}\" {year} film".strip(),
        "format": "json",
    }
    search_response = await client.get(
        WIKIPEDIA_API_URL,
        params=search_params,
        headers=WIKIPEDIA_HEADERS,
    )
    if search_response.status_code != 200:
        return None

    search_payload = search_response.json()
    search_results = (search_payload.get("query") or {}).get("search") or []
    if not search_results:
        return None

    pageid = search_results[0].get("pageid")
    if pageid is None:
        return None

    extract_params = {
        "action": "query",
        "prop": "extracts",
        "explaintext": 1,
        "pageids": pageid,
        "format": "json",
    }
    extract_response = await client.get(
        WIKIPEDIA_API_URL,
        params=extract_params,
        headers=WIKIPEDIA_HEADERS,
    )
    if extract_response.status_code != 200:
        return None

    extract_payload = extract_response.json()
    page_map = (extract_payload.get("query") or {}).get("pages") or {}
    page_data = page_map.get(str(pageid)) or next(iter(page_map.values()), {})
    wikipedia_extract = page_data.get("extract", "")

    return extract_plot_section(wikipedia_extract)


def build_storyline_blob(movie: Dict, genre_lookup: Dict[int, str], wikipedia_plot: Optional[str]) -> str:
    genre_names = [genre_lookup.get(gid, f"Genre-{gid}") for gid in movie.get("genre_ids", [])]
    genre_text = ", ".join(genre_names) if genre_names else "Unknown genres"
    title = movie.get("title", "Unknown Title")
    overview = movie.get("overview", "").strip() or "No synopsis available."
    if wikipedia_plot:
        return f"Title: {title}\nGenres: {genre_text}\nDetailed Plot: {wikipedia_plot}"
    return f"Title: {title}\nGenres: {genre_text}\nOverview: {overview}"


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
    prepared: List[Dict] = []

    async with httpx.AsyncClient(timeout=30.0) as wiki_client:
        for movie in movies:
            movie_id = movie.get("id")
            if not movie_id:
                continue

            title = movie.get("title", "Unknown Title")
            release_date = movie.get("release_date", "")
            wikipedia_plot: Optional[str] = None
            try:
                wikipedia_plot = await fetch_wikipedia_plot(wiki_client, title, release_date)
            except Exception as wiki_error:
                print(f"Wikipedia fetch failed for '{title}' ({movie_id}): {wiki_error}")
                wikipedia_plot = None

            prepared.append(
                {
                    "movie_id": movie_id,
                    "title": title,
                    "storyline_blob": build_storyline_blob(movie, genre_lookup, wikipedia_plot),
                }
            )
            await asyncio.sleep(0.1)

    async with AsyncSessionLocal() as db:
        for offset in range(0, len(prepared), EMBEDDING_BATCH_SIZE):
            batch = prepared[offset : offset + EMBEDDING_BATCH_SIZE]
            if not batch:
                continue

            try:
                embeddings = await embedding_client.aembed_documents(
                    [entry["storyline_blob"] for entry in batch]
                )
            except Exception as embedding_error:
                print(
                    f"Embedding batch failed for records {offset}-{offset + len(batch) - 1}: {embedding_error}"
                )
                continue

            for entry, embedding in zip(batch, embeddings):
                try:
                    existing = await db.execute(
                        select(MovieEmbedding).where(MovieEmbedding.movie_id == entry["movie_id"])
                    )
                    row = existing.scalars().first()
                    if row:
                        row.title = entry["title"]
                        row.storyline = entry["storyline_blob"]
                        row.embedding = embedding
                    else:
                        db.add(
                            MovieEmbedding(
                                movie_id=entry["movie_id"],
                                title=entry["title"],
                                storyline=entry["storyline_blob"],
                                embedding=embedding,
                            )
                        )
                except Exception as row_error:
                    print(f"Skipping movie {entry['movie_id']} due to row error: {row_error}")
                    continue

            try:
                await db.commit()
            except Exception as commit_error:
                await db.rollback()
                print(
                    f"Batch commit failed for records {offset}-{offset + len(batch) - 1}: {commit_error}"
                )


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
