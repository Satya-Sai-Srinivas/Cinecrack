import asyncio
import httpx
import os
from fastapi import FastAPI, HTTPException
from datetime import date
from typing import List, Optional, Any
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, HttpUrl

# --- Imports from models.py ---
from models import MovieDetailResponse, ReleaseInfo, StreamingPlatform, CastMember, Technician, SocialMediaLinks, WorkReference

# --- 1. Environment & Auto-Auth Setup ---
load_dotenv() 

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "").strip()
if not TMDB_API_KEY:
    raise ValueError("TMDB_API_KEY is missing. Please check your .env file.")

BASE_URL = "https://api.themoviedb.org/3"
HEADERS = {"accept": "application/json"}
AUTH_PARAMS = {}

# Auto-detect if you are using the v4 token (long) or v3 key (short)
if TMDB_API_KEY.startswith("eyJ"):
    HEADERS["Authorization"] = f"Bearer {TMDB_API_KEY}"
else:
    AUTH_PARAMS["api_key"] = TMDB_API_KEY

app = FastAPI(title="Movie Discovery API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. Helper Functions ---
def build_social_links(external_ids: dict) -> SocialMediaLinks:
    return SocialMediaLinks(
        instagram=f"https://instagram.com/{external_ids['instagram_id']}" if external_ids.get("instagram_id") else None,
        twitter=f"https://twitter.com/{external_ids['twitter_id']}" if external_ids.get("twitter_id") else None,
        facebook=f"https://facebook.com/{external_ids['facebook_id']}" if external_ids.get("facebook_id") else None,
        imdb=f"https://imdb.com/name/{external_ids['imdb_id']}" if external_ids.get("imdb_id") else None
    )

def safe_parse_date(date_string: str) -> Optional[date]:
    """Prevents the app from crashing if TMDb sends a weird date format."""
    if not date_string:
        return None
    try:
        return date.fromisoformat(date_string)
    except ValueError:
        return None

async def fetch_person_data(client: httpx.AsyncClient, person: dict, is_cast: bool) -> Any:
    person_id = person["id"]
    url = f"{BASE_URL}/person/{person_id}?append_to_response=external_ids,movie_credits"
    
    response = await client.get(url, headers=HEADERS, params=AUTH_PARAMS)
    data = response.json() if response.status_code == 200 else {}
    
    socials = build_social_links(data.get("external_ids", {}))
    past_works_data = data.get("movie_credits", {}).get("cast", [])
    sorted_works = sorted(past_works_data, key=lambda x: x.get("popularity", 0), reverse=True)[:3]
    
    well_known_for = [
        WorkReference(
            title=work.get("title", "Unknown"),
            release_year=int(work["release_date"][:4]) if work.get("release_date") else None
        )
        for work in sorted_works
    ]
    
    image_url = f"https://image.tmdb.org/t/p/w500{person['profile_path']}" if person.get("profile_path") else None

    if is_cast:
        return CastMember(name=person.get("name", "Unknown"), character_name=person.get("character", "Unknown"), image_url=image_url, social_handles=socials, well_known_for=well_known_for)
    else:
        return Technician(name=person.get("name", "Unknown"), department=person.get("department", "Unknown"), job=person.get("job", "Unknown"), image_url=image_url, social_handles=socials, well_known_for=well_known_for)

# --- 3. API Endpoints ---
class MoviePreview(BaseModel):
    id: int
    title: str
    poster_url: Optional[HttpUrl] = None
    release_date: Optional[date] = None

@app.get("/api/v1/movies/now-playing", response_model=List[MoviePreview])
async def get_now_playing(region: str = "US"):
    url = f"{BASE_URL}/movie/now_playing"
    params = {"region": region, "page": 1, **AUTH_PARAMS}
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=HEADERS, params=params)
        
        if response.status_code != 200:
            print(f"\n❌ TMDB API ERROR (Now Playing): {response.status_code} - {response.text}\n")
            raise HTTPException(status_code=response.status_code, detail=response.json())
            
        data = response.json()
        movies = []
        for item in data.get("results", [])[:12]: 
            poster = f"https://image.tmdb.org/t/p/w500{item['poster_path']}" if item.get('poster_path') else None
            movies.append(MoviePreview(
                id=item["id"], 
                title=item["title"], 
                poster_url=poster, 
                release_date=safe_parse_date(item.get("release_date"))
            ))
        return movies

@app.get("/api/v1/movies/{movie_id}", response_model=MovieDetailResponse)
async def get_movie_details(movie_id: int):
    url = f"{BASE_URL}/movie/{movie_id}"
    params = {"append_to_response": "credits,watch/providers", **AUTH_PARAMS}
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=HEADERS, params=params)
        
        if response.status_code != 200:
            print(f"\n❌ TMDB API ERROR (Movie Detail): {response.status_code} - {response.text}\n")
            raise HTTPException(status_code=response.status_code, detail=response.json())
            
        movie_data = response.json()
        poster_url = f"https://image.tmdb.org/t/p/w500{movie_data['poster_path']}" if movie_data.get('poster_path') else None
        genres = [g["name"] for g in movie_data.get("genres", [])]
        
        providers = movie_data.get("watch/providers", {}).get("results", {}).get("US", {})
        streaming_platforms = [StreamingPlatform(name=p["provider_name"]) for p in providers.get("flatrate", [])]
        
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

        return MovieDetailResponse(
            id=movie_data["id"],
            title=movie_data["title"],
            storyline=movie_data["overview"],
            genres=genres,
            poster_url=poster_url,
            release_details=release_info,
            lead_cast=list(validated_cast),
            technicians=list(validated_technicians)
        )

# --- 4. Mount Frontend ---
app.mount("/", StaticFiles(directory=".", html=True), name="static")