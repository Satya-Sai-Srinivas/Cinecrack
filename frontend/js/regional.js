// FIXED: Now specifically targets your Python backend on port 8000
const API_BASE_URL = "http://127.0.0.1:8000/api/v1/movies/regional-hub";

async function loadHubData() {
    try {
        const response = await fetch(API_BASE_URL);
        if (!response.ok) throw new Error("Failed to load hub data");
        
        const data = await response.json();
        
        populateRow('row-tollywood', data.tollywood);
        populateRow('row-bollywood', data.bollywood);
        populateRow('row-kollywood', data.kollywood);
        populateRow('row-mollywood', data.mollywood);
        populateRow('row-international', data.international);

    } catch (error) {
        console.error(error);
        alert("Error loading the Cinema Hub.");
    } finally {
        document.getElementById('loading-overlay').classList.add('hidden');
    }
}

function populateRow(containerId, movies) {
    const container = document.getElementById(containerId);
    
    if (!movies || movies.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); padding-left: 10px;">No movies available right now.</p>';
        return;
    }

    container.innerHTML = movies.map(movie => `
        <div class="movie-card" onclick="window.location.href='index.html?movie_id=${movie.id}&ref=regional'">
            <img src="${movie.poster_url || 'https://via.placeholder.com/500x750?text=No+Poster'}" alt="${movie.title}">
            <div class="movie-card-info" style="padding: 10px 0;">
                <h3 style="margin: 0 0 5px 0; font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-main);">${movie.title}</h3>
                <p style="margin: 0; color: var(--text-muted); font-size: 13px;">${movie.release_date ? movie.release_date.substring(0,4) : 'N/A'}</p>
            </div>
        </div>
    `).join('');
}

window.onload = loadHubData;