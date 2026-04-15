const BASE = '/api/v1'

async function get(path, params = {}) {
  const url = new URL(path, window.location.origin)
  url.pathname = path
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  })
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`)
  return res.json()
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

export const fetchLocation = async () => {
  try {
    const res = await fetch('https://ipapi.co/json/')
    if (!res.ok) return null
    const data = await res.json()
    return { countryCode: data.country_code, city: data.city }
  } catch {
    return null
  }
}

// ---------- AI Chat (SSE) ----------
// Returns a ReadableStream from the fetch — the caller handles parsing.
export async function streamChat(query, conversationHistory) {
  const res = await fetch(`${BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      conversation_history: conversationHistory,
    }),
  })
  if (!res.ok) throw new Error(`Chat API error ${res.status}`)
  return res.body // ReadableStream
}
