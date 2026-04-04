// Ensure this matches your FastAPI server port
const API_BASE_URL = "http://127.0.0.1:8000/api/v1/movies";

// --- Global State ---
let currentRegion = 'US';
let currentLang = 'all';
let currentCity = '';
let detectedRegion = '';
let detectedCity = '';

// Pagination State
let currentPage = 1;
let isLoadingMore = false;
let hasMoreData = true;
let currentMode = 'now-playing'; // 'now-playing' or 'search'
let currentSearchQuery = '';

// --- Location Detection Logic ---
async function initLocation() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        
        if (data.country_code) {
            detectedRegion = data.country_code;
            detectedCity = data.city || '';
            
            // Add the dynamic Local button
            addLocalMarketButton(detectedRegion, detectedCity);
            
            // Default to local region immediately
            currentRegion = detectedRegion;
            currentCity = detectedCity;
        }
    } catch (error) {
        console.error("Could not detect location. Falling back to US.", error);
    }
}

function addLocalMarketButton(regionCode, city) {
    const toggleContainer = document.querySelector('.market-toggle');
    
    const localBtn = document.createElement('button');
    localBtn.className = 'market-btn';
    localBtn.id = `btn-LOCAL`;
    localBtn.textContent = city ? `📍 ${city}` : `📍 Local (${regionCode})`;
    localBtn.onclick = () => switchMarket('LOCAL');
    
    // Insert it at the beginning
    toggleContainer.prepend(localBtn);
}

// --- Switch Market Logic ---
function switchMarket(target) {
    // Determine underlying region and city based on selection
    if (target === 'LOCAL') {
        currentRegion = detectedRegion;
        currentCity = detectedCity;
    } else {
        currentRegion = target;
        currentCity = ''; // Clear city when manually picking US/IN
    }
    
    // Toggle main buttons classes
    document.querySelectorAll('.market-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-${target}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    // Show/Hide Indian Language Filters
    const langFilters = document.getElementById('regional-filters');
    if (currentRegion === 'IN') {
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
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 10);
}

function showDetailView() {
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
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

// --- Dynamic Section Title ---
function updateSectionTitle() {
    const sectionTitle = document.querySelector('.section-title');
    if (!sectionTitle) return;
    
    if (currentCity) {
        sectionTitle.textContent = `Now Playing in ${currentCity} Theaters`;
    } else if (currentRegion === 'US') {
        sectionTitle.textContent = 'Now Playing in US Theaters';
    } else if (currentRegion === 'IN') {
        const langNames = { 'all': 'Indian', 'te': 'Telugu', 'hi': 'Hindi', 'ta': 'Tamil', 'ml': 'Malayalam' };
        sectionTitle.textContent = `Now Playing in Theaters (${langNames[currentLang]})`;
    } else {
        sectionTitle.textContent = `Now Playing in Theaters (${currentRegion})`;
    }
}

// --- Infinite Scroll Logic ---
window.addEventListener('scroll', () => {
    // Prevent fetching if already loading, no more data, or not on the home screen
    if (isLoadingMore || !hasMoreData || document.getElementById('home-view').classList.contains('hidden')) return;

    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    
    // Trigger when user is within 200px of the bottom
    if (scrollTop + clientHeight >= scrollHeight - 200) {
        fetchNextBatch();
    }
});

async function fetchNextBatch() {
    isLoadingMore = true;
    currentPage++;
    
    // Show bottom spinner
    const bottomLoading = document.getElementById('bottom-loading');
    if (bottomLoading) bottomLoading.classList.remove('hidden');

    try {
        let url = '';
        if (currentMode === 'now-playing') {
            url = `${API_BASE_URL}/now-playing?region=${currentRegion}&lang=${currentLang}&page=${currentPage}`;
        } else {
            url = `${API_BASE_URL}/search?query=${encodeURIComponent(currentSearchQuery)}&page=${currentPage}`;
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to load more data");
        
        const movies = await response.json();
        
        // If API returns fewer than 20 items, we've reached the end
        if (movies.length < 20) {
            hasMoreData = false;
        }

        appendMoviesToGrid(movies);

    } catch (error) {
        console.error("Pagination error:", error);
        currentPage--; // Revert page count so user can try again
    } finally {
        isLoadingMore = false;
        if (bottomLoading) bottomLoading.classList.add('hidden');
    }
}

function buildMovieCardHTML(movie) {
    return `
        <div class="movie-card" onclick="fetchAndShowMovie(${movie.id})">
            <img src="${movie.poster_url || 'https://via.placeholder.com/500x750?text=No+Poster'}" alt="${movie.title}">
            <div class="movie-card-title">${movie.title} <br> <span style="font-size: 0.8em; color: #ccc;">(${movie.release_date ? movie.release_date.substring(0,4) : 'N/A'})</span></div>
        </div>
    `;
}

function appendMoviesToGrid(movies) {
    const grid = document.getElementById('now-playing-grid');
    grid.insertAdjacentHTML('beforeend', movies.map(buildMovieCardHTML).join(''));
}

// --- Fetch & Render Now Playing ---
async function loadNowPlaying() {
    // Reset State
    currentMode = 'now-playing';
    currentPage = 1;
    hasMoreData = true;

    showLoading(); 
    try {
        const response = await fetch(`${API_BASE_URL}/now-playing?region=${currentRegion}&lang=${currentLang}&page=${currentPage}`);
        if (!response.ok) throw new Error("Failed to load now playing");
        
        const movies = await response.json();
        const grid = document.getElementById('now-playing-grid');
        
        if (movies.length < 20) hasMoreData = false;
        
        // Use innerHTML for the first load to clear any old content
        grid.innerHTML = movies.map(buildMovieCardHTML).join('');
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

    // If local was detected, reset to local, otherwise US
    switchMarket(detectedRegion ? 'LOCAL' : 'US');
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

    // Reset State
    currentMode = 'search';
    currentSearchQuery = query;
    currentPage = 1;
    hasMoreData = true;

    showLoading();
    try {
        const response = await fetch(`${API_BASE_URL}/search?query=${encodeURIComponent(query)}&page=${currentPage}`);
        if (!response.ok) throw new Error("Search failed");
        
        const movies = await response.json();
        const grid = document.getElementById('now-playing-grid');
        
        document.querySelector('.section-title').textContent = `Search Results for "${query}"`;
        
        if (movies.length < 20) hasMoreData = false;

        if (movies.length === 0) {
            grid.innerHTML = `<p style="color: white; padding: 20px;">No movies found for "${query}".</p>`;
        } else {
            grid.innerHTML = movies.map(buildMovieCardHTML).join('');
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

    document.getElementById('cast-grid').innerHTML = movie.lead_cast.map(person => {
        const knownForText = person.well_known_for && person.well_known_for.length > 0 
            ? person.well_known_for.map(work => `${work.title} (${work.release_year || 'N/A'})`).join(', ')
            : 'N/A';

        // NEW: Added style="cursor:pointer;" and onclick routing to the new page
        return `
        <div class="person-card" style="cursor: pointer;" onclick="window.location.href='person.html?id=${person.id}'">
            <img src="${person.image_url || 'https://via.placeholder.com/150x225?text=No+Image'}" alt="${person.name}">
            <div class="person-info">
                <h4>${person.name}</h4>
                <p style="margin-bottom: 5px;"><strong>Role:</strong> ${person.character_name}</p>
                <p style="font-size: 0.8em; color: #a0a0a0; line-height: 1.4;"><strong>Known For:</strong><br>${knownForText}</p>
            </div>
        </div>
        `;
    }).join('');

    document.getElementById('technician-grid').innerHTML = movie.technicians.map(person => {
        const knownForText = person.well_known_for && person.well_known_for.length > 0 
            ? person.well_known_for.map(work => `${work.title} (${work.release_year || 'N/A'})`).join(', ')
            : 'N/A';

        // NEW: Added style="cursor:pointer;" and onclick routing to the new page
        return `
        <div class="person-card" style="cursor: pointer;" onclick="window.location.href='person.html?id=${person.id}'">
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

// --- App Initialization (Updated) ---
// --- App Initialization (Updated for Auto-Routing) ---
window.onload = async () => {
    showLoading();
    
    // Detects user location and sets up local variables
    await initLocation();
    
    // Set the proper active button state initially
    if (detectedRegion) {
        const localBtn = document.getElementById('btn-LOCAL');
        if(localBtn) localBtn.classList.add('active');
    } else {
        const usBtn = document.getElementById('btn-US');
        if(usBtn) usBtn.classList.add('active');
    }
    
    updateSectionTitle();
    
    // Load the background grid and history so it's ready if they click "Back"
    await loadNowPlaying();
    await loadHistory();

    // --- NEW: Check if we arrived from a person's profile ---
    const urlParams = new URLSearchParams(window.location.search);
    const movieIdFromUrl = urlParams.get('movie_id');

    if (movieIdFromUrl) {
        // Automatically fetch and display the movie details
        await fetchAndShowMovie(movieIdFromUrl);
        
        // Clean up the URL so refreshing the page doesn't keep opening this movie
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    hideLoading();
};