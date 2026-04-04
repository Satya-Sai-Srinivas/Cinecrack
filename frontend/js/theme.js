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

/* --- Toast Notification Utility --- */
function showToast(message, type = "error") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-out");
        toast.addEventListener("animationend", () => toast.remove());
    }, 3000);
}

/* --- Skeleton Card Generator --- */
function buildSkeletonCards(count = 12) {
    return Array.from({ length: count }, () =>
        `<div class="skeleton-card"><div class="skeleton-poster"></div><div class="skeleton-title"></div><div class="skeleton-subtitle"></div></div>`
    ).join("");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
} else {
    initTheme();
}
