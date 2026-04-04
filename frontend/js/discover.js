const DISCOVER_API_BASE_URL = "http://127.0.0.1:8000/api/v1/movies";
let discoverPage = 1;
let isDiscoverLoading = false;
let hasMoreDiscoverResults = true;
let activeDiscoverFilters = {};

const TMDB_GENRES = [
    { id: 28, name: "Action" },
    { id: 12, name: "Adventure" },
    { id: 16, name: "Animation" },
    { id: 35, name: "Comedy" },
    { id: 80, name: "Crime" },
    { id: 99, name: "Documentary" },
    { id: 18, name: "Drama" },
    { id: 10751, name: "Family" },
    { id: 14, name: "Fantasy" },
    { id: 36, name: "History" },
    { id: 27, name: "Horror" },
    { id: 10402, name: "Music" },
    { id: 9648, name: "Mystery" },
    { id: 10749, name: "Romance" },
    { id: 878, name: "Science Fiction" },
    { id: 10770, name: "TV Movie" },
    { id: 53, name: "Thriller" },
    { id: 10752, name: "War" },
    { id: 37, name: "Western" }
];

function showLoading() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.classList.remove("hidden");
}

function hideLoading() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.classList.add("hidden");
}

function populateGenres() {
    const genreSelect = document.getElementById("genre-select");
    if (!genreSelect) return;

    genreSelect.insertAdjacentHTML(
        "beforeend",
        TMDB_GENRES.map((g) => `<option value="${g.id}">${g.name}</option>`).join("")
    );
}

function syncSliderLabels() {
    const yearMin = document.getElementById("year-min");
    const yearMax = document.getElementById("year-max");
    const ratingMin = document.getElementById("rating-min");
    const yearMinValue = document.getElementById("year-min-value");
    const yearMaxValue = document.getElementById("year-max-value");
    const ratingMinValue = document.getElementById("rating-min-value");

    if (!yearMin || !yearMax || !ratingMin) return;

    if (Number(yearMin.value) > Number(yearMax.value)) {
        yearMax.value = yearMin.value;
    }
    if (Number(yearMax.value) < Number(yearMin.value)) {
        yearMin.value = yearMax.value;
    }

    if (yearMinValue) yearMinValue.textContent = yearMin.value;
    if (yearMaxValue) yearMaxValue.textContent = yearMax.value;
    if (ratingMinValue) ratingMinValue.textContent = Number(ratingMin.value).toFixed(1);
}

function buildMovieCardHTML(movie) {
    return `
        <div class="movie-card" onclick="window.location.href='index.html?movie_id=${movie.id}&ref=discover'">
            <img src="${movie.poster_url || "https://via.placeholder.com/500x750?text=No+Poster"}" alt="${movie.title}">
            <div class="movie-card-info">
                <h3>${movie.title}</h3>
                <p>${movie.release_date ? movie.release_date.substring(0, 4) : "N/A"}</p>
            </div>
        </div>
    `;
}

async function discoverMovies() {
    if (isDiscoverLoading) return;

    const genreSelect = document.getElementById("genre-select");
    const yearMin = document.getElementById("year-min");
    const yearMax = document.getElementById("year-max");
    const ratingMin = document.getElementById("rating-min");
    const grid = document.getElementById("discover-grid");
    const emptyMessage = document.getElementById("discover-empty");
    const loadMoreWrap = document.getElementById("discover-load-more-wrap");
    const loadMoreButton = document.getElementById("discover-load-more");

    if (!genreSelect || !yearMin || !yearMax || !ratingMin || !grid || !emptyMessage || !loadMoreWrap || !loadMoreButton) return;

    isDiscoverLoading = true;
    loadMoreButton.disabled = true;
    loadMoreButton.textContent = "Loading...";

    const params = new URLSearchParams({
        ...activeDiscoverFilters,
        page: String(discoverPage)
    });

    showLoading();
    try {
        const response = await fetch(`${DISCOVER_API_BASE_URL}/discover?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to discover movies");

        const movies = await response.json();
        if (discoverPage === 1 && !movies.length) {
            grid.innerHTML = "";
            emptyMessage.classList.remove("hidden");
            loadMoreWrap.classList.add("hidden");
            return;
        }

        emptyMessage.classList.add("hidden");
        grid.insertAdjacentHTML("beforeend", movies.map(buildMovieCardHTML).join(""));

        hasMoreDiscoverResults = movies.length >= 20;
        loadMoreWrap.classList.toggle("hidden", !hasMoreDiscoverResults);
    } catch (error) {
        console.error("Discover error:", error);
        if (discoverPage === 1) {
            grid.innerHTML = `<p class="discover-empty">Failed to load discover results. Is the backend running?</p>`;
        }
        emptyMessage.classList.add("hidden");
    } finally {
        isDiscoverLoading = false;
        loadMoreButton.disabled = false;
        loadMoreButton.textContent = "Load More";
        hideLoading();
    }
}

function applyDiscoverFilters() {
    const genreSelect = document.getElementById("genre-select");
    const yearMin = document.getElementById("year-min");
    const yearMax = document.getElementById("year-max");
    const ratingMin = document.getElementById("rating-min");
    const grid = document.getElementById("discover-grid");
    const loadMoreWrap = document.getElementById("discover-load-more-wrap");

    if (!genreSelect || !yearMin || !yearMax || !ratingMin || !grid || !loadMoreWrap) return;

    activeDiscoverFilters = {
        release_year_gte: yearMin.value,
        release_year_lte: yearMax.value,
        min_rating: ratingMin.value
    };
    if (genreSelect.value) {
        activeDiscoverFilters.genre = genreSelect.value;
    }

    discoverPage = 1;
    hasMoreDiscoverResults = true;
    grid.innerHTML = "";
    loadMoreWrap.classList.add("hidden");
    discoverMovies();
}

function loadMoreDiscoverResults() {
    if (!hasMoreDiscoverResults || isDiscoverLoading) return;
    discoverPage += 1;
    discoverMovies();
}

function initDiscoverPage() {
    populateGenres();
    syncSliderLabels();

    const form = document.getElementById("discover-form");
    const yearMin = document.getElementById("year-min");
    const yearMax = document.getElementById("year-max");
    const ratingMin = document.getElementById("rating-min");
    const loadMoreButton = document.getElementById("discover-load-more");

    if (form) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            applyDiscoverFilters();
        });
    }

    [yearMin, yearMax, ratingMin].forEach((slider) => {
        if (!slider) return;
        slider.addEventListener("input", syncSliderLabels);
    });

    if (loadMoreButton) {
        loadMoreButton.addEventListener("click", loadMoreDiscoverResults);
    }

    applyDiscoverFilters();
}

window.addEventListener("DOMContentLoaded", initDiscoverPage);
