const THEME_STORAGE_KEY = "cinecrack-theme";

function getPreferredTheme() {
    let savedTheme = null;
    try {
        savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    } catch (error) {
        savedTheme = null;
    }
    if (savedTheme === "light" || savedTheme === "dark") {
        return savedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark-theme", theme === "dark");
    if (document.body) {
        document.body.setAttribute("data-theme", theme);
        document.body.classList.toggle("dark-theme", theme === "dark");
    }
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
        // Ignore storage errors and still apply runtime theme.
    }
    syncThemeToggle(theme);
}

function syncThemeToggle(theme) {
    const themeToggle = document.getElementById("theme-toggle");
    if (!themeToggle) return;

    const isDark = theme === "dark";
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.innerHTML = isDark
        ? '<i class="fas fa-sun"></i><span>Light Mode</span>'
        : '<i class="fas fa-moon"></i><span>Dark Mode</span>';
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
}

function initTheme() {
    const initialTheme = document.documentElement.getAttribute("data-theme") || getPreferredTheme();
    applyTheme(initialTheme);

    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
        themeToggle.addEventListener("click", toggleTheme);
    }
}

document.addEventListener("DOMContentLoaded", initTheme);
