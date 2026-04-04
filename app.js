const API_BASE_URL = "http://127.0.0.1:8000/api/v1/movies";

// --- Navigation Logic ---
function showHomeView() {
    document.getElementById('detail-view').classList.add('hidden');
    document.getElementById('home-view').classList.remove('hidden');
}

function showDetailView() {
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
}

// --- Fetch & Render Homepage ---
async function loadNowPlaying() {
    showHomeView();
    const grid = document.getElementById('now-playing-grid');
    grid.innerHTML = '<p style="padding: 20px;">Loading latest releases...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/now-playing`);
        if (!response.ok) throw new Error("Failed to load now playing movies");
        
        const movies = await response.json();
        
        grid.innerHTML = movies.map(movie => `
            <div class="movie-card" onclick="fetchAndShowMovie(${movie.id})">
                <img src="${movie.poster_url || 'https://via.placeholder.com/300x450?text=No+Poster'}" alt="${movie.title}">
                <div class="movie-card-info">
                    <h3>${movie.title}</h3>
                    <p>${movie.release_date || 'TBA'}</p>
                </div>
            </div>
        `).join('');
    } catch (error) {
        grid.innerHTML = `<p style="color: red; padding: 20px;">${error.message}</p>`;
    }
}

// --- Fetch & Render Single Movie ---
async function fetchAndShowMovie(movieId) {
    if (!movieId) {
        movieId = document.getElementById('movie-id-input').value;
    }
    if (!movieId) return alert("Please enter a Movie ID");

    try {
        const response = await fetch(`${API_BASE_URL}/${movieId}`);
        if (!response.ok) throw new Error("Movie not found");
        
        const movie = await response.json();
        renderMovieDetails(movie);
        showDetailView();
    } catch (error) {
        alert(error.message);
    }
}

function renderMovieDetails(movie) {
    document.getElementById('movie-poster').src = movie.poster_url || 'https://via.placeholder.com/300x450?text=No+Poster';
    document.getElementById('movie-title').textContent = movie.title;
    document.getElementById('movie-storyline').textContent = movie.storyline;
    
    const genresContainer = document.getElementById('movie-genres');
    genresContainer.innerHTML = movie.genres.map(g => `<span>${g}</span>`).join('');

    const release = movie.release_details;
    document.getElementById('theatre-date').textContent = release.theatrical_release_date || "TBA";
    
    const ottList = release.available_on.map(platform => platform.name).join(', ');
    document.getElementById('ott-platforms').textContent = ottList || "Not streaming yet";

    const castGrid = document.getElementById('cast-grid');
    castGrid.innerHTML = movie.lead_cast.map(actor => generatePersonCard(actor, actor.character_name)).join('');

    const techGrid = document.getElementById('technician-grid');
    techGrid.innerHTML = movie.technicians.map(tech => generatePersonCard(tech, tech.job)).join('');
}

function generatePersonCard(person, roleLabel) {
    const imgUrl = person.image_url || 'https://via.placeholder.com/100?text=No+Image';
    let socialsHtml = '';
    const socials = person.social_handles;
    if (socials.instagram) socialsHtml += `<a href="${socials.instagram}" target="_blank"><i class="fab fa-instagram"></i></a>`;
    if (socials.twitter) socialsHtml += `<a href="${socials.twitter}" target="_blank"><i class="fab fa-twitter"></i></a>`;
    if (socials.facebook) socialsHtml += `<a href="${socials.facebook}" target="_blank"><i class="fab fa-facebook"></i></a>`;
    if (socials.imdb) socialsHtml += `<a href="${socials.imdb}" target="_blank"><i class="fab fa-imdb"></i></a>`;

    const knownForText = person.well_known_for.map(work => work.title).join(', ');

    return `
        <div class="person-card">
            <img src="${imgUrl}" alt="${person.name}">
            <h3>${person.name}</h3>
            <span class="role">${roleLabel}</span>
            <div class="social-links">${socialsHtml}</div>
            <div class="known-for">
                <strong>Known For:</strong><br>
                ${knownForText || "N/A"}
            </div>
        </div>
    `;
}

// Load the homepage grid on startup
window.onload = loadNowPlaying;