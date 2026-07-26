"""Taste-vector recommendation core.

Builds a weighted centroid of the user's signal-movie embeddings (likes,
watched, watchlist; dislikes push away) and finds nearest-neighbour candidates
in pgvector. Availability filtering + hydration happen in main.py; this module
is pure retrieval + a cheap non-LLM "because you liked X" reason.
"""

from typing import Any, Dict, List

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import MovieEmbedding, Reaction, Watchlist

WEIGHTS = {"LIKE": 1.0, "WATCHED": 0.6, "WATCHLIST": 0.5, "DISLIKE": -0.8}
COLD_START_MIN_POSITIVE = 3
CANDIDATE_K = 60

# Priority for which positive signal labels an anchor (higher = preferred).
_POSITIVE_PRIORITY = ["LIKE", "WATCHED", "WATCHLIST"]
_REASON = {
    "LIKE": "Because you liked {t}",
    "WATCHED": "Because you watched {t}",
    "WATCHLIST": "From your watchlist: {t}",
}


async def _gather_signals(db: AsyncSession, user_id: str):
    """Returns (weights: movie_id->float, labels: movie_id->best positive label)."""
    weights: Dict[int, float] = {}
    labels: Dict[int, str] = {}

    def add(movie_id: int, weight: float, label: str | None) -> None:
        weights[movie_id] = weights.get(movie_id, 0.0) + weight
        if label and weight > 0:
            current = labels.get(movie_id)
            if current is None or _POSITIVE_PRIORITY.index(label) < _POSITIVE_PRIORITY.index(current):
                labels[movie_id] = label

    reactions = await db.execute(
        select(Reaction.movie_id, Reaction.reaction).where(Reaction.user_id == user_id)
    )
    for movie_id, reaction in reactions.all():
        add(movie_id, WEIGHTS.get(reaction, 0.0), reaction if reaction == "LIKE" else None)

    watchlist = await db.execute(
        select(Watchlist.movie_id, Watchlist.status).where(Watchlist.user_id == user_id)
    )
    for movie_id, status in watchlist.all():
        add(movie_id, WEIGHTS.get(status, 0.0), status)

    return weights, labels


async def compute_taste_vector(db: AsyncSession, user_id: str):
    """Returns (normalized taste vector as list[float] | None, seen_ids set)."""
    weights, _labels = await _gather_signals(db, user_id)
    seen_ids = set(weights.keys())
    positive = [mid for mid, w in weights.items() if w > 0]
    if len(positive) < COLD_START_MIN_POSITIVE:
        return None, seen_ids

    rows = (
        await db.execute(
            select(MovieEmbedding.movie_id, MovieEmbedding.embedding).where(
                MovieEmbedding.movie_id.in_(list(weights.keys()))
            )
        )
    ).all()
    if not rows:
        return None, seen_ids

    dim = np.asarray(rows[0][1], dtype=np.float32).shape[0]
    taste = np.zeros(dim, dtype=np.float32)
    for mid, emb in rows:
        taste += weights[mid] * np.asarray(emb, dtype=np.float32)
    norm = float(np.linalg.norm(taste))
    if norm == 0.0:
        return None, seen_ids
    return (taste / norm).tolist(), seen_ids


async def blend_recommendations(db: AsyncSession, user_a: str, user_b: str, k: int = 40) -> Dict[str, Any]:
    """Midpoint of two users' taste vectors → shared nearest-neighbour picks."""
    ta, seen_a = await compute_taste_vector(db, user_a)
    tb, seen_b = await compute_taste_vector(db, user_b)
    if ta is None or tb is None:
        return {"cold_start": True, "movie_ids": []}

    midpoint = np.asarray(ta, dtype=np.float32) + np.asarray(tb, dtype=np.float32)
    norm = float(np.linalg.norm(midpoint))
    if norm == 0.0:
        return {"cold_start": True, "movie_ids": []}
    midpoint = (midpoint / norm).tolist()

    exclude = seen_a | seen_b
    rows = (
        await db.execute(
            select(MovieEmbedding.movie_id)
            .where(MovieEmbedding.movie_id.notin_(list(exclude)))
            .order_by(MovieEmbedding.embedding.l2_distance(midpoint))
            .limit(k)
        )
    ).all()
    return {"cold_start": False, "movie_ids": [r[0] for r in rows]}


async def build_recommendations(db: AsyncSession, user_id: str) -> Dict[str, Any]:
    weights, labels = await _gather_signals(db, user_id)
    seen_ids = set(weights.keys())
    positive_ids = [mid for mid, w in weights.items() if w > 0]

    if len(positive_ids) < COLD_START_MIN_POSITIVE:
        return {
            "cold_start": True,
            "candidates": [],
            "seen_ids": list(seen_ids),
            "missing_ids": [],
            "anchor_titles": [],
        }

    rows = (
        await db.execute(
            select(MovieEmbedding.movie_id, MovieEmbedding.title, MovieEmbedding.embedding)
            .where(MovieEmbedding.movie_id.in_(list(weights.keys())))
        )
    ).all()
    embedded_ids = {r[0] for r in rows}
    missing_ids = [mid for mid in weights.keys() if mid not in embedded_ids]

    signal_vecs = [
        (mid, title, np.asarray(emb, dtype=np.float32), weights[mid]) for mid, title, emb in rows
    ]
    if not signal_vecs:
        return {
            "cold_start": True,
            "candidates": [],
            "seen_ids": list(seen_ids),
            "missing_ids": missing_ids,
            "anchor_titles": [],
        }

    # Top positive-signal titles (by weight) — context for the grounded "why".
    anchor_titles = [
        title for _mid, title, _v, _w in sorted(signal_vecs, key=lambda s: s[3], reverse=True) if _w > 0
    ][:5]

    # Weighted centroid, normalised.
    dim = signal_vecs[0][2].shape[0]
    taste = np.zeros(dim, dtype=np.float32)
    for _, _, vec, weight in signal_vecs:
        taste += weight * vec
    norm = float(np.linalg.norm(taste))
    if norm == 0.0:
        return {
            "cold_start": True,
            "candidates": [],
            "seen_ids": list(seen_ids),
            "missing_ids": missing_ids,
            "anchor_titles": anchor_titles,
        }
    taste = taste / norm

    anchors = [(mid, vec) for (mid, _t, vec, weight) in signal_vecs if weight > 0]
    title_by_id = {mid: title for (mid, title, _v, _w) in signal_vecs}

    cand_rows = (
        await db.execute(
            select(MovieEmbedding.movie_id, MovieEmbedding.embedding)
            .where(MovieEmbedding.movie_id.notin_(list(seen_ids)))
            .order_by(MovieEmbedding.embedding.l2_distance(taste.tolist()))
            .limit(CANDIDATE_K)
        )
    ).all()

    candidates: List[Dict[str, Any]] = []
    for mid, emb in cand_rows:
        vec = np.asarray(emb, dtype=np.float32)
        reason = None
        if anchors:
            best_id, _ = min(anchors, key=lambda a: float(np.linalg.norm(a[1] - vec)))
            template = _REASON.get(labels.get(best_id, "LIKE"), "Because you liked {t}")
            reason = template.format(t=title_by_id.get(best_id, "a movie you rated"))
        candidates.append({"movie_id": mid, "reason": reason})

    return {
        "cold_start": False,
        "candidates": candidates,
        "seen_ids": list(seen_ids),
        "missing_ids": missing_ids,
        "anchor_titles": anchor_titles,
    }
