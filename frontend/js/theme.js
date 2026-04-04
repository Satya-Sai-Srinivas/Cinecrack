const THEME_STORAGE_KEY = "cinecrack-theme";
const SIDEBAR_STORAGE_KEY = "cinecrack-sidebar-collapsed";

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

function applySidebarState(collapsed) {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    sidebar.classList.toggle("collapsed", collapsed);
    try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "true" : "false");
    } catch (error) {
        // Ignore storage errors while keeping runtime behavior.
    }
}

function initSidebarToggle() {
    const sidebar = document.querySelector(".sidebar");
    const sidebarToggle = document.getElementById("sidebar-toggle");
    if (!sidebar || !sidebarToggle) return;

    let collapsed = false;
    try {
        collapsed = localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
    } catch (error) {
        collapsed = false;
    }

    applySidebarState(collapsed);

    sidebarToggle.addEventListener("click", () => {
        applySidebarState(!sidebar.classList.contains("collapsed"));
    });
}

function initTheme() {
    const initialTheme = document.documentElement.getAttribute("data-theme") || getPreferredTheme();
    applyTheme(initialTheme);

    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
        themeToggle.addEventListener("click", toggleTheme);
    }

    initSidebarToggle();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
} else {
    initTheme();
}
