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

// ---------- Movies ----------

export const fetchNowPlaying = ({ region, lang, page = 1 }) =>
  get(`${BASE}/movies/now-playing`, { region, lang, page })

export const fetchSearchMovies = ({ query, page = 1 }) =>
  get(`${BASE}/movies/search`, { query, page })

export const fetchMovieDetail = (movieId, region) =>
  get(`${BASE}/movies/${movieId}`, { region })

export const fetchDiscover = (filters) =>
  get(`${BASE}/movies/discover`, filters)

export const fetchRegionalHub = () =>
  get(`${BASE}/movies/regional-hub`)

// ---------- Person ----------

export const fetchPerson = (personId) =>
  get(`${BASE}/person/${personId}`)

// ---------- History ----------

export const fetchHistory = () =>
  get(`${BASE}/history`)

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
export async function streamChat(query, conversationHistory) {
  const res = await fetch(`${API_DOMAIN}${BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      conversation_history: conversationHistory,
    }),
  });
  if (!res.ok) throw new Error(`Chat API error ${res.status}`);
  return res.body; 
}