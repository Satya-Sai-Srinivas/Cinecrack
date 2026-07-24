import os
from typing import Optional

import httpx
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)
# Add a default empty string to satisfy the type checker
CLERK_ISSUER = os.getenv("CLERK_ISSUER", "")

# Make this function async and use httpx.AsyncClient
async def get_clerk_jwks():
    jwks_url = f"{CLERK_ISSUER}/.well-known/jwks.json"
    async with httpx.AsyncClient() as client:
        response = await client.get(jwks_url)
        response.raise_for_status()
        return response.json()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> str:
    token = credentials.credentials
    try:
        # Await the new async function
        jwks = await get_clerk_jwks() 
        
        # Verify the token against Clerk's public keys
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            options={"verify_aud": False} 
        )
        
        # Ensure the return type matches the -> str annotation
        return str(payload.get("sub"))
        
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid authentication credentials: {str(e)}")


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(optional_security),
) -> Optional[str]:
    """Like get_current_user, but returns None instead of 401 when no/invalid token.

    Lets anonymous browsing keep working while attributing signed-in requests."""
    if credentials is None:
        return None
    try:
        jwks = await get_clerk_jwks()
        payload = jwt.decode(
            credentials.credentials,
            jwks,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            options={"verify_aud": False},
        )
        return str(payload.get("sub"))
    except JWTError:
        return None