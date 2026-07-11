const SUPABASE_FUNCTION_URL =
  "https://kiyuawmnmzffqlgvntbv.supabase.co/functions/v1/swift-api";

const form = document.querySelector("#chatForm");
const promptInput = document.querySelector("#prompt");
const messages = document.querySelector("#messages");
const thinking = document.querySelector("#thinking");
const sendBtn = document.querySelector("#sendBtn");
const clearBtn = document.querySelector("#clearBtn");
const engineStatusText = document.querySelector("#engineStatusText");

let busy = false;

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(text) {
  if (engineStatusText) engineStatusText.textContent = text;
}

function resizeInput() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 180)}px`;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
}

function setBusy(value) {
  busy = Boolean(value);
  sendBtn.disabled = busy;
  promptInput.disabled = busy;
  thinking.classList.toggle("hidden", !busy);
}

function addUserMessage(text) {
  messages.insertAdjacentHTML("beforeend", `
    <article class="message user-message">
      <div class="message-bubble">
        <span class="message-speaker">YOU</span>
        <p>${escapeHTML(text)}</p>
      </div>
    </article>
  `);

  scrollToBottom();
}

function addAssistantMessage(data) {
  const blocks = [
    ["WHY IT MATTERS", data.why],
    ["MECHANISM", data.mechanism],
    ["COUNTERCASE", data.countercase],
    ["CONFIDENCE", data.confidence],
    ["WHAT WOULD CHANGE THE VIEW", data.change]
  ];

  messages.insertAdjacentHTML("beforeend", `
    <article class="message assistant-message">
      <div class="assistant-avatar" aria-hidden="true">AI</div>

      <div class="message-bubble">
        <span class="message-speaker">BONDSTATS AI</span>

<p>${escapeHTML(
  String(data.answer || "No answer returned.")
    .replace(/\(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\)/g, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "")
    .trim()
)}</p>
        <div class="analysis-grid">
          ${blocks.map(([title, content]) => `
            <div class="analysis-block">
              <strong>${escapeHTML(title)}</strong>
<p>${escapeHTML(
  cleanMarkdown(content || "Not available.")
)}</p>            </div>
          `).join("")}
        </div>
        ${
  Array.isArray(data.sources) && data.sources.length > 0
    ? `
      <div class="sources-block">
        <strong>SOURCES</strong>

        <ul>
          ${data.sources.map(source => `
            <li>
              <a
                href="${escapeHTML(source.url || "#")}"
                target="_blank"
                rel="noopener noreferrer"
              >
                ${escapeHTML(
                  source.title ||
                  source.name ||
                  source.url ||
                  "View source"
                )}
              </a>
            </li>
          `).join("")}
        </ul>
      </div>
    `
    : ""
}
        <p class="disclaimer">
          ${escapeHTML(data.disclaimer || "Educational financial information only.")}
        </p>
      </div>
    </article>
  `);

  scrollToBottom();
}

function addErrorMessage(text) {
  messages.insertAdjacentHTML("beforeend", `
    <article class="message assistant-message">
      <div class="assistant-avatar" aria-hidden="true">AI</div>

      <div class="message-bubble error-bubble">
        <span class="message-speaker">ANALYSIS ERROR</span>
        <p>${escapeHTML(text)}</p>
      </div>
    </article>
  `);

  scrollToBottom();
}

async function askBondStatsAI(message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ message }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function submitMessage() {
  if (busy) return;

  const message = promptInput.value.trim();

  if (!message) {
    promptInput.focus();
    return;
  }

  addUserMessage(message);

  promptInput.value = "";
  resizeInput();

  setBusy(true);
  setStatus("Building Analysis");

  try {
    const data = await askBondStatsAI(message);
    addAssistantMessage(data);
    setStatus("Analysis Engine Online");
  } catch (error) {
    console.error(error);

    if (error.name === "AbortError") {
      addErrorMessage("The request timed out. Please try again.");
    } else if (String(error.message).includes("401")) {
      addErrorMessage("Supabase rejected the request. Disable JWT verification for this Edge Function.");
    } else {
      addErrorMessage("The analysis engine could not respond. Check Supabase logs.");
    }

    setStatus("Engine Error");
  } finally {
    setBusy(false);
    promptInput.focus();
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  submitMessage();
});

promptInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submitMessage();
  }
});

promptInput.addEventListener("input", resizeInput);

clearBtn.addEventListener("click", () => {
  messages.innerHTML = `
    <article class="message assistant-message">
      <div class="assistant-avatar" aria-hidden="true">AI</div>
      <div class="message-bubble">
        <span class="message-speaker">BONDSTATS AI</span>
        <p>New session ready. Ask a question about finance, markets, bonds, inflation, central banks or risk.</p>
      </div>
    </article>
  `;

  promptInput.value = "";
  resizeInput();
  promptInput.focus();
});

resizeInput();
setStatus("Analysis Engine Online");
promptInput.focus();
