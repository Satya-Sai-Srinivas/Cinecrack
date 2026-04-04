import asyncio
import httpx
import os
from fastapi import FastAPI, HTTPException, Depends
from datetime import date
from typing import List, Optional, Any
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, HttpUrl
from datetime import datetime, timedelta

# --- Database Imports ---
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import get_db, MovieCache, SearchHistory, engine, Base
from contextlib import asynccontextmanager

# --- Models Imports ---
from models import MovieDetailResponse, ReleaseInfo, StreamingPlatform, CastMember, Technician, SocialMediaLinks, WorkReference

# --- 1. Environment Setup ---
load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "").strip()
if not TMDB_API_KEY:
    raise ValueError("TMDB_API_KEY is missing. Please check your .env file.")

BASE_URL = "https://api.themoviedb.org/3"
HEADERS = {"accept": "application/json"}
AUTH_PARAMS = {}

# Auto-detect auth method
if TMDB_API_KEY.startswith("eyJ"):
    HEADERS["Authorization"] = f"Bearer {TMDB_API_KEY}"
else:
    AUTH_PARAMS["api_key"] = TMDB_API_KEY

# --- 2. App Init & Database Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # This automatically creates your cache and history tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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
def build_social_links(external_ids: dict) -> SocialMediaLinks:
    return SocialMediaLinks(
        instagram=f"https://instagram.com/{external_ids['instagram_id']}" if external_ids.get("instagram_id") else None,
        twitter=f"https://twitter.com/{external_ids['twitter_id']}" if external_ids.get("twitter_id") else None,
        facebook=f"https://facebook.com/{external_ids['facebook_id']}" if external_ids.get("facebook_id") else None,
        imdb=f"https://imdb.com/name/{external_ids['imdb_id']}" if external_ids.get("imdb_id") else None
    )

def safe_parse_date(date_string: str) -> Optional[date]:
    if not date_string:
        return None
    try:
        return date.fromisoformat(date_string)
    except ValueError:
        return None

async def fetch_person_data(client: httpx.AsyncClient, person: dict, is_cast: bool) -> Any:
    person_id = person["id"]
    
    url = f"{BASE_URL}/person/{person_id}"
    params = {"append_to_response": "external_ids,movie_credits", **AUTH_PARAMS}
    
    response = await client.get(url, headers=HEADERS, params=params)
    
    if response.status_code != 200:
        print(f"⚠️ TMDB ERROR for person {person_id}: {response.status_code} - {response.text}")
        data = {}
    else:
        data = response.json()
        
    socials = build_social_links(data.get("external_ids", {}))
    credits_key = "cast" if is_cast else "crew"
    past_works_data = data.get("movie_credits", {}).get(credits_key, [])
    
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
        
    print(f"🎬 Fetched {len(well_known_for)} past works for {person.get('name', 'Unknown')}")
    
    image_url = f"https://image.tmdb.org/t/p/w500{person['profile_path']}" if person.get("profile_path") else None

    if is_cast:
        return CastMember(name=person.get("name", "Unknown"), character_name=person.get("character", "Unknown"), image_url=image_url, social_handles=socials, well_known_for=well_known_for)
    else:
        return Technician(name=person.get("name", "Unknown"), department=person.get("department", "Unknown"), job=person.get("job", "Unknown"), image_url=image_url, social_handles=socials, well_known_for=well_known_for)


class MoviePreview(BaseModel):
    id: int
    title: str
    poster_url: Optional[HttpUrl] = None
    release_date: Optional[date] = None

# --- 4. API Endpoints ---
@app.get("/api/v1/movies/now-playing", response_model=List[MoviePreview])
async def get_now_playing(region: str = "US", lang: str = "all", page: int = 1):
    """Fetches movies with pagination and advanced filtering."""
    
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
            "page": page, # Dynamically passed page
            **AUTH_PARAMS
        }
    else:
        url = f"{BASE_URL}/movie/now_playing"
        params = {"region": region, "page": page, **AUTH_PARAMS} # Dynamically passed page
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=HEADERS, params=params)
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
            
        data = response.json()
        movies = []
        
        # TMDb returns 20 results per page automatically
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
    """Searches TMDb by movie name with pagination."""
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


@app.get("/api/v1/movies/{movie_id}", response_model=MovieDetailResponse)
async def get_movie_details(movie_id: int, db: AsyncSession = Depends(get_db)):
    """Fetches full details, using PostgreSQL to cache and track history."""
    
    result = await db.execute(select(MovieCache).where(MovieCache.movie_id == movie_id))
    cached_movie = result.scalars().first()
    
    movie_title = ""
    final_response_data = None

    if cached_movie:
        print(f"⚡ FAST FETCH: Movie {movie_id} found in PostgreSQL Cache!")
        final_response_data = cached_movie.movie_data
        movie_title = final_response_data.get("title", "Unknown Title")
        
    else:
        print(f"🐢 SLOW FETCH: Requesting movie {movie_id} from TMDb API...")
        url = f"{BASE_URL}/movie/{movie_id}"
        params = {"append_to_response": "credits,watch/providers", **AUTH_PARAMS}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=HEADERS, params=params)
            
            if response.status_code != 200:
                print(f"\n❌ TMDB API ERROR (Movie Detail): {response.status_code} - {response.text}\n")
                raise HTTPException(status_code=response.status_code, detail=response.json())
                
            movie_data = response.json()
            movie_title = movie_data.get("title", "Unknown Title")
            
            poster_url = f"https://image.tmdb.org/t/p/w500{movie_data['poster_path']}" if movie_data.get('poster_path') else None
            genres = [g["name"] for g in movie_data.get("genres", [])]
            
            providers = movie_data.get("watch/providers", {}).get("results", {}).get("US", {})
            
            tmdb_url = f"https://www.themoviedb.org/movie/{movie_id}/watch"
            streaming_platforms = [
                StreamingPlatform(name=p["provider_name"], link=tmdb_url) 
                for p in providers.get("flatrate", [])
            ]
            
            release_info = ReleaseInfo(
                theatrical_release_date=safe_parse_date(movie_data.get("release_date")), 
                available_on=streaming_platforms
            )

            raw_cast = movie_data.get("credits", {}).get("cast", [])[:4] 
            raw_crew = movie_data.get("credits", {}).get("crew", [])
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

@app.get("/api/v1/history")
async def get_search_history(db: AsyncSession = Depends(get_db)):
    """Returns the 10 most recent successful searches."""
    result = await db.execute(select(SearchHistory).order_by(SearchHistory.searched_at.desc()).limit(10))
    history = result.scalars().all()
    return history

# --- 5. Mount Frontend ---
app.mount("/", StaticFiles(directory=".", html=True), name="static")