import asyncio
import httpx
import os
import json
import urllib.parse
import re
from fastapi import FastAPI, HTTPException, Depends, Query
from datetime import date
from typing import List, Optional, Any, Dict
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl, Field
from datetime import datetime, timedelta
from auth import get_current_user
from database import Watchlist, User, ChatThread # Add the new tables
from models import WatchlistRequest, WatchlistResponse # Add the new models
from fastapi import Request
import httpx

# --- Database Imports ---
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import get_db, MovieCache, SearchHistory, init_db
from contextlib import asynccontextmanager
from ai_services import generate_embedding, similarity_search_movies, stream_cinematic_reply

# --- Models Imports ---
from models import MovieDetailResponse, ReleaseInfo, StreamingPlatform, CastMember, Technician, SocialMediaLinks, WorkReference, PersonDetailResponse, MovieCredit

# --- 1. Environment Setup ---
load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "").strip()
if not TMDB_API_KEY:
    raise ValueError("TMDB_API_KEY is missing. Please check your .env file.")

BASE_URL = "https://api.themoviedb.org/3"
HEADERS = {"accept": "application/json"}
AUTH_PARAMS = {}

if TMDB_API_KEY.startswith("eyJ"):
    HEADERS["Authorization"] = f"Bearer {TMDB_API_KEY}"
else:
    AUTH_PARAMS["api_key"] = TMDB_API_KEY

# --- 2. App Init & Database Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="CineCrack API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 3. Helper Functions ---
def build_social_links(external_ids: dict, person_name: str = "") -> SocialMediaLinks:
    if not external_ids:
        external_ids = {}
        
    wiki_url = None
    if person_name:
        safe_name = urllib.parse.quote(person_name.replace(' ', '_'))
        wiki_url = f"https://en.wikipedia.org/wiki/{safe_name}"
    
    return SocialMediaLinks(
        instagram=f"https://instagram.com/{external_ids.get('instagram_id')}" if external_ids.get("instagram_id") else None,
        twitter=f"https://twitter.com/{external_ids.get('twitter_id')}" if external_ids.get("twitter_id") else None,
        facebook=f"https://facebook.com/{external_ids.get('facebook_id')}" if external_ids.get("facebook_id") else None,
        imdb=f"https://imdb.com/name/{external_ids.get('imdb_id')}" if external_ids.get("imdb_id") else None,
        wikipedia=wiki_url
    )

def safe_parse_date(date_string: str) -> Optional[date]:
    if not date_string:
        return None
    try:
        return date.fromisoformat(date_string)
    except ValueError:
        return None


def build_movie_wikipedia_url(
    title: str,
    wikidata_id: Optional[str] = None,
    imdb_id: Optional[str] = None,
) -> Optional[str]:
    normalized_wikidata = (wikidata_id or "").strip()
    normalized_imdb = (imdb_id or "").strip()

    # Prefer Wikidata-driven redirect to the canonical English Wikipedia page.
    if re.fullmatch(r"Q\d+", normalized_wikidata):
        return f"https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/{normalized_wikidata}"

    if re.fullmatch(r"tt\d+", normalized_imdb):
        return f"https://en.wikipedia.org/wiki/Special:Search?search={urllib.parse.quote(normalized_imdb)}"

    if title:
        return f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}"

    return None


def pick_youtube_video_url(video_items: List[Dict[str, Any]]) -> Optional[str]:
    youtube_items = [v for v in video_items if v.get("site") == "YouTube" and v.get("key")]
    if not youtube_items:
        return None

    def rank(video: Dict[str, Any]) -> tuple:
        return (
            1 if video.get("official") else 0,
            video.get("published_at") or "",
        )

    trailers = [v for v in youtube_items if v.get("type") == "Trailer"]
    if trailers:
        trailers.sort(key=rank, reverse=True)
        return f"https://www.youtube.com/watch?v={trailers[0]['key']}"

    teasers = [v for v in youtube_items if v.get("type") == "Teaser"]
    if teasers:
        teasers.sort(key=rank, reverse=True)
        return f"https://www.youtube.com/watch?v={teasers[0]['key']}"

    youtube_items.sort(key=rank, reverse=True)
    return f"https://www.youtube.com/watch?v={youtube_items[0]['key']}"


def build_streaming_platforms(results_data: Dict[str, Any], movie_id: int, region: str) -> List[StreamingPlatform]:
    local_providers = results_data.get(region.upper(), {}) if isinstance(results_data, dict) else {}
    tmdb_url = f"https://www.themoviedb.org/movie/{movie_id}/watch?region={region.upper()}"
    return [
        StreamingPlatform(name=p.get("provider_name", "Unknown"), link=tmdb_url)
        for p in local_providers.get("flatrate", [])
    ]


async def fetch_person_data(client: httpx.AsyncClient, person: dict, is_cast: bool) -> Any:
    person_id = person["id"]
    person_name = person.get("name", "Unknown")
    
    url = f"{BASE_URL}/person/{person_id}"
    params = {"append_to_response": "external_ids,movie_credits", **AUTH_PARAMS}
    
    response = await client.get(url, headers=HEADERS, params=params)
    data = response.json() if response.status_code == 200 else {}
        
    socials = build_social_links(data.get("external_ids") or {}, person_name)
    
    credits_data = data.get("movie_credits") or {}
    credits_key = "cast" if is_cast else "crew"
    past_works_data = credits_data.get(credits_key, [])
    
    sorted_works = sorted(past_works_data, key=lambda x: x.get("popularity", 0), reverse=True)[:3]
    
    well_known_for = []
    for work in sorted_works:
        year = None
        if work.get("release_date"):
            try:
                year = int(work["release_date"][:4])
            except ValueError:
                pass
        
        well_known_for.append(WorkReference(
            title=work.get("title", "Unknown"),
            release_year=year
        ))
        
    image_url = f"https://image.tmdb.org/t/p/w500{person['profile_path']}" if person.get("profile_path") else None

    if is_cast:
        return CastMember(id=person_id, name=person_name, character_name=person.get("character", "Unknown"), image_url=image_url, social_handles=socials, well_known_for=well_known_for)
    else:
        return Technician(id=person_id, name=person_name, department=person.get("department", "Unknown"), job=person.get("job", "Unknown"), image_url=image_url, social_handles=socials, well_known_for=well_known_for)


class MoviePreview(BaseModel):
    id: int
    title: str
    poster_url: Optional[HttpUrl] = None
    release_date: Optional[date] = None


class ConversationTurn(BaseModel):
    role: str = Field(default="user")
    content: str


class AIChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    conversation_history: Optional[List[ConversationTurn]] = None


class AIRecommendedMovie(BaseModel):
    id: int
    title: str
    storyline: str
    poster_url: Optional[str] = None
    release_date: Optional[date] = None


class AIChatResponse(BaseModel):
    message: str
    recommendations: List[AIRecommendedMovie]


async def hydrate_ai_movie_cards(
    db: AsyncSession,
    movie_records: List[Any],
) -> List[AIRecommendedMovie]:
    if not movie_records:
        return []

    ordered_movie_ids = [movie.movie_id for movie in movie_records]
    lookup_by_id = {movie.movie_id: movie for movie in movie_records}

    cache_result = await db.execute(
        select(MovieCache).where(MovieCache.movie_id.in_(ordered_movie_ids))
    )
    cached_entries = {entry.movie_id: entry.movie_data for entry in cache_result.scalars().all()}

    async def fetch_tmdb_movie_card(
        client: httpx.AsyncClient, movie_id: int
    ) -> Dict[str, Optional[str]]:
        try:
            response = await client.get(
                f"{BASE_URL}/movie/{movie_id}",
                headers=HEADERS,
                params=AUTH_PARAMS,
            )
            if response.status_code == 200:
                payload = response.json()
                return {
                    "poster_url": (
                        f"https://image.tmdb.org/t/p/w500{payload['poster_path']}"
                        if payload.get("poster_path")
                        else None
                    ),
                    "release_date": payload.get("release_date"),
                }
        except httpx.HTTPError:
            pass
        return {"poster_url": None, "release_date": None}

    missing_ids = [movie_id for movie_id in ordered_movie_ids if movie_id not in cached_entries]
    fetched_cards: Dict[int, Dict[str, Optional[str]]] = {}
    if missing_ids:
        async with httpx.AsyncClient(timeout=20.0) as client:
            tasks = [fetch_tmdb_movie_card(client, movie_id) for movie_id in missing_ids]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for movie_id, payload in zip(missing_ids, results):
                if isinstance(payload, Exception):
                    fetched_cards[movie_id] = {"poster_url": None, "release_date": None}
                else:
                    fetched_cards[movie_id] = payload

    cards: List[AIRecommendedMovie] = []
    for movie_id in ordered_movie_ids:
        movie = lookup_by_id[movie_id]
        cached_data = cached_entries.get(movie_id)

        if cached_data:
            poster_url = cached_data.get("poster_url")
            release_date_raw = (
                (cached_data.get("release_details") or {}).get("theatrical_release_date")
            )
        else:
            fetched = fetched_cards.get(movie_id, {})
            poster_url = fetched.get("poster_url")
            release_date_raw = fetched.get("release_date")

        cards.append(
            AIRecommendedMovie(
                id=movie.movie_id,
                title=movie.title,
                storyline=movie.storyline,
                poster_url=poster_url,
                release_date=safe_parse_date(release_date_raw),
            )
        )

    return cards


def _sse_event(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"

# --- 4. API Endpoints ---
@app.get("/api/v1/geo/location")
async def get_user_location(request: Request):
    # 1. Get the User's Real IP
    # We check X-Forwarded-For first, then fall back to client.host
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    
    if x_forwarded_for:
        # The first IP in the list is the actual user
        user_ip = x_forwarded_for.split(",")[0].strip()
    else:
        user_ip = request.client.host

    # 2. Handle Localhost (ipapi.co won't recognize 127.0.0.1)
    if user_ip in ["127.0.0.1", "localhost", "::1"]:
        # When testing locally, you can hardcode your current public IP 
        # or just return a default so the app doesn't break.
        return {"country_code": "US", "city": "Boston", "region": "MA", "is_local": True}

    # 3. Call the external API using the SPECIFIC User IP
    try:
        async with httpx.AsyncClient() as client:
            # We append the user_ip to the URL so ipapi.co knows who we are asking about
            geo_url = f"https://ipapi.co/{user_ip}/json/"
            response = await client.get(geo_url, timeout=5.0)
            
            if response.status_code == 200:
                return response.json()
            return {"country_code": "US", "error": "API Error"}
    except Exception as e:
        print(f"Geo Error: {e}")
        return {"country_code": "US", "error": str(e)}


@app.get("/api/v1/movies/now-playing", response_model=List[MoviePreview])
async def get_now_playing(region: str = "US", lang: str = "all", page: int = 1):
    if lang != "all":
        url = f"{BASE_URL}/discover/movie"
        today = datetime.utcnow()
        past_month = today - timedelta(days=45) 
        
        params = {
            "region": region,
            "with_release_type": "2|3",
            "release_date.gte": past_month.strftime("%Y-%m-%d"),
            "release_date.lte": today.strftime("%Y-%m-%d"),
            "with_original_language": lang,
            "sort_by": "popularity.desc",
            "page": page, 
            **AUTH_PARAMS
        }
    else:
        url = f"{BASE_URL}/movie/now_playing"
        params = {"region": region, "page": page, **AUTH_PARAMS}
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=HEADERS, params=params)
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
            
        data = response.json()
        movies = []
        
        for item in data.get("results", []):
            poster = f"https://image.tmdb.org/t/p/w500{item['poster_path']}" if item.get('poster_path') else None
            movies.append(MoviePreview(
                id=item["id"], 
                title=item["title"], 
                poster_url=poster, 
                release_date=safe_parse_date(item.get("release_date"))
            ))
        return movies


@app.get("/api/v1/movies/search", response_model=List[MoviePreview])
async def search_movies(query: str, page: int = 1):
    url = f"{BASE_URL}/search/movie"
    params = {"query": query, "include_adult": "false", "page": page, **AUTH_PARAMS}
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=HEADERS, params=params)
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Failed to search movies")
            
        data = response.json()
        movies = []
        
        for item in data.get("results", []):
            poster = f"https://image.tmdb.org/t/p/w500{item['poster_path']}" if item.get('poster_path') else None
            movies.append(MoviePreview(
                id=item["id"], 
                title=item["title"], 
                poster_url=poster, 
                release_date=safe_parse_date(item.get("release_date"))
            ))
        return movies


@app.get("/api/v1/movies/discover", response_model=List[MoviePreview])
async def discover_movies(
    genre: Optional[int] = Query(default=None, description="TMDB genre ID"),
    language: Optional[str] = Query(default=None, min_length=2, max_length=5, description="Original audio language code"),
    release_year_gte: Optional[int] = Query(default=None, ge=1900, le=2100),
    release_year_lte: Optional[int] = Query(default=None, ge=1900, le=2100),
    min_rating: Optional[float] = Query(default=None, ge=0, le=10),
    page: int = Query(default=1, ge=1, le=500)
):
    if release_year_gte and release_year_lte and release_year_gte > release_year_lte:
        raise HTTPException(status_code=400, detail="release_year_gte cannot be greater than release_year_lte")

    url = f"{BASE_URL}/discover/movie"
    params = {
        "include_adult": "false",
        "sort_by": "popularity.desc",
        "vote_count.gte": 50,
        "page": page,
        **AUTH_PARAMS
    }

    if genre:
        params["with_genres"] = genre
    if language:
        params["with_original_language"] = language
    if release_year_gte:
        params["primary_release_date.gte"] = f"{release_year_gte}-01-01"
    if release_year_lte:
        params["primary_release_date.lte"] = f"{release_year_lte}-12-31"
    if min_rating is not None:
        params["vote_average.gte"] = min_rating

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=HEADERS, params=params)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Failed to discover movies")

        data = response.json()
        movies = []
        for item in data.get("results", []):
            poster = f"https://image.tmdb.org/t/p/w500{item['poster_path']}" if item.get("poster_path") else None
            movies.append(MoviePreview(
                id=item["id"],
                title=item.get("title", "Unknown"),
                poster_url=poster,
                release_date=safe_parse_date(item.get("release_date"))
            ))
        return movies


@app.post("/api/v1/ai/chat")
async def ai_chat(payload: AIChatRequest, db: AsyncSession = Depends(get_db)):
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is missing. Add it to your environment before using AI Guru.",
        )

    try:
        query_embedding = await generate_embedding(payload.query)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Embedding generation failed: {exc}") from exc

    if not query_embedding:
        raise HTTPException(status_code=400, detail="Unable to generate embedding from query.")

    retrieved_movies = await similarity_search_movies(
        db=db,
        raw_query=payload.query,
        query_embedding=query_embedding,
        top_k=5,
    )
    hydrated_recommendations = await hydrate_ai_movie_cards(db, retrieved_movies)

    history_payload: Optional[List[Dict[str, str]]] = None
    if payload.conversation_history:
        history_payload = [turn.model_dump() for turn in payload.conversation_history]

    history_result = await db.execute(
        select(SearchHistory).order_by(SearchHistory.searched_at.desc()).limit(15)
    )
    recent_history_records = history_result.scalars().all()
    
    if recent_history_records:
        # Extract unique titles while preserving the chronological order
        history_titles = list(dict.fromkeys([h.movie_title for h in recent_history_records]))
        user_history_str = ", ".join(history_titles)
    else:
        user_history_str = "The user has not watched or searched for any movies yet."

    async def event_generator():
        try:
            if not retrieved_movies:
                fallback = (
                    "I could not find enough cinematic memory yet. Seed embeddings first, then ask again "
                    "and I will craft a richer recommendation."
                )
                yield _sse_event({"type": "text", "content": fallback})
            else:
                async for stream_chunk in stream_cinematic_reply(
                    query=payload.query,
                    conversation_history=history_payload,
                    retrieved_movies=retrieved_movies,
                    user_history=user_history_str
                ):
                    yield _sse_event(stream_chunk)

            yield _sse_event(
                {
                    "type": "recommendations",
                    "items": [item.model_dump(mode="json") for item in hydrated_recommendations],
                }
            )
            yield _sse_event({"type": "done"})
        except Exception as exc:
            yield _sse_event({"type": "error", "message": f"Streaming failed: {exc}"})

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# 🌟 MOVED UP: regional-hub must be above {movie_id} to prevent path collision
@app.get("/api/v1/movies/regional-hub")
async def get_regional_hub():
    """Fetches multiple regional and international categories concurrently."""
    
    async def fetch_category(lang: str, extra_params: dict = None):
        url = f"{BASE_URL}/discover/movie"
        today = datetime.utcnow()
        past_six_months = today - timedelta(days=180)
        
        params = {
            "with_original_language": lang,
            "sort_by": "popularity.desc",
            "release_date.gte": past_six_months.strftime("%Y-%m-%d"),
            "release_date.lte": today.strftime("%Y-%m-%d"),
            "page": 1,
            **AUTH_PARAMS
        }
        if extra_params:
            params.update(extra_params)
            
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=HEADERS, params=params)
            if response.status_code == 200:
                data = response.json()
                movies = []
                for item in data.get("results", [])[:15]:
                    poster = f"https://image.tmdb.org/t/p/w500{item['poster_path']}" if item.get('poster_path') else None
                    movies.append(MoviePreview(
                        id=item["id"], 
                        title=item["title"], 
                        poster_url=poster, 
                        release_date=safe_parse_date(item.get("release_date"))
                    ))
                return [m.model_dump(mode='json') for m in movies]
            return []

    t_task = fetch_category("te") 
    b_task = fetch_category("hi") 
    k_task = fetch_category("ta") 
    m_task = fetch_category("ml") 
    i_task = fetch_category("ko|ja|fr|es") 

    t, b, k, m, i = await asyncio.gather(t_task, b_task, k_task, m_task, i_task)

    return {
        "tollywood": t,
        "bollywood": b,
        "kollywood": k,
        "mollywood": m,
        "international": i
    }


@app.get("/api/v1/movies/{movie_id}", response_model=MovieDetailResponse)
async def get_movie_details(movie_id: int, region: str = "US", db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MovieCache).where(MovieCache.movie_id == movie_id))
    cached_movie = result.scalars().first()
    
    movie_title = ""
    final_response_data = None
    normalized_region = (region or "US").upper()

    if cached_movie:
        final_response_data = dict(cached_movie.movie_data)
        movie_title = final_response_data.get("title", "Unknown Title")

        async with httpx.AsyncClient() as client:
            providers_response = await client.get(
                f"{BASE_URL}/movie/{movie_id}/watch/providers",
                headers=HEADERS,
                params=AUTH_PARAMS,
            )
            if providers_response.status_code == 200:
                providers_data = providers_response.json() or {}
                results_data = providers_data.get("results") or {}
                local_streaming_platforms = build_streaming_platforms(results_data, movie_id, normalized_region)
                release_details = final_response_data.get("release_details") or {}
                release_details["available_on"] = [p.model_dump(mode="json") for p in local_streaming_platforms]
                final_response_data["release_details"] = release_details

            # Backfill missing trailer/wiki for older cached records.
            needs_media_links = not final_response_data.get("trailer_url") or not final_response_data.get("wikipedia_url")
            if needs_media_links:
                media_response = await client.get(
                    f"{BASE_URL}/movie/{movie_id}",
                    headers=HEADERS,
                    params={"append_to_response": "videos,external_ids", **AUTH_PARAMS},
                )
                if media_response.status_code == 200:
                    media_data = media_response.json() or {}
                    videos_data = media_data.get("videos") or {}
                    external_ids = media_data.get("external_ids") or {}
                    if not final_response_data.get("trailer_url"):
                        final_response_data["trailer_url"] = pick_youtube_video_url(videos_data.get("results", []))
                    if not final_response_data.get("wikipedia_url"):
                        final_response_data["wikipedia_url"] = build_movie_wikipedia_url(
                            title=movie_title,
                            wikidata_id=external_ids.get("wikidata_id"),
                            imdb_id=external_ids.get("imdb_id"),
                        )

        cached_movie.movie_data = final_response_data
    else:
        url = f"{BASE_URL}/movie/{movie_id}"
        params = {"append_to_response": "credits,watch/providers,videos,external_ids", **AUTH_PARAMS}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=HEADERS, params=params)
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.json())
                
            movie_data = response.json()
            movie_title = movie_data.get("title", "Unknown Title")
            
            poster_url = f"https://image.tmdb.org/t/p/w500{movie_data['poster_path']}" if movie_data.get('poster_path') else None
            genres = [g["name"] for g in movie_data.get("genres") or []]
            
            providers_data = movie_data.get("watch/providers") or {}
            results_data = providers_data.get("results") or {}
            local_streaming_platforms = build_streaming_platforms(results_data, movie_id, normalized_region)

            videos_data = movie_data.get("videos") or {}
            trailer_url = pick_youtube_video_url(videos_data.get("results", []))

            external_ids = movie_data.get("external_ids") or {}
            wikipedia_url = build_movie_wikipedia_url(
                title=movie_title,
                wikidata_id=external_ids.get("wikidata_id"),
                imdb_id=external_ids.get("imdb_id"),
            )

            release_info = ReleaseInfo(
                theatrical_release_date=safe_parse_date(movie_data.get("release_date")), 
                available_on=local_streaming_platforms
            )

            credits_data = movie_data.get("credits") or {}
            raw_cast = credits_data.get("cast", [])[:4] 
            raw_crew = credits_data.get("crew", [])
            raw_technicians = [m for m in raw_crew if m.get("job") in ["Director", "Original Music Composer", "Director of Photography"]][:4]

            cast_tasks = [fetch_person_data(client, person, True) for person in raw_cast]
            tech_tasks = [fetch_person_data(client, person, False) for person in raw_technicians]
            
            validated_cast = await asyncio.gather(*cast_tasks)
            validated_technicians = await asyncio.gather(*tech_tasks)

            final_response = MovieDetailResponse(
                id=movie_data["id"],
                title=movie_title,
                storyline=movie_data.get("overview", ""),
                genres=genres,
                poster_url=poster_url,
                trailer_url=trailer_url,
                wikipedia_url=wikipedia_url,
                release_details=release_info,
                lead_cast=list(validated_cast),
                technicians=list(validated_technicians)
            )

            final_response_data = final_response.model_dump(mode='json')

            new_cache_entry = MovieCache(
                movie_id=movie_id,
                movie_data=final_response_data
            )
            db.add(new_cache_entry)

    new_history = SearchHistory(
        movie_id=movie_id, 
        movie_title=movie_title
    )
    db.add(new_history)
    
    await db.commit()
    
    return final_response_data

@app.get("/api/v1/person/{person_id}", response_model=PersonDetailResponse)
async def get_person_details(person_id: int):
    url = f"{BASE_URL}/person/{person_id}"
    params = {"append_to_response": "external_ids,combined_credits", **AUTH_PARAMS}
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=HEADERS, params=params)
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Person not found")
            
        data = response.json()
        person_name = data.get("name", "Unknown")
        
        socials = build_social_links(data.get("external_ids") or {}, person_name)
        profile_url = f"https://image.tmdb.org/t/p/w500{data['profile_path']}" if data.get('profile_path') else None
        
        credits_data = data.get("combined_credits") or {}
        is_actor = data.get("known_for_department") == "Acting"
        raw_credits = credits_data.get("cast" if is_actor else "crew", [])
        
        sorted_credits = sorted(
            [c for c in raw_credits if c.get("release_date")], 
            key=lambda x: x.get("release_date", ""), 
            reverse=True
        )
        
        credits_list = []
        for item in sorted_credits:
            poster = f"https://image.tmdb.org/t/p/w500{item['poster_path']}" if item.get('poster_path') else None
            role = item.get("character") if is_actor else item.get("job")
            
            credits_list.append(MovieCredit(
                id=item["id"],
                title=item.get("title") or item.get("name") or "Unknown",
                poster_url=poster,
                release_date=safe_parse_date(item.get("release_date")),
                role=role or "Unknown"
            ))

        return PersonDetailResponse(
            id=data["id"],
            name=person_name,
            biography=data.get("biography") or "No biography available.",
            birthday=safe_parse_date(data.get("birthday")),
            place_of_birth=data.get("place_of_birth"),
            profile_url=profile_url,
            known_for_department=data.get("known_for_department", "Unknown"),
            social_handles=socials,
            credits=credits_list
        )

@app.post("/api/v1/user/watchlist")
async def add_to_watchlist(
    payload: WatchlistRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    # Check if the movie is already in this user's list
    result = await db.execute(
        select(Watchlist).where(Watchlist.user_id == user_id, Watchlist.movie_id == payload.movie_id)
    )
    existing_entry = result.scalars().first()
    
    if existing_entry:
        existing_entry.status = payload.status
    else:
        new_entry = Watchlist(user_id=user_id, movie_id=payload.movie_id, status=payload.status)
        db.add(new_entry)
        
    await db.commit()
    return {"message": "Watchlist updated successfully"}

@app.get("/api/v1/user/watchlist", response_model=List[WatchlistResponse])
async def get_watchlist(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    result = await db.execute(select(Watchlist).where(Watchlist.user_id == user_id))
    items = result.scalars().all()
    return items

@app.delete("/api/v1/user/watchlist/{movie_id}")
async def remove_from_watchlist(
    movie_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    result = await db.execute(
        select(Watchlist).where(Watchlist.user_id == user_id, Watchlist.movie_id == movie_id)
    )
    entry = result.scalars().first()
    if entry:
        await db.delete(entry)
        await db.commit()
    return {"message": "Removed from watchlist"}

@app.get("/api/v1/history")
async def get_search_history(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user) # <--- This secures the endpoint!
):
    result = await db.execute(select(SearchHistory).order_by(SearchHistory.searched_at.desc()).limit(10))
    history = result.scalars().all()
    return history
