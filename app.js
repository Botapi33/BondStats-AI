"use strict";

/*
 * BondStats AI — Frontend
 *
 * OpenAI und OpenFIGI werden ausschließlich über die
 * Supabase Edge Function aufgerufen.
 *
 * Niemals API-Keys in dieser Datei speichern.
 */

const SUPABASE_FUNCTION_URL =
  "https://kiyuawmnmzffqlgvntbv.supabase.co/functions/v1/swift-api";

/* =========================================================
   DOM elements
========================================================= */

const form = document.querySelector("#chatForm");
const promptInput = document.querySelector("#prompt");
const messages = document.querySelector("#messages");
const thinking = document.querySelector("#thinking");
const sendBtn = document.querySelector("#sendBtn");
const clearBtn = document.querySelector("#clearBtn");
const newSessionBtn = document.querySelector("#newSessionBtn");
const engineStatusText = document.querySelector("#engineStatusText");

/*
 * Only a small amount of conversation history is sent.
 * This keeps requests fast and avoids excessive token usage.
 */
let conversationHistory = [];
let busy = false;

/* =========================================================
   General helpers
========================================================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanMarkdown(value) {
  return String(value ?? "")
    /*
     * Markdown links:
     * [Converse Bank](https://example.com)
     * becomes:
     * Converse Bank
     */
    .replace(
      /\(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\)/gi,
      "$1"
    )
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi,
      "$1"
    )

    /*
     * Remove raw links from analysis prose.
     * Sources are rendered separately below.
     */
    .replace(
      /\s*\(?https?:\/\/[^\s)]+(?:\))?/gi,
      ""
    )

    /* Markdown formatting */
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```(?:json|text|javascript|typescript)?/gi, "")
    .replace(/```/g, "")

    /* List symbols */
    .replace(/^\s*[-*]\s+/gm, "• ")

    /* Whitespace */
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeText(value, fallback = "Not available.") {
  const cleaned = cleanMarkdown(value);
  return cleaned || fallback;
}

function safeURL(value) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = new URL(value);

    if (
      parsed.protocol !== "https:" &&
      parsed.protocol !== "http:"
    ) {
      return null;
    }

    /*
     * Remove tracking parameters that should not be displayed.
     */
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.searchParams.delete("utm_campaign");
    parsed.searchParams.delete("utm_content");

    return parsed.toString();
  } catch {
    return null;
  }
}

function sourceLabel(source, url) {
  const suppliedTitle =
    typeof source?.title === "string"
      ? cleanMarkdown(source.title)
      : "";

  if (
    suppliedTitle &&
    suppliedTitle.toLowerCase() !== "view source"
  ) {
    return suppliedTitle;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "View source";
  }
}

function normalizeSources(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Map();

  for (const source of value) {
    const url = safeURL(source?.url);

    if (!url || unique.has(url)) {
      continue;
    }

    unique.set(url, {
      title: sourceLabel(source, url),
      url,
      type:
        typeof source?.type === "string"
          ? source.type
          : "web"
    });
  }

  return [...unique.values()].slice(0, 5);
}

function scrollToBottom() {
  if (!messages) {
    return;
  }

  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
}

function resizeInput() {
  if (!promptInput) {
    return;
  }

  promptInput.style.height = "auto";

  const desiredHeight = Math.min(
    promptInput.scrollHeight,
    180
  );

  promptInput.style.height = `${desiredHeight}px`;
}

function setEngineStatus(text) {
  if (engineStatusText) {
    engineStatusText.textContent = text;
  }
}

function setBusy(value) {
  busy = Boolean(value);

  if (sendBtn) {
    sendBtn.disabled = busy;
    sendBtn.setAttribute(
      "aria-busy",
      String(busy)
    );
  }

  if (promptInput) {
    promptInput.disabled = busy;
  }

  if (thinking) {
    thinking.hidden = !busy;
  }

  setEngineStatus(
    busy
      ? "Analyzing…"
      : "Ready"
  );
}

/* =========================================================
   Conversation history
========================================================= */

function addToHistory(role, content) {
  const normalizedContent = cleanMarkdown(content);

  if (!normalizedContent) {
    return;
  }

  conversationHistory.push({
    role,
    content: normalizedContent.slice(0, 2500)
  });

  /*
   * Keep only the latest six messages.
   */
  conversationHistory =
    conversationHistory.slice(-6);
}

/* =========================================================
   Message rendering
========================================================= */

function addUserMessage(text) {
  if (!messages) {
    return;
  }

  messages.insertAdjacentHTML(
    "beforeend",
    `
      <article class="message user-message">
        <div class="message-bubble">
          <span class="message-speaker">YOU</span>
          <p>${escapeHTML(text)}</p>
        </div>
      </article>
    `
  );

  scrollToBottom();
}

function AnalysisBlocks(data) {
  const blocks = [
    [
      "WHY IT MATTERS",
      data?.why
    ],
    [
      "MECHANISM",
      data?.mechanism
    ],
    [
      "COUNTERCASE",
      data?.countercase
    ],
    [
      "CONFIDENCE",
      data?.confidence
    ],
    [
      "WHAT WOULD CHANGE THE VIEW",
      data?.change
    ]
  ];

  return blocks
    .map(([title, content]) => {
      return `
        <div class="analysis-block">
          <strong>${escapeHTML(title)}</strong>
          <p>${escapeHTML(
            safeText(content)
          )}</p>
        </div>
      `;
    })
    .join("");
}

function ConfidenceExplanation(data) {
  const explanation = safeText(
    data?.confidenceExplanation,
    ""
  );

  if (!explanation) {
    return "";
  }

  return `
    <p class="confidence-explanation">
      ${escapeHTML(explanation)}
    </p>
  `;
}



  if (
    !verification ||
    typeof verification !== "object"
  ) {
    return "";
  }

  const rows = [];

  if (verification.isin) {
    rows.push([
      "ISIN",
      verification.isin
    ]);
  }

  if (
    typeof verification.checksumValid ===
    "boolean"
  ) {
    rows.push([
      "Checksum",
      verification.checksumValid
        ? "Valid"
        : "Invalid"
    ]);
  }

  if (
    typeof verification.openFigiMapped ===
    "boolean"
  ) {
    rows.push([
      "OpenFIGI",
      verification.openFigiMapped
        ? "Mapped"
        : "Not mapped"
    ]);
  }

  if (
    typeof verification.webVerified ===
    "boolean"
  ) {
    rows.push([
      "Web verification",
      verification.webVerified
        ? "Verified"
        : "Not verified"
    ]);
  }

  if (instrument?.name) {
    rows.push([
      "Instrument",
      instrument.name
    ]);
  }

  if (instrument?.securityType) {
    rows.push([
      "Security type",
      instrument.securityType
    ]);
  }

  if (instrument?.marketSector) {
    rows.push([
      "Market sector",
      instrument.marketSector
    ]);
  }

  if (instrument?.figi) {
    rows.push([
      "FIGI",
      instrument.figi
    ]);
  }

  if (rows.length === 0) {
    return "";
  }

  return `
    <div class="verification-block">
      <strong>VERIFICATION</strong>

      <dl>
        ${rows
          .map(
            ([label, value]) => `
              <div class="verification-row">
                <dt>${escapeHTML(label)}</dt>
                <dd>${escapeHTML(
                  safeText(value, "Not available.")
                )}</dd>
              </div>
            `
          )
          .join("")}
      </dl>
    </div>
  `;
}

function buildSourcesBlock(data) {
  const sources = normalizeSources(
    data?.sources
  );

  if (sources.length === 0) {
    return "";
  }

  return `
    <div class="sources-block">
      <strong>SOURCES</strong>

      <ul>
        ${sources
          .map(
            source => `
              <li>
                <a
                  href="${escapeHTML(source.url)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ${escapeHTML(source.title)}
                </a>
              </li>
            `
          )
          .join("")}
      </ul>
    </div>
  `;
}

function buildOptionalList(
  title,
  items
) {
  if (!Array.isArray(items)) {
    return "";
  }

  const cleanedItems = items
    .map(item => safeText(item, ""))
    .filter(Boolean)
    .slice(0, 8);

  if (cleanedItems.length === 0) {
    return "";
  }

  return `
    <details class="supporting-details">
      <summary>${escapeHTML(title)}</summary>

      <ul>
        ${cleanedItems
          .map(
            item => `
              <li>${escapeHTML(item)}</li>
            `
          )
          .join("")}
      </ul>
    </details>
  `;
}

function addAssistantMessage(data) {
  if (!messages) {
    return;
  }

  const answer = safeText(
    data?.answer,
    "No answer was returned."
  );

  const disclaimer = safeText(
    data?.disclaimer,
    "Educational financial information only. Not individualized investment advice."
  );

  messages.insertAdjacentHTML(
    "beforeend",
    `
      <article class="message assistant-message">
        <div
          class="assistant-avatar"
          aria-hidden="true"
        >
          AI
        </div>

        <div class="message-bubble">
          <span class="message-speaker">
            BONDSTATS AI
          </span>

          <p class="assistant-answer">
            ${escapeHTML(answer)}
          </p>

          <div class="analysis-grid">
            ${buildAnalysisBlocks(data)}
          </div>

          ${buildVerificationBlock(data)}

          ${buildSourcesBlock(data)}

          <div class="supporting-information">
            ${buildOptionalList(
              "Assumptions",
              data?.assumptions
            )}

            ${buildOptionalList(
              "Facts used",
              data?.factsUsed
            )}

            ${buildOptionalList(
              "Unknowns",
              data?.unknowns
            )}
          </div>

          <p class="disclaimer">
            ${escapeHTML(disclaimer)}
          </p>
        </div>
      </article>
    `
  );

  scrollToBottom();
}

function addErrorMessage(error) {
  if (!messages) {
    return;
  }

  const detail =
    error instanceof Error
      ? error.message
      : String(error || "");

  messages.insertAdjacentHTML(
    "beforeend",
    `
      <article class="message assistant-message error-message">
        <div
          class="assistant-avatar"
          aria-hidden="true"
        >
          AI
        </div>

        <div class="message-bubble">
          <span class="message-speaker">
            ANALYSIS ERROR
          </span>

          <p>
            ${escapeHTML(
              detail ||
              "The analysis engine could not respond."
            )}
          </p>
        </div>
      </article>
    `
  );

  scrollToBottom();
}

/* =========================================================
   Supabase request
========================================================= */

async function askBondStatsAI(message) {
  let response;

  try {
    response = await fetch(
      SUPABASE_FUNCTION_URL,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },

        body: JSON.stringify({
          message,
          history: conversationHistory
        })
      }
    );
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Network request failed: ${error.message}`
        : "Network request failed."
    );
  }

  const rawText = await response.text();

  let data;

  try {
    data = rawText
      ? JSON.parse(rawText)
      : {};
  } catch {
    throw new Error(
      `Supabase returned invalid JSON: ${rawText.slice(
        0,
        200
      )}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      data?.error ||
      `Supabase request failed with status ${response.status}.`
    );
  }

  if (
    !data ||
    typeof data !== "object"
  ) {
    throw new Error(
      "Supabase returned an invalid response object."
    );
  }

  if (
    typeof data.answer !== "string" ||
    !data.answer.trim()
  ) {
    throw new Error(
      "Supabase responded successfully, but no answer was included."
    );
  }

  return data;
}

/* =========================================================
   Submit and session handling
========================================================= */

async function submitMessage() {
  if (busy || !promptInput) {
    return;
  }

  const message =
    promptInput.value.trim();

  if (!message) {
    promptInput.focus();
    return;
  }

  addUserMessage(message);
  addToHistory("user", message);

  promptInput.value = "";
  resizeInput();
  setBusy(true);

  try {
    const data = await askBondStatsAI(
      message
    );

    addAssistantMessage(data);
    addToHistory(
      "assistant",
      data.answer
    );
  } catch (error) {
    console.error(
      "BondStats frontend error:",
      error
    );

    addErrorMessage(error);
  } finally {
    setBusy(false);

    if (promptInput) {
      promptInput.focus();
    }
  }
}

function clearSession() {
  conversationHistory = [];

  if (messages) {
    /*
     * Retain the first welcome message if it is already
     * part of the HTML.
     */
    const allMessages = [
      ...messages.querySelectorAll(
        ".message"
      )
    ];

    allMessages
      .slice(1)
      .forEach(message => message.remove());
  }

  if (promptInput) {
    promptInput.value = "";
    resizeInput();
    promptInput.focus();
  }

  setEngineStatus("Ready");
  scrollToBottom();
}

/* =========================================================
   Event listeners
========================================================= */

if (form) {
  form.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      submitMessage();
    }
  );
}

if (promptInput) {
  promptInput.addEventListener(
    "input",
    resizeInput
  );

  promptInput.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        submitMessage();
      }
    }
  );
}

if (clearBtn) {
  clearBtn.addEventListener(
    "click",
    clearSession
  );
}

if (newSessionBtn) {
  newSessionBtn.addEventListener(
    "click",
    clearSession
  );
}

/* =========================================================
   Initial state
========================================================= */

setBusy(false);
resizeInput();
scrollToBottom();

if (promptInput) {
  promptInput.focus();
}
