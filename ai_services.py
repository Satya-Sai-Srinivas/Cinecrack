import os
from typing import Any, Dict, List, Optional

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import MovieEmbedding

EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")

_embedding_client = OpenAIEmbeddings(model=EMBEDDING_MODEL)
_chat_client = ChatOpenAI(model=CHAT_MODEL, temperature=0.75)


def _build_prompt() -> ChatPromptTemplate:
    return ChatPromptTemplate.from_messages(
        [
            (
                "system",
                (
                    "You are AI Cinema Guru, an emotionally intelligent and cinematic movie expert. "
                    "Only use the provided movie context when making recommendations. "
                    "Do not invent movie facts. If context is insufficient, say so gracefully and suggest "
                    "how the user can refine their request. "
                    "Style guidelines: vivid, warm, concise, and magical-but-practical. "
                    "Return plain text only."
                ),
            ),
            (
                "human",
                (
                    "Conversation so far:\n{conversation_history}\n\n"
                    "User query:\n{query}\n\n"
                    "Retrieved movie context:\n{movie_context}\n\n"
                    "Craft a cinematic response with:\n"
                    "1) A direct answer to the request.\n"
                    "2) Why the suggested films match.\n"
                    "3) One optional follow-up question.\n"
                ),
            ),
        ]
    )


def _format_history(conversation_history: Optional[List[Dict[str, Any]]]) -> str:
    if not conversation_history:
        return "No prior conversation."

    lines: List[str] = []
    for turn in conversation_history[-12:]:
        role = str(turn.get("role", "user")).strip().lower()
        content = str(turn.get("content", "")).strip()
        if not content:
            continue
        if role not in {"user", "assistant"}:
            role = "user"
        lines.append(f"{role.title()}: {content}")

    return "\n".join(lines) if lines else "No prior conversation."


def _format_movie_context(movies: List[MovieEmbedding]) -> str:
    if not movies:
        return "No movie context retrieved."

    lines: List[str] = []
    for idx, movie in enumerate(movies, start=1):
        lines.append(
            (
                f"{idx}. TMDB_ID={movie.movie_id}\n"
                f"Title: {movie.title}\n"
                f"Storyline: {movie.storyline}\n"
            )
        )
    return "\n".join(lines)


async def generate_embedding(text_input: str) -> List[float]:
    cleaned = text_input.strip()
    if not cleaned:
        return []
    return await _embedding_client.aembed_query(cleaned)


async def similarity_search_movies(
    db: AsyncSession, query_embedding: List[float], top_k: int = 5
) -> List[MovieEmbedding]:
    if not query_embedding:
        return []

    stmt = (
        select(MovieEmbedding)
        .order_by(MovieEmbedding.embedding.l2_distance(query_embedding))
        .limit(top_k)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def generate_cinematic_reply(
    query: str,
    conversation_history: Optional[List[Dict[str, Any]]],
    retrieved_movies: List[MovieEmbedding],
) -> str:
    chain = _build_prompt() | _chat_client | StrOutputParser()
    return await chain.ainvoke(
        {
            "query": query,
            "conversation_history": _format_history(conversation_history),
            "movie_context": _format_movie_context(retrieved_movies),
        }
    )
