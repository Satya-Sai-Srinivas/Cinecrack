// Ensure this matches your FastAPI server port
const API_BASE_URL = "http://127.0.0.1:8000/api/v1/movies";

// Global State
let currentRegion = 'US';
let currentLang = 'all';

// --- Switch Market Logic ---
function switchMarket(region) {
    if (currentRegion === region) return;
    currentRegion = region;
    
    // Toggle main buttons
    document.getElementById('btn-US').classList.toggle('active', region === 'US');
    document.getElementById('btn-IN').classList.toggle('active', region === 'IN');
    
    // Show/Hide Indian Language Filters
    const langFilters = document.getElementById('regional-filters');
    if (region === 'IN') {
        langFilters.style.display = 'flex';
    } else {
        langFilters.style.display = 'none';
        currentLang = 'all'; // Always reset language when switching away from India
        updateLangButtons();
    }
    
    updateSectionTitle();
    loadNowPlaying();
}


// --- View Toggling & Scroll Fix ---
function showHomeView() {
    document.getElementById('home-view').classList.remove('hidden');
    document.getElementById('detail-view').classList.add('hidden');
    // Scroll to top when going back home
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 10);
}

function showDetailView() {
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
    // FIXED: Force the browser to scroll to the top AFTER the DOM paints
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 10);
}

// --- Loading Spinner Controls ---
function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function filterLanguage(lang) {
    if (currentLang === lang) return;
    currentLang = lang;
    updateLangButtons();
    updateSectionTitle();
    loadNowPlaying();
}

function updateLangButtons() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(`'${currentLang}'`)) {
            btn.classList.add('active');
        }
    });
}

function updateSectionTitle() {
    const sectionTitle = document.querySelector('.section-title');
    if (!sectionTitle) return;
    
    if (currentRegion === 'US') {
        sectionTitle.textContent = 'Now Playing in US Theaters';
    } else {
        const langNames = { 'all': 'Indian', 'te': 'Telugu', 'hi': 'Hindi', 'ta': 'Tamil', 'ml': 'Malayalam' };
        sectionTitle.textContent = `Now Playing in Theaters (${langNames[currentLang]})`;
    }
}


// --- Fetch & Render Now Playing (Default Homepage) ---
async function loadNowPlaying() {
    showLoading(); 
    try {
        // FIXED: Passes both region and language to the backend
        const response = await fetch(`${API_BASE_URL}/now-playing?region=${currentRegion}&lang=${currentLang}`);
        if (!response.ok) throw new Error("Failed to load now playing");
        
        const movies = await response.json();
        const grid = document.getElementById('now-playing-grid');
        
        grid.innerHTML = movies.map(movie => `
            <div class="movie-card" onclick="fetchAndShowMovie(${movie.id})">
                <img src="${movie.poster_url || 'https://via.placeholder.com/500x750?text=No+Poster'}" alt="${movie.title}">
                <div class="movie-card-title">${movie.title} <br> <span style="font-size: 0.8em; color: #ccc;">(${movie.release_date ? movie.release_date.substring(0,4) : 'N/A'})</span></div>
            </div>
        `).join('');
    } catch (error) {
        console.error("Error loading now playing:", error);
        document.getElementById('now-playing-grid').innerHTML = '<p style="color: white; padding: 20px;">Failed to load movies. Is the backend running?</p>';
    } finally {
        hideLoading(); 
    }
}

// --- Reset to Default Homepage (Logo Click) ---
function resetToHome() {
    const searchInput = document.getElementById('movie-search-input');
    if (searchInput) searchInput.value = '';

    updateSectionTitle();
    loadNowPlaying();
    showHomeView();
}

// --- Fetch & Render Search History ---
async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE_URL.replace('/movies', '/history')}`);
        if (!response.ok) throw new Error("Failed to load history");
        
        const history = await response.json();
        const historyContainer = document.getElementById('recent-searches-section');
        const tagsContainer = document.getElementById('history-tags');
        
        if (history.length > 0) {
            historyContainer.style.display = 'block'; 
            
            const uniqueHistory = [];
            const seenIds = new Set();
            for (const item of history) {
                if (!seenIds.has(item.movie_id)) {
                    seenIds.add(item.movie_id);
                    uniqueHistory.push(item);
                }
            }

            tagsContainer.innerHTML = uniqueHistory.slice(0, 6).map(h => `
                <span style="cursor: pointer; transition: background 0.3s; padding: 6px 12px; background: rgba(255,255,255,0.1); border-radius: 20px; font-size: 0.9em; color: white;" 
                      onclick="fetchAndShowMovie(${h.movie_id})"
                      onmouseover="this.style.background='#e50914'"
                      onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                    ${h.movie_title}
                </span>
            `).join('');
        }
    } catch (error) {
        console.error("History Error:", error);
    }
}

// --- Execute Search by Name ---
async function executeSearch() {
    const queryInput = document.getElementById('movie-search-input');
    const query = queryInput.value.trim();
    
    if (!query) return;

    showLoading();

    try {
        const response = await fetch(`${API_BASE_URL}/search?query=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error("Search failed");
        
        const movies = await response.json();
        const grid = document.getElementById('now-playing-grid');
        
        document.querySelector('.section-title').textContent = `Search Results for "${query}"`;
        
        if (movies.length === 0) {
            grid.innerHTML = `<p style="color: white; padding: 20px;">No movies found for "${query}".</p>`;
        } else {
            grid.innerHTML = movies.map(movie => `
                <div class="movie-card" onclick="fetchAndShowMovie(${movie.id})">
                    <img src="${movie.poster_url || 'https://via.placeholder.com/500x750?text=No+Poster'}" alt="${movie.title}">
                    <div class="movie-card-title">${movie.title} <br> <span style="font-size: 0.8em; color: #ccc;">(${movie.release_date ? movie.release_date.substring(0,4) : 'N/A'})</span></div>
                </div>
            `).join('');
        }

        showHomeView();

    } catch (error) {
        console.error("Error searching movies:", error);
        alert("Failed to search for movies. Please try again.");
    } finally {
        hideLoading(); 
    }
}

document.getElementById('movie-search-input')?.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        executeSearch();
    }
});

// --- Fetch & Render Movie Details ---
async function fetchAndShowMovie(movieId = null) {
    if (!movieId) return;

    showLoading(); 

    try {
        const response = await fetch(`${API_BASE_URL}/${movieId}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Movie not found");
        }
        
        const movie = await response.json();
        renderMovieDetails(movie);
        showDetailView();
        loadHistory(); 

    } catch (error) {
        console.error("Error:", error);
        alert("Failed to fetch movie details: " + error.message);
    } finally {
        hideLoading(); 
    }
}

// --- Render the DOM for Details ---
function renderMovieDetails(movie) {
    document.getElementById('movie-title').textContent = movie.title;
    document.getElementById('movie-storyline').textContent = movie.storyline || "No storyline available.";
    document.getElementById('movie-poster').src = movie.poster_url || 'https://via.placeholder.com/500x750?text=No+Poster';
    
    document.getElementById('movie-genres').innerHTML = movie.genres.map(g => `<span>${g}</span>`).join('');
    
    document.getElementById('theatre-date').textContent = movie.release_details.theatrical_release_date || "Unknown";
    
    const ottContainer = document.getElementById('ott-platforms');
    if (movie.release_details.available_on.length > 0) {
        ottContainer.innerHTML = movie.release_details.available_on.map(p => 
            `<a href="${p.link}" target="_blank" style="color: var(--accent); text-decoration: none; margin-right: 10px;">${p.name}</a>`
        ).join('');
    } else {
        ottContainer.textContent = "Not currently available to stream.";
    }

    // FIXED: Now properly mapping the 'well_known_for' arrays for Lead Cast
    document.getElementById('cast-grid').innerHTML = movie.lead_cast.map(person => {
        const knownForText = person.well_known_for && person.well_known_for.length > 0 
            ? person.well_known_for.map(work => `${work.title} (${work.release_year || 'N/A'})`).join(', ')
            : 'N/A';

        return `
        <div class="person-card">
            <img src="${person.image_url || 'https://via.placeholder.com/150x225?text=No+Image'}" alt="${person.name}">
            <div class="person-info">
                <h4>${person.name}</h4>
                <p style="margin-bottom: 5px;"><strong>Role:</strong> ${person.character_name}</p>
                <p style="font-size: 0.8em; color: #a0a0a0; line-height: 1.4;"><strong>Known For:</strong><br>${knownForText}</p>
            </div>
        </div>
        `;
    }).join('');

    // FIXED: Now properly mapping the 'well_known_for' arrays for Technicians
    document.getElementById('technician-grid').innerHTML = movie.technicians.map(person => {
        const knownForText = person.well_known_for && person.well_known_for.length > 0 
            ? person.well_known_for.map(work => `${work.title} (${work.release_year || 'N/A'})`).join(', ')
            : 'N/A';

        return `
        <div class="person-card">
            <img src="${person.image_url || 'https://via.placeholder.com/150x225?text=No+Image'}" alt="${person.name}">
            <div class="person-info">
                <h4>${person.name}</h4>
                <p style="margin-bottom: 5px;"><strong>Job:</strong> ${person.job}</p>
                <p style="font-size: 0.8em; color: #a0a0a0; line-height: 1.4;"><strong>Known For:</strong><br>${knownForText}</p>
            </div>
        </div>
        `;
    }).join('');
}

// --- App Initialization ---
window.onload = () => {
    loadNowPlaying();
    loadHistory();
};