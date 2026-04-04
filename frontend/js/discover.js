const DISCOVER_API_BASE_URL = "/api/v1/movies";
let discoverPage = 1;
let isDiscoverLoading = false;
let hasMoreDiscoverResults = true;
let activeDiscoverFilters = {};
let discoverObserver = null;
let autoApplyTimer = null;
let discoverInitialized = false;

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
    if (genreSelect.dataset.populated === "true") return;

    genreSelect.insertAdjacentHTML(
        "beforeend",
        TMDB_GENRES.map((g) => `<option value="${g.id}">${g.name}</option>`).join("")
    );
    genreSelect.dataset.populated = "true";
}

function syncSliderLabels() {
    const yearMin = document.getElementById("year-min");
    const yearMax = document.getElementById("year-max");
    const ratingMin = document.getElementById("rating-min");
    const yearMinValue = document.getElementById("year-min-value");
    const yearMaxValue = document.getElementById("year-max-value");
    const ratingMinValue = document.getElementById("rating-min-value");
    const errorMessage = document.getElementById("discover-range-error");

    if (!yearMin || !yearMax || !ratingMin) return;

    const minValue = Number(yearMin.value);
    const maxValue = Number(yearMax.value);
    const isInvalidRange = minValue > maxValue;

    if (yearMinValue) yearMinValue.textContent = yearMin.value;
    if (yearMaxValue) yearMaxValue.textContent = yearMax.value;
    if (ratingMinValue) ratingMinValue.textContent = Number(ratingMin.value).toFixed(1);

    if (errorMessage) {
        errorMessage.classList.toggle("hidden", !isInvalidRange);
    }

    yearMin.classList.toggle("invalid-range", isInvalidRange);
    yearMax.classList.toggle("invalid-range", isInvalidRange);
    return !isInvalidRange;
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

    const grid = document.getElementById("discover-grid");
    const emptyMessage = document.getElementById("discover-empty");
    const sentinel = document.getElementById("discover-sentinel");

    if (!grid || !emptyMessage || !sentinel) return;

    isDiscoverLoading = true;

    const params = new URLSearchParams({
        ...activeDiscoverFilters,
        page: String(discoverPage)
    });

    if (discoverPage === 1) {
        grid.innerHTML = buildSkeletonCards(12);
        emptyMessage.classList.add("hidden");
    }
    try {
        const response = await fetch(`${DISCOVER_API_BASE_URL}/discover?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to discover movies");

        const movies = await response.json();
        if (discoverPage === 1) grid.innerHTML = "";

        if (discoverPage === 1 && !movies.length) {
            emptyMessage.classList.remove("hidden");
            sentinel.classList.add("hidden");
            return;
        }

        emptyMessage.classList.add("hidden");
        grid.insertAdjacentHTML("beforeend", movies.map(buildMovieCardHTML).join(""));

        hasMoreDiscoverResults = movies.length >= 20;
        sentinel.classList.toggle("hidden", !hasMoreDiscoverResults);
    } catch (error) {
        console.error("Discover error:", error);
        if (discoverPage === 1) {
            grid.innerHTML = `<div class="state-message state-error"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load results</h3><p>Something went wrong. Please check your connection or try again.</p><button onclick="applyDiscoverFilters()">Retry</button></div>`;
        }
        emptyMessage.classList.add("hidden");
        showToast("Failed to load discover results.", "error");
    } finally {
        isDiscoverLoading = false;
        hideLoading();
    }
}

function applyDiscoverFilters() {
    const genreSelect = document.getElementById("genre-select");
    const langSelect = document.getElementById("lang-select");
    const yearMin = document.getElementById("year-min");
    const yearMax = document.getElementById("year-max");
    const ratingMin = document.getElementById("rating-min");
    const grid = document.getElementById("discover-grid");
    const sentinel = document.getElementById("discover-sentinel");

    if (!genreSelect || !langSelect || !yearMin || !yearMax || !ratingMin || !grid || !sentinel) return;
    if (!syncSliderLabels()) return;

    activeDiscoverFilters = {
        release_year_gte: yearMin.value,
        release_year_lte: yearMax.value,
        min_rating: ratingMin.value
    };
    if (genreSelect.value) {
        activeDiscoverFilters.genre = genreSelect.value;
    }
    if (langSelect.value) {
        activeDiscoverFilters.language = langSelect.value;
    }

    discoverPage = 1;
    hasMoreDiscoverResults = true;
    grid.innerHTML = "";
    sentinel.classList.remove("hidden");
    const nextParams = new URLSearchParams();
    if (activeDiscoverFilters.genre) nextParams.set("genre", activeDiscoverFilters.genre);
    if (activeDiscoverFilters.language) nextParams.set("language", activeDiscoverFilters.language);
    if (activeDiscoverFilters.release_year_gte) nextParams.set("year_min", activeDiscoverFilters.release_year_gte);
    if (activeDiscoverFilters.release_year_lte) nextParams.set("year_max", activeDiscoverFilters.release_year_lte);
    if (activeDiscoverFilters.min_rating) nextParams.set("min_rating", activeDiscoverFilters.min_rating);
    const nextQuery = nextParams.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState(window.history.state || {}, "", nextUrl);
    discoverMovies();
}

function scheduleApplyDiscoverFilters(delay = 220) {
    window.clearTimeout(autoApplyTimer);
    autoApplyTimer = window.setTimeout(() => {
        applyDiscoverFilters();
    }, delay);
}

function loadMoreDiscoverResults() {
    if (!hasMoreDiscoverResults || isDiscoverLoading) return;
    discoverPage += 1;
    discoverMovies();
}

function initDiscoverInfiniteScroll() {
    const sentinel = document.getElementById("discover-sentinel");
    if (!sentinel) return;

    if (discoverObserver) {
        discoverObserver.disconnect();
    }

    discoverObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    loadMoreDiscoverResults();
                }
            });
        },
        { root: null, rootMargin: "240px 0px 240px 0px", threshold: 0.01 }
    );

    discoverObserver.observe(sentinel);
}

function initDiscoverPage() {
    if (discoverInitialized) return;
    discoverInitialized = true;

    populateGenres();
    syncSliderLabels();

    const genreSelect = document.getElementById("genre-select");
    const langSelect = document.getElementById("lang-select");
    const yearMin = document.getElementById("year-min");
    const yearMax = document.getElementById("year-max");
    const ratingMin = document.getElementById("rating-min");

    [yearMin, yearMax, ratingMin].forEach((slider) => {
        if (!slider) return;
        slider.addEventListener("input", syncSliderLabels);
        slider.addEventListener("mouseup", () => scheduleApplyDiscoverFilters());
        slider.addEventListener("touchend", () => scheduleApplyDiscoverFilters());
        slider.addEventListener("change", () => scheduleApplyDiscoverFilters());
    });

    [genreSelect, langSelect].forEach((select) => {
        if (!select) return;
        select.addEventListener("change", () => scheduleApplyDiscoverFilters(80));
    });

    const urlParams = new URLSearchParams(window.location.search);
    const genreFromUrl = urlParams.get("genre");
    const yearMinFromUrl = urlParams.get("year_min");
    const yearMaxFromUrl = urlParams.get("year_max");
    const minRatingFromUrl = urlParams.get("min_rating");
    const languageFromUrl = urlParams.get("language");

    if (genreSelect && genreFromUrl) {
        genreSelect.value = genreFromUrl;
    }
    if (yearMin && yearMinFromUrl) {
        yearMin.value = yearMinFromUrl;
    }
    if (yearMax && yearMaxFromUrl) {
        yearMax.value = yearMaxFromUrl;
    }
    if (ratingMin && minRatingFromUrl) {
        ratingMin.value = minRatingFromUrl;
    }
    if (langSelect && languageFromUrl) {
        langSelect.value = languageFromUrl;
    }
    syncSliderLabels();

    initDiscoverInfiniteScroll();
    applyDiscoverFilters();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initDiscoverPage);
} else {
    initDiscoverPage();
}
