const AI_API_URL = "http://127.0.0.1:8000/api/v1/ai/chat";
const conversationHistory = [];

function escapeHTML(input) {
    return String(input)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

// Reuses the same card structure used across existing pages.
function buildMovieCardHTML(movie) {
    return `
        <div class="movie-card" onclick="window.location.href='index.html?movie_id=${movie.id}&ref=ai-guru'">
            <img src="${movie.poster_url || "https://via.placeholder.com/500x750?text=No+Poster"}" alt="${escapeHTML(movie.title)}">
            <div class="movie-card-info">
                <h3>${escapeHTML(movie.title)}</h3>
                <p>${movie.release_date ? String(movie.release_date).substring(0, 4) : "N/A"}</p>
            </div>
        </div>
    `;
}

function appendMessage(role, content = "", isLoading = false) {
    const thread = document.getElementById("ai-chat-thread");
    if (!thread) return null;

    const article = document.createElement("article");
    article.className = `chat-message ${role === "user" ? "user-message" : "ai-message"}`;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";

    if (isLoading) {
        bubble.innerHTML = `
            <div class="cinematic-loader" aria-hidden="true">
                <span class="orbital-ring"></span>
                <span class="orbital-ring delay"></span>
                <span class="clapper-core"><i class="fas fa-film"></i></span>
            </div>
            <p class="loading-text">Composing a cinematic answer...</p>
        `;
    } else {
        const p = document.createElement("p");
        p.textContent = content;
        bubble.appendChild(p);
    }

    article.appendChild(bubble);
    thread.appendChild(article);
    thread.scrollTop = thread.scrollHeight;
    return { article, bubble };
}

async function typewriterText(targetElement, text) {
    targetElement.textContent = "";
    for (let i = 0; i < text.length; i += 1) {
        targetElement.textContent += text[i];
        await new Promise((resolve) => setTimeout(resolve, 8));
    }
}

async function sendToGuru(query) {
    const response = await fetch(AI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query,
            conversation_history: conversationHistory
        })
    });

    if (!response.ok) {
        throw new Error("AI Guru request failed.");
    }
    return response.json();
}

function appendRecommendations(containerBubble, recommendations) {
    if (!Array.isArray(recommendations) || !recommendations.length) return;
    const row = document.createElement("div");
    row.className = "movie-row ai-reco-row";
    row.innerHTML = recommendations.map(buildMovieCardHTML).join("");
    containerBubble.appendChild(row);
}

async function onSubmitChat(event) {
    event.preventDefault();
    const input = document.getElementById("ai-query-input");
    const sendButton = document.getElementById("ai-send-btn");
    const thread = document.getElementById("ai-chat-thread");
    if (!input || !sendButton || !thread) return;

    const query = input.value.trim();
    if (!query) return;

    appendMessage("user", query);
    input.value = "";
    sendButton.disabled = true;

    const loadingMessage = appendMessage("assistant", "", true);
    try {
        const payload = await sendToGuru(query);
        const messageText = payload.message || "I do not have enough context yet. Try a more specific query.";
        const recommendations = payload.recommendations || [];

        conversationHistory.push({ role: "user", content: query });
        conversationHistory.push({ role: "assistant", content: messageText });

        if (loadingMessage?.bubble) {
            loadingMessage.bubble.innerHTML = "<p></p>";
            const textNode = loadingMessage.bubble.querySelector("p");
            if (textNode) {
                await typewriterText(textNode, messageText);
            }
            appendRecommendations(loadingMessage.bubble, recommendations);
        }
    } catch (error) {
        console.error(error);
        if (loadingMessage?.bubble) {
            loadingMessage.bubble.innerHTML = "<p>The reel snapped mid-scene. Ensure the backend and OpenAI key are configured, then try again.</p>";
        }
    } finally {
        sendButton.disabled = false;
        thread.scrollTop = thread.scrollHeight;
    }
}

function autoResizeTextarea(event) {
    const target = event.target;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 180)}px`;
}

function initAIGuruPage() {
    const form = document.getElementById("ai-chat-form");
    const input = document.getElementById("ai-query-input");
    if (!form || !input) return;

    form.addEventListener("submit", onSubmitChat);
    input.addEventListener("input", autoResizeTextarea);
}

window.addEventListener("DOMContentLoaded", initAIGuruPage);
