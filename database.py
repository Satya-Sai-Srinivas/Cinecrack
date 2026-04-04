import os
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import Column, Integer, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from dotenv import load_dotenv
from sqlalchemy import String

load_dotenv()

# We pull this from your .env file
DATABASE_URL = os.getenv("DATABASE_URL")

# --- Database Connection Setup ---
# echo=True is helpful for debugging; it shows you the SQL commands in the terminal
engine = create_async_engine(DATABASE_URL, echo=True)

# This creates a "session factory" to handle database tasks asynchronously
AsyncSessionLocal = sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

Base = declarative_base()

# --- The Smart Cache Table ---
class MovieCache(Base):
    __tablename__ = "movie_cache"
    
    # movie_id matches the TMDb ID
    movie_id = Column(Integer, primary_key=True, index=True)
    # JSONB stores the entire TMDb response as a fast-querying binary JSON
    movie_data = Column(JSONB, nullable=False) 
    cached_at = Column(DateTime, default=datetime.utcnow)


class SearchHistory(Base):
    __tablename__ = "search_history"
    
    id = Column(Integer, primary_key=True, index=True)
    movie_id = Column(Integer, nullable=False)
    movie_title = Column(String, nullable=False)
    searched_at = Column(DateTime, default=datetime.utcnow)
# This dependency provides a database session to your FastAPI routes
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session