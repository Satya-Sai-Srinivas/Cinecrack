import os
import httpx
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

security = HTTPBearer()
CLERK_ISSUER = os.getenv("CLERK_ISSUER")

# Fetch Clerk's public JWKS to decode the tokens
def get_clerk_jwks():
    jwks_url = f"{CLERK_ISSUER}/.well-known/jwks.json"
    response = httpx.get(jwks_url)
    response.raise_for_status()
    return response.json()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> str:
    token = credentials.credentials
    try:
        jwks = get_clerk_jwks()
        
        # Verify the token against Clerk's public keys
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            options={"verify_aud": False} 
        )
        
        # Return the Clerk User ID (a string like 'user_2bX...')
        return payload.get("sub")
        
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid authentication credentials: {str(e)}")