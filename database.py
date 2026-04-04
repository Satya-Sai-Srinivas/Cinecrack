import os
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import Column, Integer, DateTime, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from dotenv import load_dotenv
from sqlalchemy import String
from pgvector.sqlalchemy import Vector

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_async_engine(DATABASE_URL, echo=True)

AsyncSessionLocal = sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

Base = declarative_base()

class MovieCache(Base):
    __tablename__ = "movie_cache"
    
    movie_id = Column(Integer, primary_key=True, index=True)
    movie_data = Column(JSONB, nullable=False) 
    cached_at = Column(DateTime, default=datetime.utcnow)

class SearchHistory(Base):
    __tablename__ = "search_history"
    
    id = Column(Integer, primary_key=True, index=True)
    movie_id = Column(Integer, nullable=False)
    movie_title = Column(String, nullable=False)
    searched_at = Column(DateTime, default=datetime.utcnow)


class MovieEmbedding(Base):
    __tablename__ = "movie_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    movie_id = Column(Integer, nullable=False, unique=True, index=True)
    title = Column(String, nullable=False)
    storyline = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=False)


async def init_db():
    async with engine.begin() as conn:
        # await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session