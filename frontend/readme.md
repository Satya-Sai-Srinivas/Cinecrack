# 🎬 CineCrack 

![Python Version](https://img.shields.io/badge/Python-3.9+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.133.1-009688.svg?logo=fastapi)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-336791.svg?logo=postgresql)
![OpenAI](https://img.shields.io/badge/OpenAI-LangChain-412991.svg?logo=openai)

CineCrack is an intelligent, full-stack cinematic discovery platform. It goes beyond simple movie search by integrating an emotionally intelligent AI chatbot ("AI Cinema Guru") that provides personalized recommendations based on mood, tone, and visual atmosphere. 

Built with a high-performance FastAPI backend and a responsive vanilla HTML/JS/CSS frontend, the application leverages TMDB and Wikipedia for rich movie data, and PostgreSQL with `pgvector` for semantic similarity search.

## ✨ Key Features

* **🧠 AI Cinema Guru (Chatbot):** An interactive assistant powered by OpenAI and LangChain that understands natural language queries and filters movies by emotional tone, character arcs, or specific constraints (genre, year, rating).
* **🔍 Semantic Search & Vector Embeddings:** Uses `text-embedding-3-small` and `pgvector` to find movies based on storyline and plot similarities, beyond just keyword matching.
* **🌍 Regional Cinema Hub:** Dedicated hubs for trending international and regional cinema (Tollywood, Bollywood, Kollywood, Mollywood, etc.).
* **🎛️ Advanced Discovery Filters:** Filter the database dynamically by genre, original language, release year ranges, and minimum user ratings.
* **🎭 Cast & Crew Profiles:** Deep-dive into actor and technician filmographies, biographies, and social media links.
* **🌓 Responsive UI with Dark Mode:** A sleek, mobile-friendly interface with automatic or manual Light/Dark theme toggling.

## 🛠️ Tech Stack

**Frontend:**
* HTML5, CSS3 (Custom variables, responsive grid/flexbox)
* Vanilla JavaScript (ES6+)

**Backend:**
* Python 3.9+
* [FastAPI](https://fastapi.tiangolo.com/) (Async API framework)
* [SQLAlchemy](https://www.sqlalchemy.org/) (Async ORM)
* [LangChain](https://www.langchain.com/) & OpenAI (LLM orchestration and embeddings)
* [HTTPX](https://www.python-httpx.org/) (Async HTTP client for external APIs)

**Database:**
* PostgreSQL
* `asyncpg` driver
* `pgvector` extension (for L2 distance vector similarity)

## 🚀 Getting Started

### Prerequisites
1. **Python 3.9+** installed on your system.
2. **PostgreSQL** database installed and running, with the `pgvector` extension supported/installed.
3. API Keys:
   * **TMDB API Key** (Get one from [The Movie Database](https://developer.themoviedb.org/docs))
   * **OpenAI API Key** (For embeddings and chatbot)

### 1. Clone the Repository
```bash
git clone [https://github.com/yourusername/cinecrack.git](https://github.com/yourusername/cinecrack.git)
cd cinecrack
````

### 2\. Create and Activate a Virtual Environment

```bash
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
```

### 3\. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4\. Configure Environment Variables

Create a `.env` file in the root directory and add the following variables:

```env
# Database Configuration (Must use asyncpg driver)
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/cinecrack_db

# External APIs
TMDB_API_KEY=your_tmdb_v3_or_v4_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Optional: AI Model Configuration
OPENAI_CHAT_MODEL=gpt-4o-mini
EMBEDDING_SEED_PAGES=5
```

### 5\. Seed the Database with Embeddings

Before using the AI features, you need to populate your vector database with movie embeddings. The seeder script fetches popular movies from TMDB, grabs detailed plot summaries from Wikipedia, generates vector embeddings via OpenAI, and stores them in PostgreSQL.

```bash
python seed_embeddings.py
```

*(Note: Ensure your database user has privileges to run `CREATE EXTENSION IF NOT EXISTS vector;` which is executed automatically on startup).*

### 6\. Run the Application

Start the FastAPI server using Uvicorn:

```bash
uvicorn main:app --reload
```

The application will be accessible at:

  * **Frontend UI:** `http://localhost:8000/`
  * **API Documentation (Swagger):** `http://localhost:8000/docs`

## 📂 Project Structure

```text
cinecrack/
├── frontend/                 # Vanilla HTML/CSS/JS Frontend
│   ├── css/
│   │   └── styles.css        # Global styles and themes
│   ├── js/
│   │   ├── app.js            # Main home/search logic
│   │   ├── chatbot.js        # AI Cinema Guru logic & SSE handling
│   │   ├── discover.js       # Advanced filtering logic
│   │   ├── person.js         # Actor/Crew profile logic
│   │   ├── regional.js       # Cinema Hub logic
│   │   └── theme.js          # Dark/Light mode management
│   ├── index.html            # Home & Search view
│   ├── discover.html         # Discovery/Filter view
│   ├── person.html           # People profile view
│   └── regional.html         # Regional Cinema Hub
├── main.py                   # FastAPI application & API endpoints
├── database.py               # SQLAlchemy async engine & pgvector models
├── models.py                 # Pydantic schema definitions
├── ai_services.py            # LangChain/OpenAI chatbot & vector search logic
├── seed_embeddings.py        # Data pipeline for fetching/embedding TMDB+Wiki data
├── requirements.txt          # Python dependencies
└── .gitignore                # Git ignore rules
```

## 🤝 Contributing

Contributions, issues, and feature requests are welcome\!

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📝 License

This project is open-source and available under the [MIT License](https://www.google.com/search?q=LICENSE).

## 👨‍💻 Author

**Satya Sai Srinivas Yendru**

  * Connect on [LinkedIn](https://www.linkedin.com/in/satya-sai-srinivas-yendru/)
  * Graduate Student, Northeastern University

-----

*If you enjoy using CineCrack, please consider starring the repository\! ⭐*

```
```