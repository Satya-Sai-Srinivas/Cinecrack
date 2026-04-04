import asyncio
import httpx
import os
from typing import Dict, Any

# Ensure you have your API key stored in your environment variables
TMDB_API_KEY = os.getenv("TMDB_API_KEY", "your_api_key_here")
BASE_URL = "https://api.themoviedb.org/3"
HEADERS = {
    "Authorization": f"Bearer {TMDB_API_KEY}",
    "accept": "application/json"
}

async def fetch_person_socials_and_work(client: httpx.AsyncClient, person_id: int) -> Dict[str, Any]:
    """
    Fetches a person's social media handles and their most popular previous works.
    """
    url = f"{BASE_URL}/person/{person_id}?append_to_response=external_ids,movie_credits"
    response = await client.get(url, headers=HEADERS)
    
    if response.status_code != 200:
        return {"socials": {}, "well_known_for": []}
        
    data = response.json()
    
    # Extract social IDs (TMDb provides IDs, you build the URL later in FastAPI)
    socials = data.get("external_ids", {})
    
    # Sort past movies by popularity to get the "Well Known For" list (top 3)
    past_works = data.get("movie_credits", {}).get("cast", [])
    sorted_works = sorted(past_works, key=lambda x: x.get("popularity", 0), reverse=True)[:3]
    
    well_known_for = [
        {"title": work.get("title"), "release_year": int(work.get("release_date", "0")[:4]) if work.get("release_date") else None}
        for work in sorted_works
    ]
    
    return {"socials": socials, "well_known_for": well_known_for}

async def fetch_movie_comprehensive(movie_id: int) -> Dict[str, Any]:
    """
    Fetches the main movie details, credits, and watch providers in one call,
    then concurrently fetches social media data for the key cast and crew.
    """
    # append_to_response gathers everything in one giant JSON payload
    url = f"{BASE_URL}/movie/{movie_id}?append_to_response=credits,watch/providers,release_dates"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=HEADERS)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch movie: {response.status_code}")
            
        movie_data = response.json()
        
        # 1. Extract Base Data
        title = movie_data.get("title")
        storyline = movie_data.get("overview")
        genres = [g["name"] for g in movie_data.get("genres", [])]
        
        # 2. Extract OTT / Streaming Platforms (US/IN region example)
        providers = movie_data.get("watch/providers", {}).get("results", {}).get("IN", {}) # Change "IN" to "US" if needed
        flatrate_streaming = [p["provider_name"] for p in providers.get("flatrate", [])]
        
        # 3. Extract Top Cast & Key Technicians (Limit to top 3 cast and the Director/Composer to save API calls)
        cast = movie_data.get("credits", {}).get("cast", [])[:3]
        crew = movie_data.get("credits", {}).get("crew", [])
        
        technicians = [
            member for member in crew 
            if member.get("job") in ["Director", "Original Music Composer", "Director of Photography"]
        ]

        # 4. Concurrently fetch the deep dive data (Socials & Past Works) for these people
        print(f"Fetching deep data for {len(cast)} cast members and {len(technicians)} technicians...")
        
        person_tasks = []
        for person in cast + technicians:
            person_tasks.append(fetch_person_socials_and_work(client, person["id"]))
            
        # Run all person API calls simultaneously
        people_deep_data = await asyncio.gather(*person_tasks)
        
        # Combine the basic person data with their deep data
        for i, person in enumerate(cast + technicians):
            person["deep_data"] = people_deep_data[i]
            
        return {
            "title": title,
            "storyline": storyline,
            "genres": genres,
            "streaming_on": flatrate_streaming,
            "cast_and_crew_details": cast + technicians
        }

# --- Execution ---
if __name__ == "__main__":
    # Example TMDb ID (e.g., 693134 for Dune: Part Two, or 811941 for Devara: Part 1)
    TEST_MOVIE_ID = 811941 
    
    print("Starting data fetch...")
    result = asyncio.run(fetch_movie_comprehensive(TEST_MOVIE_ID))
    
    print(f"\n--- Results for: {result['title']} ---")
    print(f"Genres: {', '.join(result['genres'])}")
    print(f"Streaming On: {', '.join(result['streaming_on']) if result['streaming_on'] else 'Not yet available on streaming'}\n")
    
    print("Key People:")
    for person in result['cast_and_crew_details']:
        role = person.get("character") or person.get("job")
        social_instagram = person["deep_data"]["socials"].get("instagram_id", "N/A")
        print(f"- {person['name']} ({role}) | IG: {social_instagram}")
        print(f"  Known for: {[w['title'] for w in person['deep_data']['well_known_for']]}")