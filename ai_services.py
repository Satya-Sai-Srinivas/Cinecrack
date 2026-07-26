import os
import json
from typing import Any, AsyncGenerator, Dict, List, Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import MovieEmbedding

EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")

_embedding_client = OpenAIEmbeddings(model=EMBEDDING_MODEL)
_chat_client = ChatOpenAI(model=CHAT_MODEL, temperature=0.1)
# Separate low-temp client for short, grounded one-off generations.
_utility_client = ChatOpenAI(model=CHAT_MODEL, temperature=0.3)


async def generate_why(title: str, storyline: str, anchor_titles: List[str]) -> Optional[str]:
    """One concise, plot-grounded sentence on why this fits the user's taste."""
    liked = ", ".join(anchor_titles[:5]) if anchor_titles else "movies they enjoy"
    system = (
        "You are a sharp movie critic. In ONE concise sentence (max 30 words), explain why "
        "someone who liked the given movies would enjoy this film. Ground it ONLY in the "
        "provided plot. No spoilers. No fluff or generic phrases like 'a must-watch', "
        "'rollercoaster', or 'rich tapestry'. Speak like a real human."
    )
    human = f"Movies they liked: {liked}\n\nFilm: {title}\nPlot: {storyline}\n\nWhy would they like it?"
    try:
        response = await _utility_client.ainvoke([("system", system), ("human", human)])
        text = (response.content if isinstance(response.content, str) else "").strip()
        return text or None
    except Exception:
        return None


async def answer_movie_question(
    title: str, plot: str, question: str, reveal_spoilers: bool
) -> str:
    """Answer a question about a movie, grounded in its plot, with a spoiler guard."""
    if reveal_spoilers:
        spoiler_rule = "You MAY reveal spoilers, including the ending and any twists."
    else:
        spoiler_rule = (
            "Do NOT reveal spoilers — no endings, deaths, or twists. If the honest answer "
            "would require a spoiler, say so and suggest enabling spoilers, rather than revealing it."
        )
    system = (
        f"You answer questions about the movie '{title}' using ONLY the provided plot. "
        f"Be concise and direct. {spoiler_rule} If the plot doesn't contain the answer, "
        "say you don't have that detail."
    )
    human = f"Plot:\n{plot}\n\nQuestion: {question}"
    try:
        response = await _utility_client.ainvoke([("system", system), ("human", human)])
        text = (response.content if isinstance(response.content, str) else "").strip()
        return text or "Sorry, I couldn't find an answer to that."
    except Exception:
        return "Sorry, I couldn't answer that right now."


@tool("apply_discover_filters")
def apply_discover_filters_tool(genre_id: int, start_year: int, min_rating: float) -> Dict[str, Any]:
    """Use this when user explicitly asks discover/filter-style requests by genre/year/rating."""
    return {
        "genre_id": int(genre_id),
        "start_year": int(start_year),
        "min_rating": float(min_rating),
    }


_tool_enabled_chat_client = _chat_client.bind_tools([apply_discover_filters_tool])


def _build_prompt() -> ChatPromptTemplate:
    return ChatPromptTemplate.from_messages(
        [
            (
                "system",
                (
                    "You are AI Cinema Guru, a sharp, emotionally intelligent movie expert. "
                    "CRITICAL RULES:\n"
                    "1. Be Concise: Limit movie descriptions to a single, punchy sentence focusing on mood and plot.\n"
                    "2. No Fluff: NEVER use generic phrases like 'indelible mark', 'delves deep', 'rich tapestry', 'masterpiece', or 'rollercoaster ride'. Speak like a real human critic.\n"
                    "3. Grounded Honesty: Only recommend based on the provided context. If a retrieved movie is a campy B-movie, describe it honestly—do not over-hype it to fit the user's prompt.\n"
                    "4. Structure: Reply with a brief intro, a bulleted list of movies, and one optional short follow-up question. DO NOT write a concluding summary paragraph.\n"
                    "If the user intent is to discover/filter movies by constraints such as genre + year + rating, "
                    "call the tool apply_discover_filters with appropriate values. Return plain text only."
                ),
            ),
            (
                "human",
                (
                    "User Watch/Search History:\n{user_history}\n\n" # NEW
                    "Conversation so far:\n{conversation_history}\n\n"
                    "User query:\n{query}\n\n"
                    "Retrieved movie context:\n{movie_context}\n\n"
                    "Craft your response following the strict concise structure."
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
    db: AsyncSession, raw_query: str, query_embedding: List[float], top_k: int = 5
) -> List[MovieEmbedding]:
    cleaned_query = raw_query.strip()
    if not cleaned_query and not query_embedding:
        return []

    ranked: List[MovieEmbedding] = []
    seen_movie_ids = set()

    if cleaned_query:
        exact_stmt = (
            select(MovieEmbedding)
            .where(func.lower(MovieEmbedding.title) == cleaned_query.lower())
            .limit(top_k)
        )
        exact_result = await db.execute(exact_stmt)
        for movie in exact_result.scalars().all():
            if movie.movie_id not in seen_movie_ids:
                seen_movie_ids.add(movie.movie_id)
                ranked.append(movie)
            if len(ranked) >= top_k:
                return ranked

        keyword_pattern = f"%{cleaned_query}%"
        keyword_stmt = (
            select(MovieEmbedding)
            .where(
                or_(
                    MovieEmbedding.title.ilike(keyword_pattern),
                    MovieEmbedding.storyline.ilike(keyword_pattern),
                )
            )
            .limit(top_k * 2)
        )
        keyword_result = await db.execute(keyword_stmt)
        for movie in keyword_result.scalars().all():
            if movie.movie_id not in seen_movie_ids:
                seen_movie_ids.add(movie.movie_id)
                ranked.append(movie)
            if len(ranked) >= top_k:
                return ranked

    if query_embedding:
        semantic_stmt = (
            select(MovieEmbedding)
            .order_by(MovieEmbedding.embedding.l2_distance(query_embedding))
            .limit(top_k * 3)
        )
        semantic_result = await db.execute(semantic_stmt)
        for movie in semantic_result.scalars().all():
            if movie.movie_id not in seen_movie_ids:
                seen_movie_ids.add(movie.movie_id)
                ranked.append(movie)
            if len(ranked) >= top_k:
                break

    return ranked[:top_k]


async def stream_cinematic_reply(
    query: str,
    conversation_history: Optional[List[Dict[str, Any]]],
    retrieved_movies: List[MovieEmbedding],
    user_history: str # NEW
) -> AsyncGenerator[Dict[str, Any], None]:
    prompt = _build_prompt()
    messages = prompt.format_messages(
        query=query,
        conversation_history=_format_history(conversation_history),
        movie_context=_format_movie_context(retrieved_movies),
        user_history=user_history # NEW
    )

    tool_buffers: Dict[int, Dict[str, str]] = {}
    emitted_text = False

    async for chunk in _tool_enabled_chat_client.astream(messages):
        chunk_text = chunk.content if isinstance(chunk.content, str) else ""
        if chunk_text:
            emitted_text = True
            yield {"type": "text", "content": chunk_text}

        for tool_chunk in getattr(chunk, "tool_call_chunks", []) or []:
            if isinstance(tool_chunk, dict):
                idx = int(tool_chunk.get("index", 0) or 0)
                name = str(tool_chunk.get("name") or "")
                args_fragment = str(tool_chunk.get("args") or "")
            else:
                idx = int(getattr(tool_chunk, "index", 0) or 0)
                name = str(getattr(tool_chunk, "name", "") or "")
                args_fragment = str(getattr(tool_chunk, "args", "") or "")

            current = tool_buffers.setdefault(idx, {"name": "", "args": ""})
            if name:
                current["name"] = name
            if args_fragment:
                current["args"] += args_fragment

    if not emitted_text:
        yield {
            "type": "text",
            "content": "I can tune this recommendation more precisely if you add mood, tone, or ending preferences.",
        }

    for _, payload in sorted(tool_buffers.items(), key=lambda item: item[0]):
        if payload.get("name") != "apply_discover_filters":
            continue
        parsed_args: Dict[str, Any] = {}
        raw_args = payload.get("args", "").strip()
        if raw_args:
            try:
                parsed_args = json.loads(raw_args)
            except json.JSONDecodeError:
                parsed_args = {}
        if parsed_args:
            yield {
                "type": "tool_call",
                "tool": "apply_discover_filters",
                "arguments": parsed_args,
            }
            break
