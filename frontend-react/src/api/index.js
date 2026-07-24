const API_DOMAIN = import.meta.env.VITE_API_BASE_URL || window.location.origin;
const BASE = '/api/v1';

async function get(path, params = {}) {
  // FIX: Removed the extra ${BASE} here because your functions below already include it!
  const url = new URL(path, API_DOMAIN);

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json();
}

// Authenticated request that reuses the same API_DOMAIN + fallback as get().
async function authFetch(path, { token, method = 'GET', body } = {}) {
  const url = new URL(path, API_DOMAIN);
  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.status === 204 ? null : res.json();
}

// ---------- Movies ----------

export const fetchNowPlaying = ({ region, lang, page = 1 }) =>
  get(`${BASE}/movies/now-playing`, { region, lang, page })

export const fetchSearchMovies = ({ query, page = 1 }) =>
  get(`${BASE}/movies/search`, { query, page })

export const fetchMovieDetail = (movieId, region, token) => {
  const qs = region ? `?region=${encodeURIComponent(region)}` : ''
  return authFetch(`${BASE}/movies/${movieId}${qs}`, { token })
}

export const fetchDiscover = (filters) =>
  get(`${BASE}/movies/discover`, filters)

export const fetchRegionalHub = () =>
  get(`${BASE}/movies/regional-hub`)

// ---------- Person ----------

export const fetchPerson = (personId) =>
  get(`${BASE}/person/${personId}`)

// ---------- History ----------

export const fetchHistory = (token) =>
  authFetch(`${BASE}/history`, { token })

// ---------- Watchlist ----------

export const fetchWatchlist = (token) =>
  authFetch(`${BASE}/user/watchlist`, { token })

export const addToWatchlist = (token, movieId, status = 'WATCHLIST') =>
  authFetch(`${BASE}/user/watchlist`, {
    token,
    method: 'POST',
    body: { movie_id: movieId, status },
  })

export const removeFromWatchlist = (token, movieId) =>
  authFetch(`${BASE}/user/watchlist/${movieId}`, { token, method: 'DELETE' })

export const fetchWatchlistMovies = (token) =>
  authFetch(`${BASE}/user/watchlist/movies`, { token })

// ---------- Location ----------

export async function fetchLocation() {
  try {
    // Swapped from ipapi.co to ipwho.is for better free-tier rate limits
    const response = await fetch('https://ipwho.is/');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // ipwho.is returns success: true on valid requests
    if (data.success) {
      return {
        countryCode: data.country_code,
        city: data.city
      };
    }
    return null;
  } catch (error) {
    console.error("Location detection failed:", error);
    return null;
  }
}

// ---------- AI Chat (SSE) ----------
export async function streamChat(query, conversationHistory, token) {
  const res = await fetch(`${API_DOMAIN}${BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      query,
      conversation_history: conversationHistory,
    }),
  });
  if (!res.ok) throw new Error(`Chat API error ${res.status}`);
  return res.body;
}