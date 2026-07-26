import asyncio
import httpx
import os
import json
import urllib.parse
import re
from fastapi import FastAPI, HTTPException, Depends, Query, BackgroundTasks
from datetime import date
from typing import List, Optional, Any, Dict
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl, Field
from datetime import datetime, timedelta
from auth import get_current_user, get_optional_user
from database import Watchlist, User, ChatThread, Reaction, UserSubscription, RecommendationCache # Add the new tables
from models import WatchlistRequest, WatchlistResponse, ReactionRequest, SubscriptionRequest, AskRequest # Add the new models
from fastapi import Request
import httpx

# --- Database Imports ---
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from database import get_db, MovieCache, SearchHistory, init_db, MovieEmbedding, ChatMessage, AsyncSessionLocal
from contextlib import asynccontextmanager
from ai_services import generate_embedding, similarity_search_movies, stream_cinematic_reply, generate_why, answer_movie_question
from embedding_service import ensure_movie_embedding
from recommender import build_recommendations

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


async def hydrate_movie_previews(db: AsyncSession, movie_ids: List[int]) -> List["MoviePreview"]:
    """Turn a list of movie_ids into MoviePreview cards, using MovieCache first
    and falling back to concurrent TMDB lookups for anything not cached."""
    if not movie_ids:
        return []

    cache_result = await db.execute(
        select(MovieCache).where(MovieCache.movie_id.in_(movie_ids))
    )
    cached = {entry.movie_id: entry.movie_data for entry in cache_result.scalars().all()}

    async def fetch_card(client: httpx.AsyncClient, movie_id: int) -> Optional[Dict[str, Any]]:
        try:
            response = await client.get(
                f"{BASE_URL}/movie/{movie_id}", headers=HEADERS, params=AUTH_PARAMS
            )
            if response.status_code == 200:
                payload = response.json()
                return {
                    "title": payload.get("title", "Unknown"),
                    "poster_url": (
                        f"https://image.tmdb.org/t/p/w500{payload['poster_path']}"
                        if payload.get("poster_path")
                        else None
                    ),
                    "release_date": payload.get("release_date"),
                }
        except httpx.HTTPError:
            pass
        return None

    missing = [movie_id for movie_id in movie_ids if movie_id not in cached]
    fetched: Dict[int, Optional[Dict[str, Any]]] = {}
    if missing:
        async with httpx.AsyncClient(timeout=20.0) as client:
            results = await asyncio.gather(
                *[fetch_card(client, movie_id) for movie_id in missing],
                return_exceptions=True,
            )
            for movie_id, res in zip(missing, results):
                fetched[movie_id] = res if isinstance(res, dict) else None

    previews: List[MoviePreview] = []
    for movie_id in movie_ids:
        data = cached.get(movie_id)
        if data:
            title = data.get("title", "Unknown")
            poster = data.get("poster_url")
            release_raw = (data.get("release_details") or {}).get("theatrical_release_date")
        else:
            card = fetched.get(movie_id)
            if not card:
                continue
            title, poster, release_raw = card["title"], card["poster_url"], card["release_date"]

        previews.append(
            MoviePreview(
                id=movie_id,
                title=title,
                poster_url=poster,
                release_date=safe_parse_date(release_raw),
            )
        )
    return previews


# --- Recommendation helpers ---
REC_MIN_ACCESSIBLE = 8
REC_MAX_PICKS = 20


async def _fetch_flatrate_batch(movie_ids: List[int], region: str) -> Dict[int, set]:
    """Concurrently fetch the set of flatrate provider ids for each movie in a region."""
    if not movie_ids:
        return {}

    async def one(client: httpx.AsyncClient, movie_id: int):
        try:
            r = await client.get(
                f"{BASE_URL}/movie/{movie_id}/watch/providers",
                headers=HEADERS,
                params=AUTH_PARAMS,
            )
            if r.status_code == 200:
                data = ((r.json() or {}).get("results") or {}).get(region) or {}
                return movie_id, {p["provider_id"] for p in data.get("flatrate", [])}
        except httpx.HTTPError:
            pass
        return movie_id, set()

    async with httpx.AsyncClient(timeout=20.0) as client:
        results = await asyncio.gather(
            *[one(client, mid) for mid in movie_ids], return_exceptions=True
        )
    out: Dict[int, set] = {}
    for res in results:
        if isinstance(res, tuple):
            out[res[0]] = res[1]
    return out


async def _rec_cards(
    db: AsyncSession,
    movie_ids: List[int],
    reason_map: Optional[Dict[int, Optional[str]]] = None,
    accessible_ids: Optional[set] = None,
) -> List[Dict[str, Any]]:
    previews = await hydrate_movie_previews(db, movie_ids)
    reason_map = reason_map or {}
    cards: List[Dict[str, Any]] = []
    for p in previews:
        card = p.model_dump(mode="json")
        card["reason"] = reason_map.get(p.id)
        card["available"] = (p.id in accessible_ids) if accessible_ids is not None else None
        cards.append(card)
    return cards


async def _build_personalized(
    db: AsyncSession,
    region: str,
    sub_ids: set,
    candidates: List[Dict[str, Any]],
    anchor_titles: Optional[List[str]] = None,
) -> Dict[str, Any]:
    candidate_ids = [c["movie_id"] for c in candidates]
    reason_map = {c["movie_id"]: c["reason"] for c in candidates}

    accessible_ids: set = set()
    if sub_ids and candidate_ids:
        provider_sets = await _fetch_flatrate_batch(candidate_ids, region)
        accessible_ids = {mid for mid, pids in provider_sets.items() if pids & sub_ids}

    if sub_ids and len(accessible_ids) >= REC_MIN_ACCESSIBLE:
        ordered = [mid for mid in candidate_ids if mid in accessible_ids]
    else:
        # Relax: accessible first, then the rest in similarity order.
        ordered = [mid for mid in candidate_ids if mid in accessible_ids] + [
            mid for mid in candidate_ids if mid not in accessible_ids
        ]

    cards = await _rec_cards(
        db, ordered[:REC_MAX_PICKS], reason_map, accessible_ids if sub_ids else None
    )

    # Grounded LLM "why this fits you" for the Movie of the Day only (cached daily).
    if cards:
        motd = cards[0]
        storyline = (
            await db.execute(
                select(MovieEmbedding.storyline).where(MovieEmbedding.movie_id == motd["id"])
            )
        ).scalar_one_or_none()
        if storyline:
            why = await generate_why(motd["title"], storyline, anchor_titles or [])
            if why:
                motd["why"] = why

    return {
        "movie_of_the_day": cards[0] if cards else None,
        "picks": cards[1:] if len(cards) > 1 else [],
    }


async def _build_cold_start(db: AsyncSession, region: str, sub_ids: set) -> Dict[str, Any]:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/movie/popular", headers=HEADERS, params={"page": 1, **AUTH_PARAMS}
        )
    items = response.json().get("results", []) if response.status_code == 200 else []
    ids = [it["id"] for it in items][:REC_MAX_PICKS]

    if sub_ids and ids:
        provider_sets = await _fetch_flatrate_batch(ids, region)
        accessible = [mid for mid in ids if provider_sets.get(mid, set()) & sub_ids]
        if len(accessible) >= REC_MIN_ACCESSIBLE:
            ids = accessible

    cards = await _rec_cards(db, ids[:REC_MAX_PICKS])
    return {
        "movie_of_the_day": cards[0] if cards else None,
        "picks": cards[1:] if len(cards) > 1 else [],
    }


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
async def ai_chat(
    payload: AIChatRequest,
    db: AsyncSession = Depends(get_db),
    user_id: Optional[str] = Depends(get_optional_user),
):
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

    if user_id:
        # Recently viewed movies (this user only)
        viewed_result = await db.execute(
            select(SearchHistory)
            .where(SearchHistory.user_id == user_id)
            .order_by(SearchHistory.searched_at.desc())
            .limit(15)
        )
        viewed_titles = list(
            dict.fromkeys([h.movie_title for h in viewed_result.scalars().all()])
        )

        # Saved watchlist titles (resolved via the movie cache)
        watchlist_result = await db.execute(
            select(Watchlist.movie_id).where(Watchlist.user_id == user_id)
        )
        watchlist_ids = list(watchlist_result.scalars().all())
        saved_titles: List[str] = []
        if watchlist_ids:
            saved_cache = await db.execute(
                select(MovieCache).where(MovieCache.movie_id.in_(watchlist_ids))
            )
            saved_titles = [
                (entry.movie_data or {}).get("title")
                for entry in saved_cache.scalars().all()
                if (entry.movie_data or {}).get("title")
            ]

        # Liked / disliked (reactions), resolved to titles via the movie cache.
        reaction_result = await db.execute(
            select(Reaction.movie_id, Reaction.reaction).where(Reaction.user_id == user_id)
        )
        liked_ids, disliked_ids = [], []
        for mid, reaction in reaction_result.all():
            (liked_ids if reaction == "LIKE" else disliked_ids).append(mid)
        react_title_by_id: Dict[int, str] = {}
        if liked_ids or disliked_ids:
            rc = await db.execute(
                select(MovieCache).where(MovieCache.movie_id.in_(liked_ids + disliked_ids))
            )
            for entry in rc.scalars().all():
                t = (entry.movie_data or {}).get("title")
                if t:
                    react_title_by_id[entry.movie_id] = t
        liked_titles = [react_title_by_id[m] for m in liked_ids if m in react_title_by_id]
        disliked_titles = [react_title_by_id[m] for m in disliked_ids if m in react_title_by_id]

        history_parts: List[str] = []
        if liked_titles:
            history_parts.append("Liked: " + ", ".join(liked_titles))
        if disliked_titles:
            history_parts.append("Disliked: " + ", ".join(disliked_titles))
        if viewed_titles:
            history_parts.append("Recently viewed: " + ", ".join(viewed_titles))
        if saved_titles:
            history_parts.append("Saved to watchlist: " + ", ".join(saved_titles))
        user_history_str = (
            "\n".join(history_parts)
            if history_parts
            else "The signed-in user has not viewed or saved any movies yet."
        )
    else:
        user_history_str = "The user is browsing anonymously (no personal history available)."

    # Persistent memory: for signed-in users the server is the source of truth for
    # conversation history. Load prior turns, then persist this user message.
    persist_reply = False
    if user_id:
        prior = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.user_id == user_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(20)
        )
        prior_msgs = list(reversed(prior.scalars().all()))
        history_payload = [{"role": m.role, "content": m.content} for m in prior_msgs]
        db.add(ChatMessage(user_id=user_id, role="user", content=payload.query))
        await db.commit()
        persist_reply = True

    async def event_generator():
        assistant_text = ""
        try:
            if not retrieved_movies:
                fallback = (
                    "I could not find enough cinematic memory yet. Seed embeddings first, then ask again "
                    "and I will craft a richer recommendation."
                )
                assistant_text = fallback
                yield _sse_event({"type": "text", "content": fallback})
            else:
                async for stream_chunk in stream_cinematic_reply(
                    query=payload.query,
                    conversation_history=history_payload,
                    retrieved_movies=retrieved_movies,
                    user_history=user_history_str
                ):
                    if stream_chunk.get("type") == "text":
                        assistant_text += stream_chunk.get("content", "")
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
        finally:
            # Persist the assistant reply with a fresh session (the request session
            # may already be closed by the time streaming finishes).
            if persist_reply and assistant_text.strip():
                try:
                    async with AsyncSessionLocal() as session:
                        session.add(
                            ChatMessage(user_id=user_id, role="assistant", content=assistant_text.strip())
                        )
                        await session.commit()
                except Exception:
                    pass

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# --- Persistent chat history (single conversation per user) ---
@app.get("/api/v1/user/chat/messages")
async def get_chat_messages(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return [{"role": m.role, "content": m.content} for m in result.scalars().all()]

@app.delete("/api/v1/user/chat/messages")
async def clear_chat_messages(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    await db.execute(delete(ChatMessage).where(ChatMessage.user_id == user_id))
    await db.commit()
    return {"message": "Chat cleared"}

# --- Config endpoints (country / language pickers) ---
_config_cache: Dict[str, List[Dict[str, str]]] = {}


async def _load_tmdb_config(kind: str, path: str, id_field: str) -> List[Dict[str, str]]:
    """Cached proxy of a TMDB /configuration list (countries or languages)."""
    if kind in _config_cache:
        return _config_cache[kind]

    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/{path}", headers=HEADERS, params=AUTH_PARAMS)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Failed to load {kind}")
        data = response.json()

    items = sorted(
        [
            {
                "code": entry[id_field],
                "name": entry.get("english_name") or entry.get("name") or entry[id_field],
            }
            for entry in data
            if entry.get(id_field)
        ],
        key=lambda item: item["name"],
    )
    _config_cache[kind] = items
    return items


@app.get("/api/v1/config/countries")
async def get_countries():
    return await _load_tmdb_config("countries", "configuration/countries", "iso_3166_1")


@app.get("/api/v1/config/languages")
async def get_languages():
    return await _load_tmdb_config("languages", "configuration/languages", "iso_639_1")


@app.get("/api/v1/config/providers")
async def get_providers(region: str = "US"):
    """Cached list of streaming providers available in a region (for the toggles)."""
    region = (region or "US").upper()
    cache_key = f"providers:{region}"
    if cache_key in _config_cache:
        return _config_cache[cache_key]

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/watch/providers/movie",
            headers=HEADERS,
            params={"watch_region": region, **AUTH_PARAMS},
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Failed to load providers")
        data = response.json()

    providers = sorted(
        [
            {
                "provider_id": p["provider_id"],
                "provider_name": p.get("provider_name", "Unknown"),
                "logo_url": (
                    f"https://image.tmdb.org/t/p/w92{p['logo_path']}" if p.get("logo_path") else None
                ),
                "priority": p.get("display_priority", 9999),
            }
            for p in data.get("results", [])
        ],
        key=lambda p: (p["priority"], p["provider_name"].lower()),
    )
    _config_cache[cache_key] = providers
    return providers


@app.get("/api/v1/movies/{movie_id}", response_model=MovieDetailResponse)
async def get_movie_details(
    movie_id: int,
    region: str = "US",
    db: AsyncSession = Depends(get_db),
    user_id: Optional[str] = Depends(get_optional_user),
):
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
        user_id=user_id,
        movie_id=movie_id,
        movie_title=movie_title
    )
    db.add(new_history)
    
    await db.commit()
    
    return final_response_data

@app.get("/api/v1/movies/{movie_id}/providers")
async def get_movie_providers(
    movie_id: int,
    region: str = "US",
    db: AsyncSession = Depends(get_db),
    user_id: Optional[str] = Depends(get_optional_user),
):
    """Streaming availability for a movie in a region, flagging services the
    signed-in user is subscribed to. Data from TMDB / JustWatch."""
    region = (region or "US").upper()

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/movie/{movie_id}/watch/providers",
            headers=HEADERS,
            params=AUTH_PARAMS,
        )

    region_data: Dict[str, Any] = {}
    if response.status_code == 200:
        region_data = ((response.json() or {}).get("results") or {}).get(region) or {}

    subscribed_ids: set = set()
    if user_id:
        sub_result = await db.execute(
            select(UserSubscription.provider_id).where(
                UserSubscription.user_id == user_id,
                UserSubscription.region == region,
            )
        )
        subscribed_ids = set(sub_result.scalars().all())

    def fmt(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [
            {
                "provider_id": p["provider_id"],
                "provider_name": p.get("provider_name", "Unknown"),
                "logo_url": (
                    f"https://image.tmdb.org/t/p/w92{p['logo_path']}" if p.get("logo_path") else None
                ),
                "subscribed": p["provider_id"] in subscribed_ids,
            }
            for p in items
        ]

    return {
        "region": region,
        "link": region_data.get("link"),
        "flatrate": fmt(region_data.get("flatrate", [])),
        "rent": fmt(region_data.get("rent", [])),
        "buy": fmt(region_data.get("buy", [])),
    }

async def _gather_movie_plot(db: AsyncSession, movie_id: int):
    """Best-effort (title, plot) for a movie: stored storyline, TMDB overview,
    and a live Wikipedia plot when available (for richer spoiler-aware answers)."""
    title = None
    plot = None
    row = (
        await db.execute(
            select(MovieEmbedding.title, MovieEmbedding.storyline).where(
                MovieEmbedding.movie_id == movie_id
            )
        )
    ).first()
    if row:
        title, plot = row[0], row[1]

    release_date = ""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{BASE_URL}/movie/{movie_id}", headers=HEADERS, params=AUTH_PARAMS
        )
        if response.status_code == 200:
            data = response.json()
            title = title or data.get("title")
            release_date = data.get("release_date", "") or ""
            if not plot:
                plot = data.get("overview")
        try:
            from seed_embeddings import fetch_wikipedia_plot

            wiki = await fetch_wikipedia_plot(client, title or "", release_date)
            if wiki:
                plot = wiki
        except Exception:
            pass

    return title or "this movie", plot or "No plot information available."


@app.post("/api/v1/movies/{movie_id}/ask")
async def ask_about_movie(
    movie_id: int,
    payload: AskRequest,
    db: AsyncSession = Depends(get_db),
):
    title, plot = await _gather_movie_plot(db, movie_id)
    answer = await answer_movie_question(title, plot, payload.question, payload.reveal_spoilers)
    return {"answer": answer}

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

async def ensure_user(db: AsyncSession, user_id: str) -> None:
    """Create a users row on first sight (the caller is responsible for commit)."""
    existing = await db.execute(select(User).where(User.id == user_id))
    if existing.scalars().first() is None:
        db.add(User(id=user_id))


@app.post("/api/v1/user/watchlist")
async def add_to_watchlist(
    payload: WatchlistRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    await ensure_user(db, user_id)

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

    # Embed-on-interaction: make sure this movie is in the recommender's pool.
    background_tasks.add_task(ensure_movie_embedding, payload.movie_id)

    return {"message": "Watchlist updated successfully"}

@app.get("/api/v1/user/watchlist", response_model=List[WatchlistResponse])
async def get_watchlist(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    result = await db.execute(select(Watchlist).where(Watchlist.user_id == user_id))
    items = result.scalars().all()
    return items

@app.get("/api/v1/user/watchlist/movies", response_model=List[MoviePreview])
async def get_watchlist_movies(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    stmt = select(Watchlist).where(Watchlist.user_id == user_id)
    if status:
        stmt = stmt.where(Watchlist.status == status.upper())
    stmt = stmt.order_by(Watchlist.added_at.desc())

    result = await db.execute(stmt)
    movie_ids = [w.movie_id for w in result.scalars().all()]
    return await hydrate_movie_previews(db, movie_ids)

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

# --- Reactions (like / dislike) ---
@app.get("/api/v1/user/reactions")
async def get_reactions(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    result = await db.execute(select(Reaction).where(Reaction.user_id == user_id))
    return [{"movie_id": r.movie_id, "reaction": r.reaction} for r in result.scalars().all()]

@app.post("/api/v1/user/reactions")
async def set_reaction(
    payload: ReactionRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    value = payload.reaction.upper()
    if value not in ("LIKE", "DISLIKE"):
        raise HTTPException(status_code=400, detail="reaction must be 'LIKE' or 'DISLIKE'")

    await ensure_user(db, user_id)

    result = await db.execute(
        select(Reaction).where(Reaction.user_id == user_id, Reaction.movie_id == payload.movie_id)
    )
    existing = result.scalars().first()
    if existing:
        existing.reaction = value
    else:
        db.add(Reaction(user_id=user_id, movie_id=payload.movie_id, reaction=value))

    await db.commit()

    # Embed-on-interaction: a like/dislike is a strong taste signal.
    background_tasks.add_task(ensure_movie_embedding, payload.movie_id)

    return {"message": "Reaction saved"}

@app.delete("/api/v1/user/reactions/{movie_id}")
async def clear_reaction(
    movie_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    result = await db.execute(
        select(Reaction).where(Reaction.user_id == user_id, Reaction.movie_id == movie_id)
    )
    existing = result.scalars().first()
    if existing:
        await db.delete(existing)
        await db.commit()
    return {"message": "Reaction cleared"}

# --- Streaming subscriptions ---
@app.get("/api/v1/user/subscriptions")
async def get_subscriptions(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    result = await db.execute(select(UserSubscription).where(UserSubscription.user_id == user_id))
    return [
        {"provider_id": s.provider_id, "provider_name": s.provider_name, "region": s.region}
        for s in result.scalars().all()
    ]

@app.post("/api/v1/user/subscriptions")
async def add_subscription(
    payload: SubscriptionRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    await ensure_user(db, user_id)
    region = payload.region.upper()
    result = await db.execute(
        select(UserSubscription).where(
            UserSubscription.user_id == user_id,
            UserSubscription.provider_id == payload.provider_id,
            UserSubscription.region == region,
        )
    )
    if result.scalars().first() is None:
        db.add(
            UserSubscription(
                user_id=user_id,
                provider_id=payload.provider_id,
                provider_name=payload.provider_name,
                region=region,
            )
        )
        await db.commit()
    return {"message": "Subscription added"}

@app.delete("/api/v1/user/subscriptions/{provider_id}")
async def remove_subscription(
    provider_id: int,
    region: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    result = await db.execute(
        select(UserSubscription).where(
            UserSubscription.user_id == user_id,
            UserSubscription.provider_id == provider_id,
            UserSubscription.region == (region or "").upper(),
        )
    )
    entry = result.scalars().first()
    if entry:
        await db.delete(entry)
        await db.commit()
    return {"message": "Subscription removed"}

# --- Personalized recommendations ---
@app.get("/api/v1/recommendations")
async def get_recommendations(
    background_tasks: BackgroundTasks,
    region: str = "US",
    refresh: int = 0,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    region = (region or "US").upper()
    cache_key = f"{datetime.utcnow().strftime('%Y-%m-%d')}:{region}"

    if not refresh:
        cached = await db.execute(
            select(RecommendationCache).where(
                RecommendationCache.user_id == user_id,
                RecommendationCache.rec_date == cache_key,
            )
        )
        row = cached.scalars().first()
        if row:
            return row.data

    rec = await build_recommendations(db, user_id)

    # Re-embed any signal movies that slipped through, so next time is richer.
    for mid in rec.get("missing_ids", []):
        background_tasks.add_task(ensure_movie_embedding, mid)

    sub_result = await db.execute(
        select(UserSubscription.provider_id).where(
            UserSubscription.user_id == user_id,
            UserSubscription.region == region,
        )
    )
    sub_ids = set(sub_result.scalars().all())

    if rec["cold_start"]:
        # Not cached — flips to personalized as soon as the user rates enough movies.
        payload = await _build_cold_start(db, region, sub_ids)
        payload["cold_start"] = True
        return payload

    payload = await _build_personalized(
        db, region, sub_ids, rec["candidates"], rec.get("anchor_titles")
    )
    payload["cold_start"] = False

    existing = await db.execute(
        select(RecommendationCache).where(
            RecommendationCache.user_id == user_id,
            RecommendationCache.rec_date == cache_key,
        )
    )
    ex = existing.scalars().first()
    if ex:
        ex.data = payload
    else:
        db.add(RecommendationCache(user_id=user_id, rec_date=cache_key, data=payload))
    await db.commit()
    return payload

@app.get("/api/v1/history")
async def get_search_history(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user) # <--- This secures the endpoint!
):
    result = await db.execute(
        select(SearchHistory)
        .where(SearchHistory.user_id == user_id)
        .order_by(SearchHistory.searched_at.desc())
        .limit(50)
    )
    history = result.scalars().all()
    return history
