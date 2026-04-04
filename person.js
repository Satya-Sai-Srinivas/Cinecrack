const API_BASE_URL = "http://127.0.0.1:8000/api/v1/person";

async function loadPersonProfile() {
    const urlParams = new URLSearchParams(window.location.search);
    const personId = urlParams.get('id');

    if (!personId) {
        alert("No person ID provided.");
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/${personId}`);
        if (!response.ok) throw new Error("Failed to load profile");
        
        const person = await response.json();
        renderProfile(person);
    } catch (error) {
        console.error(error);
        alert("Error loading profile data.");
    } finally {
        document.getElementById('loading-overlay').classList.add('hidden');
    }
}

function renderProfile(person) {
    document.title = `${person.name} - CineCrack`;
    document.getElementById('person-hero').style.display = 'flex';
    
    document.getElementById('person-image').src = person.profile_url || 'https://via.placeholder.com/300x450?text=No+Photo';
    document.getElementById('person-name').textContent = person.name;
    document.getElementById('person-department').innerHTML = `<i class="fas fa-camera"></i> ${person.known_for_department}`;
    
    if (person.birthday) {
        document.getElementById('person-birthday').innerHTML = `<i class="fas fa-birthday-cake"></i> ${person.birthday}`;
    } else {
        document.getElementById('person-birthday').style.display = 'none';
    }

    if (person.place_of_birth) {
        document.getElementById('person-birthplace').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${person.place_of_birth}`;
    } else {
        document.getElementById('person-birthplace').style.display = 'none';
    }

    document.getElementById('person-bio').textContent = person.biography;

    const socialsDiv = document.getElementById('person-socials');
    let socialsHtml = '';
    const s = person.social_handles;
    
    if (s.wikipedia) socialsHtml += `<a href="${s.wikipedia}" target="_blank" title="Wikipedia"><i class="fab fa-wikipedia-w"></i></a>`;
    if (s.instagram) socialsHtml += `<a href="${s.instagram}" target="_blank" title="Instagram"><i class="fab fa-instagram"></i></a>`;
    if (s.twitter) socialsHtml += `<a href="${s.twitter}" target="_blank" title="Twitter/X"><i class="fab fa-twitter"></i></a>`;
    if (s.facebook) socialsHtml += `<a href="${s.facebook}" target="_blank" title="Facebook"><i class="fab fa-facebook-f"></i></a>`;
    if (s.imdb) socialsHtml += `<a href="${s.imdb}" target="_blank" title="IMDb"><i class="fab fa-imdb"></i></a>`;
    
    socialsDiv.innerHTML = socialsHtml;

    const grid = document.getElementById('filmography-grid');
    if (person.credits.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted);">No filmography data available.</p>';
    } else {
        grid.innerHTML = person.credits.map(movie => `
            <div class="movie-card" onclick="window.location.href='index.html?movie_id=${movie.id}'">
                <img src="${movie.poster_url || 'https://via.placeholder.com/500x750?text=No+Poster'}" alt="${movie.title}">
                <div class="movie-card-info" style="padding: 10px 0;">
                    <h3 style="margin:0; font-size:15px; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; color: var(--text-main);">${movie.title}</h3>
                    <p style="margin: 3px 0 0 0; color: var(--accent); font-size: 13px; font-weight:600;">${movie.role}</p>
                    <p style="margin: 0; color: var(--text-muted); font-size: 12px;">${movie.release_date ? movie.release_date.substring(0,4) : 'Upcoming'}</p>
                </div>
            </div>
        `).join('');
    }
}

window.onload = loadPersonProfile;