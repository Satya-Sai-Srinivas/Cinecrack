const API_BASE_URL = "http://127.0.0.1:8000/api/v1/movies";

let currentRegion = 'US';
let currentLang = 'all';
let currentCity = '';
let detectedRegion = '';
let detectedCity = '';

let currentPage = 1;
let isLoadingMore = false;
let hasMoreData = true;
let currentMode = 'now-playing';
let currentSearchQuery = '';
const NAV_CONTEXT_KEY = 'cinecrack-nav-context';

function setNavContext(context) {
    sessionStorage.setItem(NAV_CONTEXT_KEY, JSON.stringify(context));
}

function getNavContext() {
    try {
        const raw = sessionStorage.getItem(NAV_CONTEXT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

function openMovieFromIndex(movieId) {
    const searchInput = document.getElementById('movie-search-input');
    const sectionTitle = document.querySelector('.section-title');

    setNavContext({
        source: currentMode === 'search' ? 'index-search' : 'index-home',
        searchQuery: currentSearchQuery,
        searchInputValue: searchInput ? searchInput.value : '',
        sectionTitle: sectionTitle ? sectionTitle.textContent : '',
        scrollY: window.scrollY
    });

    fetchAndShowMovie(movieId, { pushHistory: true });
}

function restoreIndexContext(context) {
    if (!context) return;

    if (context.source === 'index-search') {
        const searchInput = document.getElementById('movie-search-input');
        if (searchInput && typeof context.searchInputValue === 'string') {
            searchInput.value = context.searchInputValue;
        }
        if (typeof context.searchQuery === 'string') {
            currentSearchQuery = context.searchQuery;
        }
        if (context.sectionTitle) {
            const sectionTitle = document.querySelector('.section-title');
            if (sectionTitle) sectionTitle.textContent = context.sectionTitle;
        }
    }

    if (typeof context.scrollY === 'number') {
        setTimeout(() => window.scrollTo({ top: context.scrollY, behavior: 'instant' }), 10);
    }
}

async function handlePopState() {
    const urlParams = new URLSearchParams(window.location.search);
    const movieIdFromUrl = urlParams.get('movie_id');
    const historyState = window.history.state || {};
    const context = historyState.context || getNavContext();

    if (movieIdFromUrl) {
        if (historyState.context) {
            setNavContext(historyState.context);
        }
        await fetchAndShowMovie(movieIdFromUrl, { pushHistory: false });
        return;
    }

    showHomeView(false);
    restoreIndexContext(context);
}

async function initLocation() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        if (!response.ok) throw new Error("Location API rate limit");
        const data = await response.json();
        
        if (data.country_code) {
            detectedRegion = data.country_code;
            detectedCity = data.city || '';
            addLocalMarketButton(detectedRegion, detectedCity);
            currentRegion = detectedRegion;
            currentCity = detectedCity;
        }
    } catch (error) {
        console.warn("Could not detect location. Falling back to US.", error);
    }
}

function addLocalMarketButton(regionCode, city) {
    const toggleContainer = document.querySelector('.market-toggle');
    const localBtn = document.createElement('button');
    localBtn.className = 'market-btn';
    localBtn.id = `btn-LOCAL`;
    localBtn.textContent = city ? `📍 ${city}` : `📍 Local (${regionCode})`;
    localBtn.onclick = () => switchMarket('LOCAL');
    toggleContainer.prepend(localBtn);
}

function switchMarket(target) {
    if (target === 'LOCAL') {
        currentRegion = detectedRegion;
        currentCity = detectedCity;
    } else {
        currentRegion = target;
        currentCity = ''; 
    }
    
    document.querySelectorAll('.market-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-${target}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    const langFilters = document.getElementById('regional-filters');
    if (currentRegion === 'IN') {
        langFilters.style.display = 'flex';
    } else {
        langFilters.style.display = 'none';
        currentLang = 'all'; 
        updateLangButtons();
    }
    
    updateSectionTitle();
    loadNowPlaying();
}

function showHomeView(resetScroll = true) {
    document.getElementById('home-view').classList.remove('hidden');
    document.getElementById('detail-view').classList.add('hidden');
    if (resetScroll) {
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 10);
    }
}

function showDetailView() {
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 10);
}

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

window.addEventListener('scroll', () => {
    if (isLoadingMore || !hasMoreData || document.getElementById('home-view').classList.contains('hidden')) return;
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 200) {
        fetchNextBatch();
    }
});

async function fetchNextBatch() {
    isLoadingMore = true;
    currentPage++;
    
    const bottomLoading = document.getElementById('bottom-loading');
    if (bottomLoading) bottomLoading.classList.remove('hidden');

    try {
        let url = currentMode === 'now-playing' 
            ? `${API_BASE_URL}/now-playing?region=${currentRegion}&lang=${currentLang}&page=${currentPage}`
            : `${API_BASE_URL}/search?query=${encodeURIComponent(currentSearchQuery)}&page=${currentPage}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to load more data");
        
        const movies = await response.json();
        if (movies.length < 20) hasMoreData = false;

        document.getElementById('now-playing-grid').insertAdjacentHTML('beforeend', movies.map(buildMovieCardHTML).join(''));
    } catch (error) {
        console.error("Pagination error:", error);
        currentPage--; 
    } finally {
        isLoadingMore = false;
        if (bottomLoading) bottomLoading.classList.add('hidden');
    }
}

function buildMovieCardHTML(movie) {
    return `
        <div class="movie-card" onclick="openMovieFromIndex(${movie.id})">
            <img src="${movie.poster_url || 'https://via.placeholder.com/500x750?text=No+Poster'}" alt="${movie.title}">
            <div class="movie-card-info">
                <h3>${movie.title}</h3>
                <p>${movie.release_date ? movie.release_date.substring(0,4) : 'N/A'}</p>
            </div>
        </div>
    `;
}

async function loadNowPlaying() {
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
        grid.innerHTML = movies.map(buildMovieCardHTML).join('');
    } catch (error) {
        console.error("Error loading now playing:", error);
        document.getElementById('now-playing-grid').innerHTML = '<p style="color: var(--text-muted); padding: 20px;">Failed to load movies. Is the backend running?</p>';
    } finally {
        hideLoading(); 
    }
}

function resetToHome() {
    const searchInput = document.getElementById('movie-search-input');
    if (searchInput) searchInput.value = '';
    switchMarket(detectedRegion ? 'LOCAL' : 'US');
    showHomeView();
}

async function loadHistory() {
    try {
        const response = await fetch(`http://127.0.0.1:8000/api/v1/history`);
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
                <span class="history-tag" onclick="openMovieFromIndex(${h.movie_id})">
                    ${h.movie_title}
                </span>
            `).join('');
        }
    } catch (error) {
        console.warn("History Error:", error);
    }
}

async function executeSearch() {
    const queryInput = document.getElementById('movie-search-input');
    const query = queryInput.value.trim();
    if (!query) return;

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
            grid.innerHTML = `<p style="color: var(--text-muted); padding: 20px;">No movies found for "${query}".</p>`;
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
    if (e.key === 'Enter') executeSearch();
});

async function fetchAndShowMovie(movieId = null, options = {}) {
    if (!movieId) return;
    const { pushHistory = false } = options;

    if (pushHistory) {
        const context = getNavContext();
        const nextUrl = `${window.location.pathname}?movie_id=${movieId}`;
        window.history.pushState({ view: 'detail', movieId, context }, '', nextUrl);
    }

    showLoading(); 
    try {
        const response = await fetch(`${API_BASE_URL}/${movieId}`);
        if (!response.ok) throw new Error("Movie not found");
        
        const movie = await response.json();
        renderMovieDetails(movie);
        showDetailView();
        loadHistory(); 
    } catch (error) {
        console.error("Error:", error);
        alert("Failed to fetch movie details.");
    } finally {
        hideLoading(); 
    }
}

function renderMovieDetails(movie) {
    document.getElementById('movie-title').textContent = movie.title;
    document.getElementById('movie-storyline').textContent = movie.storyline || "No storyline available.";
    document.getElementById('movie-poster').src = movie.poster_url || 'https://via.placeholder.com/500x750?text=No+Poster';
    
    document.getElementById('movie-genres').innerHTML = movie.genres.map(g => `<span>${g}</span>`).join('');
    document.getElementById('theatre-date').textContent = movie.release_details.theatrical_release_date || "Unknown";
    
    const ottContainer = document.getElementById('ott-platforms');
    if (movie.release_details.available_on.length > 0) {
        ottContainer.innerHTML = movie.release_details.available_on.map(p => 
            `<a href="${p.link}" target="_blank" style="color: var(--accent); text-decoration: none; margin-right: 15px; font-weight: 600;">${p.name}</a>`
        ).join('');
    } else {
        ottContainer.textContent = "Not currently available to stream.";
    }

    const actionContainer = document.getElementById('movie-action-links');
    if (actionContainer) {
        const links = [];
        if (movie.trailer_url) {
            links.push(
                `<a class="movie-action-link trailer" href="${movie.trailer_url}" target="_blank" rel="noopener noreferrer"><i class="fas fa-play"></i><span>Watch Trailer</span></a>`
            );
        }
        if (movie.wikipedia_url) {
            links.push(
                `<a class="movie-action-link wiki" href="${movie.wikipedia_url}" target="_blank" rel="noopener noreferrer"><i class="fas fa-book-open"></i><span>Read on Wikipedia</span></a>`
            );
        }
        actionContainer.innerHTML = links.join('');
    }

    const mapPersonCard = person => `
        <div class="person-card" style="cursor: pointer;" onclick="window.location.href='person.html?id=${person.id}'">
            <img src="${person.image_url || 'https://via.placeholder.com/150x225?text=No+Image'}" alt="${person.name}">
            <h3 style="margin-bottom: 2px;">${person.name}</h3>
            <span class="role">${person.character_name || person.job}</span>
            <div class="known-for">
                <strong>Known For:</strong><br>
                ${person.well_known_for && person.well_known_for.length > 0 ? person.well_known_for.map(w => `${w.title} (${w.release_year || 'N/A'})`).join(', ') : 'N/A'}
            </div>
        </div>
    `;

    document.getElementById('cast-grid').innerHTML = movie.lead_cast.map(mapPersonCard).join('');
    document.getElementById('technician-grid').innerHTML = movie.technicians.map(mapPersonCard).join('');
}

window.onload = async () => {
    showLoading();
    await initLocation();
    
    if (detectedRegion) {
        const localBtn = document.getElementById('btn-LOCAL');
        if(localBtn) localBtn.classList.add('active');
    } else {
        const usBtn = document.getElementById('btn-US');
        if(usBtn) usBtn.classList.add('active');
    }
    
    updateSectionTitle();
    await loadNowPlaying();
    await loadHistory();

    const urlParams = new URLSearchParams(window.location.search);
    const movieIdFromUrl = urlParams.get('movie_id');
    const refFromUrl = urlParams.get('ref');
    const returnTo = urlParams.get('return_to');

    if (movieIdFromUrl) {
        if (refFromUrl === 'regional') {
            setNavContext({ source: 'regional', returnUrl: 'regional.html' });
        } else if (refFromUrl === 'discover') {
            setNavContext({ source: 'discover', returnUrl: 'discover.html' });
        } else if (refFromUrl === 'ai-guru') {
            setNavContext({ source: 'ai-guru', returnUrl: 'index.html' });
        } else if (refFromUrl === 'chatbot') {
            setNavContext({
                source: 'chatbot',
                returnUrl: returnTo ? decodeURIComponent(returnTo) : 'index.html'
            });
        } else if (refFromUrl === 'person') {
            setNavContext({
                source: 'person',
                returnUrl: returnTo ? decodeURIComponent(returnTo) : 'person.html'
            });
        }

        await fetchAndShowMovie(movieIdFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        const baseState = window.history.state || {};
        window.history.replaceState(
            { ...baseState, view: 'home', context: getNavContext() },
            document.title,
            window.location.pathname
        );
    }

    window.addEventListener('popstate', handlePopState);
    hideLoading();
};