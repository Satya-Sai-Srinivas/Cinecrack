const AI_API_URL = "/api/v1/ai/chat";
const CHAT_HISTORY_KEY = "cinecrack-chat-history";
const CHAT_OPEN_KEY = "cinecrack-chat-open";

let conversationHistory = [];
let chatIsOpen = false;

function escapeHTML(input) {
    return String(input)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function loadPersistedState() {
    try {
        const rawHistory = sessionStorage.getItem(CHAT_HISTORY_KEY);
        if (rawHistory) {
            const parsed = JSON.parse(rawHistory);
            if (Array.isArray(parsed)) {
                conversationHistory = parsed.filter(
                    (item) => item && typeof item.role === "string" && typeof item.content === "string"
                );
            }
        }

        const rawOpen = sessionStorage.getItem(CHAT_OPEN_KEY);
        chatIsOpen = rawOpen === "true";
    } catch (error) {
        console.warn("Failed to restore chatbot state.", error);
        conversationHistory = [];
        chatIsOpen = false;
    }
}

function persistHistory() {
    sessionStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(conversationHistory));
}

function persistOpenState() {
    sessionStorage.setItem(CHAT_OPEN_KEY, String(chatIsOpen));
}

function buildMovieCardHTML(movie) {
    const safeTitle = escapeHTML(movie.title || "Untitled");
    const safePoster = movie.poster_url || "https://via.placeholder.com/500x750?text=No+Poster";
    const safeMovieId = Number(movie.id || 0);
    const returnTo = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    const targetUrl = `index.html?movie_id=${safeMovieId}&ref=chatbot&return_to=${returnTo}`;

    return `
        <div class="movie-card compact-movie-card" onclick="window.location.href='${targetUrl}'">
            <img src="${safePoster}" alt="${safeTitle}">
            <div class="movie-card-info">
                <h3>${safeTitle}</h3>
                <p>${movie.release_date ? String(movie.release_date).slice(0, 4) : "N/A"}</p>
            </div>
        </div>
    `;
}

function getChatElements() {
    return {
        windowEl: document.getElementById("chatbot-window"),
        thread: document.getElementById("chatbot-thread"),
        form: document.getElementById("chatbot-form"),
        input: document.getElementById("chatbot-input"),
        sendButton: document.getElementById("chatbot-send-btn"),
        fab: document.getElementById("chatbot-fab"),
        closeButton: document.getElementById("chatbot-close"),
        clearButton: document.getElementById("chatbot-clear")
    };
}

function injectChatbotDOM() {
    if (document.getElementById("chatbot-widget-root")) return;

    const root = document.createElement("div");
    root.id = "chatbot-widget-root";
    root.innerHTML = `
        <button id="chatbot-fab" class="chatbot-fab" type="button" aria-label="Toggle AI Assistant">
            <i class="fas fa-comment-dots" aria-hidden="true"></i>
        </button>

        <section id="chatbot-window" class="chatbot-window chatbot-hidden" aria-label="AI Assistant chat">
            <header class="chatbot-header">
                <div class="chatbot-title">
                    <i class="fas fa-robot" aria-hidden="true"></i>
                    <span>AI Cinema Guru</span>
                </div>
                <div class="chatbot-header-actions">
                    <button id="chatbot-clear" class="chatbot-clear" type="button" aria-label="Clear chat">
                        <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                    <button id="chatbot-close" class="chatbot-close" type="button" aria-label="Close chat">
                        <i class="fas fa-xmark" aria-hidden="true"></i>
                    </button>
                </div>
            </header>

            <div id="chatbot-thread" class="chatbot-thread"></div>

            <form id="chatbot-form" class="chatbot-form">
                <textarea
                    id="chatbot-input"
                    class="chatbot-input"
                    rows="1"
                    placeholder="Ask for movie moods, themes, arcs..."
                    required
                ></textarea>
                <button id="chatbot-send-btn" class="chatbot-send-btn" type="submit">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </form>
        </section>
    `;

    document.body.appendChild(root);
}

function setChatOpen(nextOpen, persist = true) {
    const { windowEl } = getChatElements();
    if (!windowEl) return;

    chatIsOpen = Boolean(nextOpen);
    windowEl.classList.toggle("chatbot-visible", chatIsOpen);
    windowEl.classList.toggle("chatbot-hidden", !chatIsOpen);

    if (persist) persistOpenState();
}

function toggleGlobalChat(force) {
    const nextOpen = typeof force === "boolean" ? force : !chatIsOpen;
    setChatOpen(nextOpen);
    if (nextOpen) {
        const { input } = getChatElements();
        if (input) input.focus();
    }
}

window.toggleGlobalChat = toggleGlobalChat;

function appendMessage(role, content = "", isLoading = false) {
    const { thread } = getChatElements();
    if (!thread) return null;

    const article = document.createElement("article");
    article.className = `chatbot-message ${role === "user" ? "user" : "assistant"}`;

    const bubble = document.createElement("div");
    bubble.className = `chatbot-bubble ${role === "user" ? "user-bubble" : "ai-bubble"}`;

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

function appendRecommendations(containerBubble, recommendations) {
    if (!Array.isArray(recommendations) || recommendations.length === 0 || !containerBubble) return;
    const row = document.createElement("div");
    row.className = "movie-row ai-reco-row";
    row.innerHTML = recommendations.map(buildMovieCardHTML).join("");
    containerBubble.appendChild(row);
}

function renderConversationFromHistory() {
    const { thread } = getChatElements();
    if (!thread) return;
    thread.innerHTML = "";

    if (conversationHistory.length === 0) {
        appendMessage(
            "assistant",
            "Welcome. Describe a vibe, character arc, ending tone, or visual atmosphere, and I will curate cinematic matches."
        );
        return;
    }

    conversationHistory.forEach((entry) => {
        const rendered = appendMessage(entry.role, entry.content || "");
        if (entry.role === "assistant" && rendered?.bubble && Array.isArray(entry.recommendations)) {
            appendRecommendations(rendered.bubble, entry.recommendations);
        }
    });
}

async function streamGuruResponse(query, handlers) {
    const response = await fetch(AI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query,
            conversation_history: conversationHistory.map((item) => ({
                role: item.role,
                content: item.content
            }))
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

function autoResizeTextarea(event) {
    const target = event.target;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
}

async function onSubmitChat(event) {
    event.preventDefault();
    const { input, sendButton, thread } = getChatElements();
    if (!input || !sendButton || !thread) return;

    const query = input.value.trim();
    if (!query) return;

    appendMessage("user", query);
    conversationHistory.push({ role: "user", content: query });
    persistHistory();

    input.value = "";
    input.style.height = "auto";
    sendButton.disabled = true;

    const loadingMessage = appendMessage("assistant", "", true);
    let streamedText = "";
    const streamedRecommendations = [];
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
                    const items = Array.isArray(payload.items) ? payload.items : [];
                    streamedRecommendations.push(...items);
                    appendRecommendations(loadingMessage.bubble, items);
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
                    const language = typeof args.language === "string" ? args.language.trim() : "";
                    const url = new URL("discover.html", window.location.href);
                    if (genre > 0) {
                        url.searchParams.set("genre", String(genre));
                    }
                    if (language) {
                        url.searchParams.set("language", language);
                    }
                    url.searchParams.set("year_min", String(yearMin));
                    url.searchParams.set("year_max", String(yearMax));
                    if (rating > 0) {
                        url.searchParams.set("min_rating", String(rating));
                    }
                    redirectedByTool = true;
                    persistOpenState();
                    window.location.href = url.toString();
                    return;
                }

                if (payload.type === "error") {
                    loadingMessage.bubble.innerHTML = `<p>${escapeHTML(payload.message || "Streaming failed.")}</p>`;
                    return;
                }

                if (payload.type === "done" && !streamedText.trim()) {
                    const textNode = loadingMessage.bubble.querySelector("p");
                    if (textNode) {
                        textNode.textContent = "I am ready with recommendations. Tell me more about your mood and tone.";
                    }
                }
            }
        });

        if (!redirectedByTool) {
            conversationHistory.push({
                role: "assistant",
                content: streamedText.trim() || "Ready with recommendations.",
                recommendations: streamedRecommendations
            });
            persistHistory();
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

function bindChatbotEvents() {
    const { form, input, fab, closeButton, clearButton } = getChatElements();
    if (!form || !input || !fab || !closeButton || !clearButton) return;

    fab.addEventListener("click", () => toggleGlobalChat());
    closeButton.addEventListener("click", () => toggleGlobalChat(false));
    clearButton.addEventListener("click", () => {
        conversationHistory = [];
        persistHistory();
        renderConversationFromHistory();
    });
    form.addEventListener("submit", onSubmitChat);
    input.addEventListener("input", autoResizeTextarea);
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            form.requestSubmit();
        }
    });

}

function initGlobalChatbot() {
    loadPersistedState();
    injectChatbotDOM();
    bindChatbotEvents();
    renderConversationFromHistory();
    setChatOpen(chatIsOpen, false);
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initGlobalChatbot);
} else {
    initGlobalChatbot();
}
