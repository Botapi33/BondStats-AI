"use strict";

/*
 * BondStats AI – stable frontend
 *
 * OpenAI and OpenFIGI are called securely through Supabase.
 * Never place API keys in this file.
 */

const SUPABASE_FUNCTION_URL =
  "https://kiyuawmnmzffqlgvntbv.supabase.co/functions/v1/swift-api";

document.addEventListener("DOMContentLoaded", () => {
  /* =======================================================
     Find elements — supports several possible IDs/classes
  ======================================================= */

  const form =
    document.querySelector("#chatForm") ||
    document.querySelector("#analysisForm") ||
    document.querySelector("form");

  const promptInput =
    document.querySelector("#prompt") ||
    document.querySelector("#promptInput") ||
    document.querySelector("#question") ||
    document.querySelector("textarea");

  const messages =
    document.querySelector("#messages") ||
    document.querySelector(".messages") ||
    document.querySelector(".chat-messages");

  const sendBtn =
    document.querySelector("#sendBtn") ||
    document.querySelector("#analyzeBtn") ||
    document.querySelector('button[type="submit"]');

  const clearBtn =
    document.querySelector("#clearBtn");

  const newSessionBtn =
    document.querySelector("#newSessionBtn");

  const engineStatusText =
    document.querySelector("#engineStatusText");

  if (!promptInput) {
    console.error(
      "BondStats frontend error: no textarea/input element was found."
    );
    return;
  }

  if (!messages) {
    console.error(
      "BondStats frontend error: no messages container was found."
    );
    return;
  }

  let busy = false;
  let conversationHistory = [];

  /* =======================================================
     Helpers
  ======================================================= */

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
      // Markdown links: preserve the readable title.
      .replace(
        /\(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\)/gi,
        "$1"
      )
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi,
        "$1"
      )

      // Remove bare URLs from prose.
      .replace(
        /\s*\(?https?:\/\/[^\s)]+(?:\))?/gi,
        ""
      )

      // Remove common Markdown formatting.
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\*([^*\n]+)\*/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/```(?:json|text|javascript|typescript)?/gi, "")
      .replace(/```/g, "")

      // Normalize list signs and whitespace.
      .replace(/^\s*[-*]\s+/gm, "• ")
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
      const url = new URL(value);

      if (
        url.protocol !== "https:" &&
        url.protocol !== "http:"
      ) {
        return null;
      }

      url.searchParams.delete("utm_source");
      url.searchParams.delete("utm_medium");
      url.searchParams.delete("utm_campaign");
      url.searchParams.delete("utm_content");

      return url.toString();
    } catch {
      return null;
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

      let title = cleanMarkdown(source?.title);

      if (!title || title.toLowerCase() === "view source") {
        try {
          title = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          title = "View source";
        }
      }

      unique.set(url, {
        title,
        url
      });
    }

    return [...unique.values()].slice(0, 5);
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;

      const lastMessage = messages.lastElementChild;

      if (lastMessage) {
        lastMessage.scrollIntoView({
          behavior: "smooth",
          block: "end"
        });
      }
    });
  }

  function resizeInput() {
    promptInput.style.height = "auto";

    const nextHeight = Math.min(
      promptInput.scrollHeight,
      180
    );

    promptInput.style.height = `${nextHeight}px`;
  }

  function setStatus(text) {
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

    /*
     * Keep the input enabled while waiting so the layout
     * does not change unexpectedly. Duplicate submits are
     * prevented by the busy variable.
     */
    promptInput.setAttribute(
      "aria-busy",
      String(busy)
    );

    setStatus(
      busy
        ? "BondStats AI is typing…"
        : "Ready"
    );
  }

  function addToHistory(role, content) {
    const cleaned = cleanMarkdown(content);

    if (!cleaned) {
      return;
    }

    conversationHistory.push({
      role,
      content: cleaned.slice(0, 2500)
    });

    conversationHistory =
      conversationHistory.slice(-6);
  }

  /* =======================================================
     Typing indicator
  ======================================================= */

  function removeTypingIndicator() {
    const existing =
      document.querySelector("#bondstatsTypingMessage");

    if (existing) {
      existing.remove();
    }
  }

  function showTypingIndicator() {
    removeTypingIndicator();

    messages.insertAdjacentHTML(
      "beforeend",
      `
        <article
          id="bondstatsTypingMessage"
          class="message assistant-message typing-message"
          aria-live="polite"
        >
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

            <p class="typing-text">
              BondStats AI is typing<span class="typing-dots">...</span>
            </p>
          </div>
        </article>
      `
    );

    scrollToBottom();
  }

  /* =======================================================
     Message rendering
  ======================================================= */

  function addUserMessage(text) {
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

  function buildAnalysisBlocks(data) {
    const blocks = [
      ["WHY IT MATTERS", data?.why],
      ["MECHANISM", data?.mechanism],
      ["COUNTERCASE", data?.countercase],
      ["CONFIDENCE", data?.confidence],
      ["WHAT WOULD CHANGE THE VIEW", data?.change]
    ];

    return blocks
      .map(([title, content]) => {
        return `
          <div class="analysis-block">
            <strong>${escapeHTML(title)}</strong>
            <p>
              ${escapeHTML(
                safeText(content)
              )}
            </p>
          </div>
        `;
      })
      .join("");
  }

  function buildVerificationBlock(data) {
    const verification = data?.verification;
    const instrument = data?.instrument;

    /*
     * Do not show verification for normal questions.
     */
    if (
      !verification ||
      verification.isinDetected !== true
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
      typeof verification.checksumValid === "boolean"
    ) {
      rows.push([
        "Checksum",
        verification.checksumValid
          ? "Valid"
          : "Invalid"
      ]);
    }

    if (
      typeof verification.openFigiMapped === "boolean"
    ) {
    rows.push([
  "OpenFIGI mapping",
  verification.openFigiMapped
    ? "Successful"
    : "No match found"
]);
    }

    if (
      typeof verification.webVerified === "boolean"
    ) {
     rows.push([
  "Web verification",
  verification.webVerified
    ? "Verified"
    : verification.openFigiMapped
      ? "Not required"
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
                  <dd>
                    ${escapeHTML(
                      safeText(value)
                    )}
                  </dd>
                </div>
              `
            )
            .join("")}
        </dl>
      </div>
    `;
  }

  function buildSourcesBlock(data) {
    const sources =
      normalizeSources(data?.sources);

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

  function buildOptionalList(title, items) {
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

  function buildMarketSnapshotBlock(data) {
  const instrument =
    data?.instrument && typeof data.instrument === "object"
      ? data.instrument
      : null;

  const verification =
    data?.verification && typeof data.verification === "object"
      ? data.verification
      : null;

  /*
   * Bei allgemeinen Fragen oder unbekannten Instrumenten
   * keinen Snapshot anzeigen.
   */
  if (
    !instrument ||
    verification?.isinDetected !== true
  ) {
    return "";
  }

  const rows = [];

  function addRow(label, value) {
    const cleaned = safeText(value, "");

    if (cleaned) {
      rows.push([label, cleaned]);
    }
  }

  addRow("Instrument", instrument.name);
  addRow(
    "Security type",
    instrument.securityType ||
      instrument.securityType2
  );
  addRow("Market sector", instrument.marketSector);
  addRow("Ticker", instrument.ticker);
  addRow("Exchange", instrument.exchCode);
  addRow("FIGI", instrument.figi);
  addRow("Composite FIGI", instrument.compositeFIGI);

  if (verification?.isin) {
    addRow("ISIN", verification.isin);
  }

  const verificationLabels = [];

  if (verification?.checksumValid === true) {
    verificationLabels.push("ISIN valid");
  }

  if (verification?.openFigiMapped === true) {
    verificationLabels.push("OpenFIGI mapped");
  }

  if (verification?.webVerified === true) {
    verificationLabels.push("Web verified");
  }

  if (verificationLabels.length > 0) {
    rows.push([
      "Verification",
      verificationLabels.join(" • ")
    ]);
  }

  /*
   * Ohne verwertbare Daten keinen leeren Block erzeugen.
   */
  if (rows.length === 0) {
    return "";
  }

  return `
    <div class="market-snapshot">
      <strong>MARKET SNAPSHOT</strong>

      <dl class="market-snapshot-grid">
        ${rows
          .map(
            ([label, value]) => `
              <div class="market-snapshot-row">
                <dt>${escapeHTML(label)}</dt>
                <dd>${escapeHTML(value)}</dd>
              </div>
            `
          )
          .join("")}
      </dl>
    </div>
  `;
}

  function addAssistantMessage(data) {
    removeTypingIndicator();

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

            ${buildMarketSnapshotBlock(data)}

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
    removeTypingIndicator();

    const message =
      error instanceof Error
        ? error.message
        : String(
            error ||
            "The analysis engine could not respond."
          );

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

            <p>${escapeHTML(message)}</p>
          </div>
        </article>
      `
    );

    scrollToBottom();
  }

  /* =======================================================
     Supabase request
  ======================================================= */

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
        "Supabase returned an invalid response."
      );
    }

    if (
      typeof data.answer !== "string" ||
      !data.answer.trim()
    ) {
      throw new Error(
        "Supabase returned no answer."
      );
    }

    return data;
  }

  /* =======================================================
     Submission
  ======================================================= */

  async function submitMessage() {
    if (busy) {
      return;
    }

    const message =
      promptInput.value.trim();

    if (!message) {
      promptInput.focus();
      return;
    }

    setBusy(true);

    addUserMessage(message);
    addToHistory("user", message);

    promptInput.value = "";
    resizeInput();

    showTypingIndicator();

    try {
      const data =
        await askBondStatsAI(message);

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
      removeTypingIndicator();
      setBusy(false);
      promptInput.focus();
    }
  }

  function clearSession() {
    if (busy) {
      return;
    }

    conversationHistory = [];
    removeTypingIndicator();

    const allMessages = [
      ...messages.querySelectorAll(".message")
    ];

    /*
     * Keep only the welcome message.
     */
    allMessages
      .slice(1)
      .forEach(element => element.remove());

    promptInput.value = "";
    resizeInput();
    setStatus("Ready");
    promptInput.focus();
    scrollToBottom();
  }

  /* =======================================================
     Events
  ======================================================= */

  if (form) {
    form.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        submitMessage();
      }
    );
  }

  /*
   * Critical fix:
   * Enter submits.
   * Shift + Enter creates a new line.
   */
  promptInput.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.isComposing
      ) {
        event.preventDefault();
        event.stopPropagation();
        submitMessage();
      }
    }
  );

  promptInput.addEventListener(
    "input",
    resizeInput
  );

  if (sendBtn) {
    sendBtn.addEventListener(
      "click",
      event => {
        /*
         * When the button is already inside the form,
         * the form submit listener handles the event.
         */
        if (!form || !form.contains(sendBtn)) {
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

  /* =======================================================
     Initial state
  ======================================================= */

  setBusy(false);
  resizeInput();
  scrollToBottom();
  promptInput.focus();

  console.log(
    "BondStats frontend initialized successfully."
  );
});
