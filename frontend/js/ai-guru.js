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

async function streamGuruResponse(query, handlers) {
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
    if (!response.body) {
        throw new Error("Streaming response not available.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex !== -1) {
            const rawEvent = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);
            const dataLine = rawEvent
                .split("\n")
                .find((line) => line.startsWith("data: "));
            if (dataLine) {
                try {
                    const payload = JSON.parse(dataLine.slice(6));
                    handlers.onEvent(payload);
                } catch (error) {
                    console.warn("Failed to parse SSE payload", error);
                }
            }
            separatorIndex = buffer.indexOf("\n\n");
        }
    }
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
    let streamedText = "";
    let redirectedByTool = false;

    try {
        if (loadingMessage?.bubble) {
            loadingMessage.bubble.innerHTML = "<p></p>";
        }

        await streamGuruResponse(query, {
            onEvent(payload) {
                if (!loadingMessage?.bubble) return;

                if (payload.type === "text") {
                    streamedText += payload.content || "";
                    const textNode = loadingMessage.bubble.querySelector("p");
                    if (textNode) {
                        textNode.textContent = streamedText;
                    }
                    thread.scrollTop = thread.scrollHeight;
                    return;
                }

                if (payload.type === "recommendations") {
                    appendRecommendations(loadingMessage.bubble, payload.items || []);
                    thread.scrollTop = thread.scrollHeight;
                    return;
                }

                if (payload.type === "tool_call" && payload.tool === "apply_discover_filters") {
                    const args = payload.arguments || {};
                    const genre = Number(args.genre_id || 0);
                    const start = Number(args.start_year || 1990);
                    const yearMin = Number.isFinite(start) ? start : 1990;
                    const yearMax = Math.min(yearMin + 9, 2100);
                    const rating = Number(args.min_rating || 0);
                    const url = new URL("discover.html", window.location.href);
                    if (genre > 0) {
                        url.searchParams.set("genre", String(genre));
                    }
                    url.searchParams.set("year_min", String(yearMin));
                    url.searchParams.set("year_max", String(yearMax));
                    if (rating > 0) {
                        url.searchParams.set("min_rating", String(rating));
                    }
                    redirectedByTool = true;
                    window.location.href = url.toString();
                    return;
                }

                if (payload.type === "error") {
                    loadingMessage.bubble.innerHTML = `<p>${escapeHTML(payload.message || "Streaming failed.")}</p>`;
                    return;
                }

                if (payload.type === "done") {
                    if (!streamedText.trim()) {
                        const textNode = loadingMessage.bubble.querySelector("p");
                        if (textNode) {
                            textNode.textContent = "I am ready with recommendations. Tell me more about your mood and tone.";
                        }
                    }
                }
            }
        });

        if (!redirectedByTool) {
            conversationHistory.push({ role: "user", content: query });
            conversationHistory.push({ role: "assistant", content: streamedText.trim() || "Ready with recommendations." });
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
