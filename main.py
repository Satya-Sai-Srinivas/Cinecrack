import asyncio
import httpx
import os
from fastapi import FastAPI, HTTPException
from datetime import date
from pydantic import BaseModel, HttpUrl, Field
from typing import List, Optional, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from fastapi.staticfiles import StaticFiles

# This command finds your .env file and loads the variables into os.environ
load_dotenv() 

# Now this will securely pull the key from the hidden file!
TMDB_API_KEY = os.getenv("TMDB_API_KEY")

if not TMDB_API_KEY:
    raise ValueError("TMDB_API_KEY is missing. Please check your .env file.")

BASE_URL = "https://api.themoviedb.org/3"
HEADERS = {"Authorization": f"Bearer {TMDB_API_KEY}", "accept": "application/json"}

app = FastAPI(title="Movie Discovery API")

# --- 1. Pydantic Models (From earlier) ---

class SocialMediaLinks(BaseModel):
    instagram: Optional[HttpUrl] = None
    twitter: Optional[HttpUrl] = None
    facebook: Optional[HttpUrl] = None
    imdb: Optional[HttpUrl] = None

class WorkReference(BaseModel):
    title: str
    release_year: Optional[int] = None

class Person(BaseModel):
    name: str
    image_url: Optional[HttpUrl] = None
    social_handles: SocialMediaLinks
    well_known_for: List[WorkReference] = Field(default_factory=list)

class CastMember(Person):
    character_name: str

class Technician(Person):
    department: str
    job: str

class StreamingPlatform(BaseModel):
    name: str
    link: Optional[HttpUrl] = None

class ReleaseInfo(BaseModel):
    theatrical_release_date: Optional[date] = None
    available_on: List[StreamingPlatform] = Field(default_factory=list)

class MovieDetailResponse(BaseModel):
    id: int
    title: str
    storyline: str
    genres: List[str]
    poster_url: Optional[HttpUrl] = None
    release_details: ReleaseInfo
    lead_cast: List[CastMember] = Field(default_factory=list)
    technicians: List[Technician] = Field(default_factory=list)

# --- 2. FastAPI Setup & TMDb Constants ---

app = FastAPI(title="Movie Discovery API")

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "YOUR_TMDB_API_KEY") 
BASE_URL = "https://api.themoviedb.org/3"
HEADERS = {"Authorization": f"Bearer {TMDB_API_KEY}", "accept": "application/json"}

# --- 3. Helper Functions ---

def build_social_links(external_ids: dict) -> SocialMediaLinks:
    """Safely constructs full URLs from TMDb's external IDs."""
    return SocialMediaLinks(
        instagram=f"https://instagram.com/{external_ids['instagram_id']}" if external_ids.get("instagram_id") else None,
        twitter=f"https://twitter.com/{external_ids['twitter_id']}" if external_ids.get("twitter_id") else None,
        facebook=f"https://facebook.com/{external_ids['facebook_id']}" if external_ids.get("facebook_id") else None,
        imdb=f"https://imdb.com/name/{external_ids['imdb_id']}" if external_ids.get("imdb_id") else None
    )

async def fetch_person_data(client: httpx.AsyncClient, person: dict, is_cast: bool) -> Any:
    """Fetches deep data for a person and maps it directly to a Pydantic model."""
    person_id = person["id"]
    url = f"{BASE_URL}/person/{person_id}?append_to_response=external_ids,movie_credits"
    
    response = await client.get(url, headers=HEADERS)
    data = response.json() if response.status_code == 200 else {}
    
    # Extract Socials and Works
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

    # Return the appropriate Pydantic object based on role
    if is_cast:
        return CastMember(
            name=person.get("name", "Unknown"),
            character_name=person.get("character", "Unknown"),
            image_url=image_url,
            social_handles=socials,
            well_known_for=well_known_for
        )
    else:
        return Technician(
            name=person.get("name", "Unknown"),
            department=person.get("department", "Unknown"),
            job=person.get("job", "Unknown"),
            image_url=image_url,
            social_handles=socials,
            well_known_for=well_known_for
        )

# --- 4. The Main Endpoint ---

@app.get("/api/v1/movies/{movie_id}", response_model=MovieDetailResponse)
async def get_movie_details(movie_id: int):
    """
    Fetches a movie by TMDb ID, aggregates its cast/crew socials, 
    and validates the output via Pydantic.
    """
    url = f"{BASE_URL}/movie/{movie_id}?append_to_response=credits,watch/providers"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=HEADERS)
        if response.status_code != 200:
            raise HTTPException(status_code=404, detail="Movie not found on TMDb")
            
        movie_data = response.json()
        
        # 1. Base Movie Info
        poster_url = f"https://image.tmdb.org/t/p/w500{movie_data['poster_path']}" if movie_data.get('poster_path') else None
        genres = [g["name"] for g in movie_data.get("genres", [])]
        
        # 2. Release Info & Streaming (Checking US region for example)
        release_date = movie_data.get("release_date")
        parsed_date = date.fromisoformat(release_date) if release_date else None
        
        providers = movie_data.get("watch/providers", {}).get("results", {}).get("US", {})
        streaming_platforms = [
            StreamingPlatform(name=p["provider_name"]) 
            for p in providers.get("flatrate", [])
        ]
        
        release_info = ReleaseInfo(
            theatrical_release_date=parsed_date,
            available_on=streaming_platforms
        )

        # 3. Filter Top Cast and Key Technicians
        raw_cast = movie_data.get("credits", {}).get("cast", [])[:4] # Top 4 actors
        raw_crew = movie_data.get("credits", {}).get("crew", [])
        raw_technicians = [
            m for m in raw_crew 
            if m.get("job") in ["Director", "Original Music Composer", "Director of Photography"]
        ][:4]

        # 4. Fetch Deep Data Concurrently
        cast_tasks = [fetch_person_data(client, person, is_cast=True) for person in raw_cast]
        tech_tasks = [fetch_person_data(client, person, is_cast=False) for person in raw_technicians]
        
        # Await all network calls simultaneously
        validated_cast = await asyncio.gather(*cast_tasks)
        validated_technicians = await asyncio.gather(*tech_tasks)

        # 5. Assemble and Return the Final Validated Model
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace "*" with your frontend's actual URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/", StaticFiles(directory=".", html=True), name="static")