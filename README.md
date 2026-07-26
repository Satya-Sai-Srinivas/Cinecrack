# 🎬 Cinecrack

**An AI-native movie discovery companion that learns your taste and tells you what to watch — and where you can actually watch it.**

Cinecrack goes beyond "here's what's popular." It builds a personal **taste vector** from what you like, watch, and save, then uses semantic search over movie plot embeddings to recommend films you'll love — filtered down to what's streaming on services you already pay for, in your country. It also ships a memory-aware AI movie chatbot, spoiler-safe plot Q&A, "now streaming" alerts, and shareable taste profiles.

🔗 **Live app:** [cinecrack.vercel.app](https://cinecrack.vercel.app)

---

## Table of contents

- [What it does](#what-it-does)
- [Features](#features)
- [How the recommendation engine works](#how-the-recommendation-engine-works)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started (local)](#getting-started-local)
- [Environment variables](#environment-variables)
- [Deployment](#deployment)
- [API reference](#api-reference)
- [Attribution & license](#attribution--license)

---

## What it does

Cinecrack is a full-stack web app with three layers of value:

1. **Discovery** — browse now-playing movies by country and language, search, filter by genre/year/rating, and drill into rich movie & cast/crew detail pages.
2. **Personalization** — the more you interact (like / dislike / mark watched / save), the sharper your recommendations get. A "Movie of the Day" and a "Top picks for you" shelf appear on the home page, each grounded in *why* it fits your taste.
3. **Utility & retention** — see where every movie streams (filtered to your subscriptions), get notified when a watchlisted movie lands on a service you have, and share a public taste profile that friends can "blend" with for movie night.

---

## Features

### 🔎 Discovery
- **Now Playing** by any country + language (both driven by the live TMDB configuration).
- **Search** movies with infinite scroll.
- **Discover** with genre, language, year-range, and minimum-rating filters.
- **Movie detail** — poster, genres, trailer, Wikipedia link, streaming availability, lead cast & crew.
- **Person profiles** — biography, socials, and full filmography.

### 🧠 AI-native personalization
- **Taste-vector recommender** — averages the embeddings of the movies you've rated into a taste centroid and finds nearest-neighbor matches in `pgvector` (see [below](#how-the-recommendation-engine-works)).
- **Movie of the Day** — a daily-stable personalized hero pick with a **plot-grounded LLM explanation** of why it fits you.
- **"Because you liked X"** reasons on every recommendation.
- **Availability-aware** — recommendations are filtered to what's streaming on *your* services in *your* region (relaxes gracefully if too few).
- **Cold-start** handling — new users get popular picks and a nudge to rate a few films.

### 💬 AI Cinema Guru (chatbot)
- Conversational, RAG-powered movie recommendations with streaming (SSE) responses.
- **Persistent memory** — your conversation is saved server-side and restored across sessions.
- **Taste-aware** — the Guru knows what you've liked, disliked, and watched.
- **LLM tool-calling** — asking for "sci-fi from the 2010s rated 8+" navigates you straight to a filtered Discover view.

### ❓ Spoiler-safe plot Q&A
- Ask any movie "how does it end?" / "does the dog die?" with a **spoilers on/off** toggle. Answers are grounded in the plot (with a live Wikipedia fetch for richer context).

### 📺 Watchlist, watched & reactions
- **Watchlist** ("want to see") and **Watched** ("seen") — Letterboxd-style: marking watched moves it out of your watchlist.
- **Like / dislike** reactions — the strongest signal feeding the recommender.

### 🔔 Streaming & alerts
- **Where to watch** — provider logos per region, highlighting the services you already have.
- **My Services** — declare your subscriptions with logo toggles (+ a first-run onboarding prompt).
- **"Now streaming" alerts** — a scheduled job diffs your watchlist against streaming availability and notifies you (in-app bell) when a movie lands on a service you subscribe to.

### 🔗 Growth
- **Shareable taste profile** — a public `/u/:slug` page with your top genres, an AI-written taste summary, and your favorites.
- **"What should we watch?"** — blend two users' taste vectors into shared movie-night picks.

---

## How the recommendation engine works

This is the core of the project:

1. **Embedding coverage.** Every movie in the candidate pool (and every movie a user interacts with) is embedded with OpenAI `text-embedding-3-small` (1536-dim) from a text blob of its title, genres, cast, and plot. Embeddings are stored in Postgres via the `pgvector` extension with an HNSW index. Movies users engage with are embedded on the fly ("embed-on-interaction").

2. **Taste vector.** The user's signals are weighted — `LIKE +1.0`, `WATCHED +0.6`, `WATCHLIST +0.5`, `DISLIKE −0.8` — and their movie embeddings are combined into a normalized centroid.

3. **Candidate retrieval.** A nearest-neighbor search (`embedding <-> taste_vector`) returns the closest movies, excluding anything the user has already seen.

4. **Availability filter.** Candidates are checked against the user's streaming subscriptions (via TMDB/JustWatch watch-provider data) for their region.

5. **Explanation.** The top pick gets a one-sentence, plot-grounded "why this fits you" from `gpt-4o-mini`; the rest get a cheap "Because you liked X" via the nearest taste anchor.

6. **Caching.** Personalized results are cached per user per day so "Movie of the Day" is stable and cheap; new ratings invalidate the cache.

The same taste-vector math powers the **blend** feature — averaging two users' vectors to find films you'd both enjoy.

---

## Tech stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) (async) + [Uvicorn](https://www.uvicorn.org/)
- [SQLAlchemy 2.0](https://www.sqlalchemy.org/) (async) + [asyncpg](https://github.com/MagicStack/asyncpg)
- **PostgreSQL** + [`pgvector`](https://github.com/pgvector/pgvector) for semantic search
- [OpenAI](https://platform.openai.com/) via [LangChain](https://www.langchain.com/) — `text-embedding-3-small` + `gpt-4o-mini`
- [Clerk](https://clerk.com/) JWT auth
- [TMDB](https://www.themoviedb.org/) API (movies, people, watch providers) + Wikipedia (plots)

**Frontend**
- [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- [React Router 7](https://reactrouter.com/), [TanStack Query 5](https://tanstack.com/query), [Zustand 5](https://zustand-demo.pmnd.rs/)
- [Tailwind CSS](https://tailwindcss.com/), [Clerk React](https://clerk.com/docs/references/react/overview), [lucide-react](https://lucide.dev/)

**Infrastructure (all runnable on free tiers)**
- Database → [Supabase](https://supabase.com/) (Postgres + pgvector)
- Backend → [Render](https://render.com/) (Docker)
- Frontend → [Vercel](https://vercel.com/)
- Scheduled jobs → GitHub Actions cron

---

## Architecture

```
  React SPA (Vite)                 FastAPI backend                PostgreSQL + pgvector
  ----------------                 ---------------                ---------------------
  - Clerk auth        HTTPS/SSE    - TMDB + Wikipedia   async     - movie embeddings
  - TanStack Query   <-------->    - OpenAI (embed+LLM) <----->   - users, watchlist,
  - Zustand                        - Clerk JWT verify   SQLAlch.    reactions, subs, ...
  [ Vercel ]                       [ Render / Docker ]            [ Supabase ]

  GitHub Actions (cron)  --->  POST /internal/check-availability   (now-streaming alerts)
```

---

## Project structure

```
Cinecrack/
├── main.py                 # FastAPI app: all API endpoints
├── database.py             # SQLAlchemy models + async engine (pgvector)
├── models.py               # Pydantic request/response schemas
├── auth.py                 # Clerk JWT verification (required + optional)
├── ai_services.py          # Embeddings, RAG chat, grounded "why", plot Q&A, taste summary
├── recommender.py          # Taste-vector math + candidate retrieval + blend
├── embedding_service.py    # Embed-on-interaction
├── seed_embeddings.py      # One-time script to seed the candidate pool
├── requirements.txt
├── Dockerfile
├── .github/workflows/
│   └── availability-check.yml   # Daily "now streaming" cron
└── frontend-react/
    └── src/
        ├── pages/          # Home, Discover, MovieDetail, PersonProfile,
        │                   # Watchlist, History, Settings, PublicProfile
        ├── components/     # movie/, layout/, chatbot/, profile/, ui/
        ├── hooks/          # useMovieStatus, useSubscriptions, useAIChat, …
        ├── store/          # Zustand stores (theme, region, chat)
        └── api/            # Typed API client
```

---

## Getting started (local)

### Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- A **PostgreSQL** database with the `pgvector` extension (a free [Supabase](https://supabase.com/) project works great)
- API keys: [TMDB](https://www.themoviedb.org/settings/api), [OpenAI](https://platform.openai.com/api-keys), [Clerk](https://dashboard.clerk.com/)

### 1. Backend

```bash
git clone https://github.com/Satya-Sai-Srinivas/Cinecrack.git
cd Cinecrack

python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Create a .env file (see the table below), then run:
uvicorn main:app --reload --port 8000
```

The app auto-creates all tables on startup.

### 2. Seed the recommendation pool (one-time)

The recommender needs a pool of embedded movies to draw from:

```bash
# Fast mode: ~1,000 popular movies embedded from title/genres/overview (~2 min)
EMBEDDING_LITE=1 EMBEDDING_SEED_PAGES=50 python seed_embeddings.py
```

Omit `EMBEDDING_LITE` for richer (but slower) Wikipedia-enriched plot embeddings.

### 3. Frontend

```bash
cd frontend-react
npm install

# Create frontend-react/.env (see below), then:
npm run dev
```

Open http://localhost:5173.

---

## Environment variables

### Backend (`.env` in repo root)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres URL in **async** form: `postgresql+asyncpg://user:pass@host/db` (use Supabase's *Session pooler* string; drop `?sslmode=require`) |
| `TMDB_API_KEY` | TMDB API key or v4 bearer token |
| `OPENAI_API_KEY` | OpenAI API key (embeddings + chat) |
| `CLERK_ISSUER` | Clerk issuer URL, e.g. `https://your-app.clerk.accounts.dev` |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `OPENAI_CHAT_MODEL` | *(optional)* chat model, defaults to `gpt-4o-mini` |
| `CRON_SECRET` | *(deploy only)* shared secret protecting the availability-check endpoint |
| `EMBEDDING_SEED_PAGES` / `EMBEDDING_LITE` | *(seed script only)* pool size + fast mode |

### Frontend (`frontend-react/.env`)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend base URL (e.g. `http://localhost:8000` locally) — **no trailing slash** |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |

> ⚠️ Vite bakes `VITE_*` variables in at **build time** — set them in your host's dashboard before building, and redeploy after changing them.

---

## Deployment

The whole stack runs on free tiers.

1. **Database — Supabase:** create a project, enable the `vector` extension (Database → Extensions), and copy the **Session pooler** connection string (IPv4-friendly). Convert it to `postgresql+asyncpg://…` for `DATABASE_URL`.
2. **Backend — Render:** create a **Web Service** from this repo (it auto-detects the `Dockerfile`), set all backend env vars, and deploy. Render injects `PORT` automatically.
3. **Seed** the embeddings once (locally, pointed at Supabase).
4. **Frontend — Vercel:** import the repo, set `VITE_API_BASE_URL` (your Render URL) and `VITE_CLERK_PUBLISHABLE_KEY`, and deploy.
5. **Now-streaming alerts — GitHub Actions:** add repo secrets `BACKEND_URL` and `CRON_SECRET` (matching Render's), and the included [`availability-check.yml`](.github/workflows/availability-check.yml) workflow runs the check daily (scheduled workflows run from the default branch).

---

## API reference

A selection of the REST API (`/api/v1` prefix). Endpoints marked 🔒 require a Clerk JWT.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/movies/now-playing` | Now playing by region + language |
| `GET` | `/movies/search` | Search movies |
| `GET` | `/movies/discover` | Filtered discovery |
| `GET` | `/movies/{id}` | Movie detail (cached) |
| `GET` | `/movies/{id}/providers` | Streaming availability |
| `POST`| `/movies/{id}/ask` | Spoiler-safe plot Q&A |
| `GET` | `/person/{id}` | Person profile |
| `POST`| `/ai/chat` | Streaming (SSE) AI Guru chat |
| `GET/POST/DELETE` | `/user/watchlist*` 🔒 | Watchlist / watched |
| `GET/POST/DELETE` | `/user/reactions*` 🔒 | Like / dislike |
| `GET/POST/DELETE` | `/user/subscriptions*` 🔒 | Streaming subscriptions |
| `GET` | `/recommendations` 🔒 | Personalized recs + Movie of the Day |
| `GET` | `/recommendations/blend` 🔒 | Two-user taste blend |
| `GET/POST/DELETE` | `/user/profile/share` 🔒 | Manage share link |
| `GET` | `/profile/{slug}` | Public taste profile |
| `GET/POST` | `/user/notifications*` 🔒 | Notification center |
| `POST`| `/internal/check-availability` | Now-streaming diff (secret-protected) |

Interactive docs are available at `/docs` when the backend is running.

---

## Attribution & license

- This product uses the **TMDB API** but is not endorsed or certified by TMDB. Movie, person, and image data © [The Movie Database](https://www.themoviedb.org/).
- Streaming availability data is provided by **[JustWatch](https://www.justwatch.com/)** (via TMDB).
- Plot summaries are sourced from **Wikipedia**.

Released under the [MIT License](LICENSE).
