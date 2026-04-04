// Connects to your local FastAPI server
const API_BASE_URL = "http://127.0.0.1:8000/api/v1/movies";

async function loadMovie() {
    const movieId = document.getElementById('movie-id-input').value;
    if (!movieId) return alert("Please enter a Movie ID");

    try {
        const response = await fetch(`${API_BASE_URL}/${movieId}`);
        if (!response.ok) throw new Error("Movie not found");
        
        const movie = await response.json();
        renderMovie(movie);
    } catch (error) {
        alert(error.message);
    }
}

function renderMovie(movie) {
    document.getElementById('movie-container').classList.remove('hidden');

    // 1. Render Hero Section
    document.getElementById('movie-poster').src = movie.poster_url || 'https://via.placeholder.com/300x450?text=No+Poster';
    document.getElementById('movie-title').textContent = movie.title;
    document.getElementById('movie-storyline').textContent = movie.storyline;
    
    // Genres
    const genresContainer = document.getElementById('movie-genres');
    genresContainer.innerHTML = movie.genres.map(g => `<span>${g}</span>`).join('');

    // Release Info
    const release = movie.release_details;
    document.getElementById('theatre-date').textContent = release.theatrical_release_date || "TBA";
    
    const ottList = release.available_on.map(platform => platform.name).join(', ');
    document.getElementById('ott-platforms').textContent = ottList || "Not streaming yet";

    // 2. Render Cast
    const castGrid = document.getElementById('cast-grid');
    castGrid.innerHTML = movie.lead_cast.map(actor => generatePersonCard(actor, actor.character_name)).join('');

    // 3. Render Technicians
    const techGrid = document.getElementById('technician-grid');
    techGrid.innerHTML = movie.technicians.map(tech => generatePersonCard(tech, tech.job)).join('');
}

function generatePersonCard(person, roleLabel) {
    const imgUrl = person.image_url || 'https://via.placeholder.com/100?text=No+Image';
    
    // Build Social Links
    let socialsHtml = '';
    const socials = person.social_handles;
    if (socials.instagram) socialsHtml += `<a href="${socials.instagram}" target="_blank"><i class="fab fa-instagram"></i></a>`;
    if (socials.twitter) socialsHtml += `<a href="${socials.twitter}" target="_blank"><i class="fab fa-twitter"></i></a>`;
    if (socials.facebook) socialsHtml += `<a href="${socials.facebook}" target="_blank"><i class="fab fa-facebook"></i></a>`;
    if (socials.imdb) socialsHtml += `<a href="${socials.imdb}" target="_blank"><i class="fab fa-imdb"></i></a>`;

    // Build "Known For" text
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

// Load default movie on startup
window.onload = loadMovie;