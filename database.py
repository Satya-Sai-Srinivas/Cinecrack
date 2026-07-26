import os
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import Column, Integer, DateTime, Text, text, Index, UniqueConstraint
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

# Update your SearchHistory to include user_id
class SearchHistory(Base):
    __tablename__ = "search_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=True) # NEW: Links to Clerk user
    movie_id = Column(Integer, nullable=False)
    movie_title = Column(String, nullable=False)
    searched_at = Column(DateTime, default=datetime.utcnow)

# --- NEW TABLES FOR PHASE 2 ---

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, index=True) # This will store the Clerk User ID
    email = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Watchlist(Base):
    __tablename__ = "watchlist"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    movie_id = Column(Integer, index=True, nullable=False)
    status = Column(String, default="WATCHLIST") # Options: "WATCHLIST", "WATCHED"
    added_at = Column(DateTime, default=datetime.utcnow)

class ChatThread(Base):
    __tablename__ = "chat_threads"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    title = Column(String, default="New Conversation")
    created_at = Column(DateTime, default=datetime.utcnow)

class Reaction(Base):
    __tablename__ = "reactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    movie_id = Column(Integer, index=True, nullable=False)
    reaction = Column(String, nullable=False)  # "LIKE" or "DISLIKE"
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "movie_id", name="uq_reaction_user_movie"),
    )

class UserSubscription(Base):
    __tablename__ = "user_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    provider_id = Column(Integer, nullable=False)
    provider_name = Column(String, nullable=True)
    region = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "provider_id", "region", name="uq_sub_user_provider_region"),
    )

class RecommendationCache(Base):
    __tablename__ = "recommendation_cache"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    rec_date = Column(String, nullable=False)  # "YYYY-MM-DD:REGION"
    data = Column(JSONB, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "rec_date", name="uq_rec_user_date"),
    )

class MovieEmbedding(Base):
    __tablename__ = "movie_embeddings"
    __table_args__ = (
        Index(
            "ix_movie_embeddings_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_l2_ops"},
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    movie_id = Column(Integer, nullable=False, unique=True, index=True)
    title = Column(String, nullable=False)
    storyline = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session