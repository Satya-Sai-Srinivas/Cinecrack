from pydantic import BaseModel, HttpUrl, Field
from typing import List, Optional
from datetime import date

# --- Base Components ---

class SocialMediaLinks(BaseModel):
    instagram: Optional[HttpUrl] = Field(None, description="Instagram profile URL")
    twitter: Optional[HttpUrl] = Field(None, description="X/Twitter profile URL")
    facebook: Optional[HttpUrl] = Field(None, description="Facebook profile URL")
    imdb: Optional[HttpUrl] = Field(None, description="IMDb profile URL")

class WorkReference(BaseModel):
    title: str = Field(..., description="Title of the movie/show they are known for")
    release_year: Optional[int] = Field(None, description="Year of release")
    platform_link: Optional[HttpUrl] = Field(None, description="Where to stream this previous work")

# --- People (Cast & Crew) ---

class Person(BaseModel):
    name: str
    image_url: Optional[HttpUrl] = None
    social_handles: SocialMediaLinks
    well_known_for: List[WorkReference] = Field(default_factory=list)

class CastMember(Person):
    character_name: str

class Technician(Person):
    department: str = Field(..., description="e.g., Directing, Sound, Camera")
    job: str = Field(..., description="e.g., Director, Music Composer, Cinematographer")

# --- Reviews & Ratings ---

class Review(BaseModel):
    source: str = Field(..., description="e.g., IMDb, Rotten Tomatoes, User")
    score: str = Field(..., description="e.g., '8.5/10' or '85%'")
    review_snippet: Optional[str] = None
    url: Optional[HttpUrl] = None

# --- Release Information ---

class StreamingPlatform(BaseModel):
    name: str = Field(..., description="e.g., Netflix, Amazon Prime")
    link: HttpUrl

class ReleaseInfo(BaseModel):
    theatrical_release_date: Optional[date] = None
    is_in_theaters: bool = False
    ott_release_date: Optional[date] = None
    available_on: List[StreamingPlatform] = Field(default_factory=list)

# --- Main Movie Response Model ---

class MovieDetailResponse(BaseModel):
    id: int
    title: str
    storyline: str
    genres: List[str]
    poster_url: Optional[HttpUrl] = None
    trailer_url: Optional[HttpUrl] = None
    
    # Nested Relationships
    release_details: ReleaseInfo
    ratings_and_reviews: List[Review] = Field(default_factory=list)
    lead_cast: List[CastMember] = Field(default_factory=list)
    technicians: List[Technician] = Field(default_factory=list)