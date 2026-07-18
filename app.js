"use strict";

/*
 * BondStats AI – stable frontend
 *
 * OpenAI and OpenFIGI are called securely through Supabase.
 * Never place API keys in this file.
 */

const SUPABASE_FUNCTION_URL =
  "https://kiyuawmnmzffqlgvntbv.supabase.co/functions/v1/swift-api";

const REQUEST_TIMEOUT_MS = 45000;

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
  let activeController = null;

  /* =======================================================
     General helpers
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
      /*
       * Markdown links:
       * preserve the readable title and remove the URL.
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
       * Remove bare URLs from normal prose.
       * Source links are rendered separately.
       */
      .replace(
        /\s*\(?https?:\/\/[^\s)]+(?:\))?/gi,
        ""
      )

      /*
       * Remove common Markdown formatting.
       */
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\*([^*\n]+)\*/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(
        /```(?:json|text|javascript|typescript)?/gi,
        ""
      )
      .replace(/```/g, "")

      /*
       * Normalize lists and whitespace.
       */
      .replace(/^\s*[-*]\s+/gm, "• ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function safeText(
    value,
    fallback = "Not available."
  ) {
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

      /*
       * Remove tracking parameters.
       */
      const trackingParameters = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term"
      ];

      for (const parameter of trackingParameters) {
        url.searchParams.delete(parameter);
      }

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

      let title =
        cleanMarkdown(source?.title);

      if (
        !title ||
        title.toLowerCase() === "view source"
      ) {
        try {
          title = new URL(url)
            .hostname
            .replace(/^www\./, "");
        } catch {
          title = "View source";
        }
      }

      unique.set(url, {
        title,
        url
      });
    }

    return [...unique.values()]
      .slice(0, 5);
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messages.scrollTop =
        messages.scrollHeight;

      const lastMessage =
        messages.lastElementChild;

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
      Math.max(
        promptInput.scrollHeight,
        48
      ),
      180
    );

    promptInput.style.height =
      `${nextHeight}px`;
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
     * Keep the input enabled while waiting.
     * Duplicate requests are prevented by `busy`.
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
    const cleaned =
      cleanMarkdown(content);

    if (!cleaned) {
      return;
    }

    conversationHistory.push({
      role,
      content: cleaned.slice(0, 2500)
    });

    /*
     * Keep only the most recent messages
     * to avoid sending an oversized history.
     */
    conversationHistory =
      conversationHistory.slice(-6);
  }

  /* =======================================================
     Typing indicator
  ======================================================= */

  function removeTypingIndicator() {
    const existing =
      document.querySelector(
        "#bondstatsTypingMessage"
      );

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
              BondStats AI is typing
              <span class="typing-dots">...</span>
            </p>
          </div>
        </article>
      `
    );

    scrollToBottom();
  }

  /* =======================================================
     User message rendering
  ======================================================= */

  function addUserMessage(text) {
    messages.insertAdjacentHTML(
      "beforeend",
      `
        <article class="message user-message">
          <div class="message-bubble">
            <span class="message-speaker">
              YOU
            </span>

            <p>
              ${escapeHTML(text)}
            </p>
          </div>
        </article>
      `
    );

    scrollToBottom();
  }
    /* =======================================================
     Analysis blocks
  ======================================================= */

  function buildAnalysisBlocks(data) {
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
            <strong>
              ${escapeHTML(title)}
            </strong>

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

  /* =======================================================
     Verification block
  ======================================================= */

  function buildVerificationBlock(data) {
    const verification =
      data?.verification;

    const instrument =
      data?.instrument;

    /*
     * Do not show verification information
     * for normal questions without an ISIN.
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
        "OpenFIGI mapping",
        verification.openFigiMapped
          ? "Successful"
          : "No match found"
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
        <strong>
          VERIFICATION
        </strong>

        <dl>
          ${rows
            .map(
              ([label, value]) => `
                <div class="verification-row">
                  <dt>
                    ${escapeHTML(label)}
                  </dt>

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

  /* =======================================================
     Sources
  ======================================================= */

  function buildSourcesBlock(data) {
    const sources =
      normalizeSources(data?.sources);

    if (sources.length === 0) {
      return "";
    }

    return `
      <div class="sources-block">
        <strong>
          SOURCES
        </strong>

        <ul>
          ${sources
            .map(
              source => `
                <li>
                  <a
                    href="${escapeHTML(
                      source.url
                    )}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ${escapeHTML(
                      source.title
                    )}
                  </a>
                </li>
              `
            )
            .join("")}
        </ul>
      </div>
    `;
  }

  /* =======================================================
     Optional detail sections
  ======================================================= */

  function buildOptionalList(
    title,
    items
  ) {
    if (!Array.isArray(items)) {
      return "";
    }

    const cleanedItems = items
      .map(item =>
        safeText(item, "")
      )
      .filter(Boolean)
      .slice(0, 8);

    if (cleanedItems.length === 0) {
      return "";
    }

    return `
      <details class="supporting-details">
        <summary>
          ${escapeHTML(title)}
        </summary>

        <ul>
          ${cleanedItems
            .map(
              item => `
                <li>
                  ${escapeHTML(item)}
                </li>
              `
            )
            .join("")}
        </ul>
      </details>
    `;
  }

  /* =======================================================
     Market Snapshot
  ======================================================= */

  function buildMarketSnapshotBlock(data) {
    const instrument =
      data?.instrument &&
      typeof data.instrument === "object"
        ? data.instrument
        : null;

    const verification =
      data?.verification &&
      typeof data.verification === "object"
        ? data.verification
        : null;

    /*
     * Only show the snapshot when a real
     * instrument object and an ISIN are present.
     */
    if (
      !instrument ||
      verification?.isinDetected !== true
    ) {
      return "";
    }

    const rows = [];

    function addRow(label, value) {
      const cleaned =
        safeText(value, "");

      if (cleaned) {
        rows.push([
          label,
          cleaned
        ]);
      }
    }

    addRow(
      "Instrument",
      instrument.name
    );

    addRow(
      "Security type",
      instrument.securityType ||
        instrument.securityType2
    );

    addRow(
      "Market sector",
      instrument.marketSector
    );

    addRow(
      "Ticker",
      instrument.ticker
    );

    addRow(
      "Exchange",
      instrument.exchCode
    );

    addRow(
      "FIGI",
      instrument.figi
    );

    addRow(
      "Composite FIGI",
      instrument.compositeFIGI
    );

    if (verification?.isin) {
      addRow(
        "ISIN",
        verification.isin
      );
    }

    const verificationLabels = [];

    if (
      verification?.checksumValid === true
    ) {
      verificationLabels.push(
        "ISIN valid"
      );
    }

    if (
      verification?.openFigiMapped === true
    ) {
      verificationLabels.push(
        "OpenFIGI mapped"
      );
    }

    if (
      verification?.webVerified === true
    ) {
      verificationLabels.push(
        "Web verified"
      );
    }

    if (
      verificationLabels.length > 0
    ) {
      rows.push([
        "Verification",
        verificationLabels.join(" • ")
      ]);
    }

    if (rows.length === 0) {
      return "";
    }

    return `
      <div class="market-snapshot">
        <strong>
          MARKET SNAPSHOT
        </strong>

        <dl class="market-snapshot-grid">
          ${rows
            .map(
              ([label, value]) => `
                <div class="market-snapshot-row">
                  <dt>
                    ${escapeHTML(label)}
                  </dt>

                  <dd>
                    ${escapeHTML(value)}
                  </dd>
                </div>
              `
            )
            .join("")}
        </dl>
      </div>
    `;
  }

  /* =======================================================
     Verification Score
  ======================================================= */

  function buildVerificationScoreBlock(
    data
  ) {
    const verification =
      data?.verification &&
      typeof data.verification === "object"
        ? data.verification
        : null;

    /*
     * No score for general questions.
     */
    if (
      !verification ||
      verification.isinDetected !== true
    ) {
      return "";
    }

    let score = 0;

    const positiveSignals = [];
    const limitations = [];

    if (
      verification.checksumValid === true
    ) {
      score += 25;

      positiveSignals.push(
        "ISIN checksum valid"
      );
    } else if (
      verification.checksumValid === false
    ) {
      limitations.push(
        "ISIN checksum invalid"
      );
    } else {
      limitations.push(
        "ISIN checksum unavailable"
      );
    }

    if (
      verification.openFigiMapped === true
    ) {
      score += 40;

      positiveSignals.push(
        "OpenFIGI mapping successful"
      );
    } else {
      limitations.push(
        "No OpenFIGI mapping"
      );
    }

    if (
      verification.webVerified === true
    ) {
      score += 35;

      positiveSignals.push(
        "Independent web verification"
      );
    } else {
      limitations.push(
        "No independent web verification"
      );
    }

    if (
      verification.ambiguous === true
    ) {
      score -= 35;

      limitations.push(
        "Multiple possible instrument matches"
      );
    }

    score = Math.max(
      0,
      Math.min(100, score)
    );

    let level = "Low";

    if (score >= 80) {
      level = "High";
    } else if (score >= 50) {
      level = "Medium";
    }

    const positiveHTML =
      positiveSignals.length > 0
        ? `
          <ul
            class="
              verification-score-signals
              positive
            "
          >
            ${positiveSignals
              .map(
                signal => `
                  <li>
                    ✓ ${escapeHTML(signal)}
                  </li>
                `
              )
              .join("")}
          </ul>
        `
        : "";

    const limitationsHTML =
      limitations.length > 0
        ? `
          <ul
            class="
              verification-score-signals
              limitations
            "
          >
            ${limitations
              .map(
                limitation => `
                  <li>
                    ○ ${escapeHTML(
                      limitation
                    )}
                  </li>
                `
              )
              .join("")}
          </ul>
        `
        : "";

    return `
      <div class="verification-score">
        <div
          class="verification-score-header"
        >
          <strong>
            VERIFICATION SCORE
          </strong>

          <span
            class="verification-score-value"
          >
            ${score}/100
          </span>
        </div>

        <div
          class="verification-score-meter"
          role="meter"
          aria-label="Verification score"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${score}"
        >
          <span
            style="width:${score}%"
          ></span>
        </div>

        <p
          class="verification-score-level"
        >
          Confidence in instrument identity:
          <strong>
            ${escapeHTML(level)}
          </strong>
        </p>

        <div
          class="verification-score-details"
        >
          ${positiveHTML}
          ${limitationsHTML}
        </div>
      </div>
    `;
  }
    /* =======================================================
     Response metadata
  ======================================================= */

  function buildResponseMeta(data) {
    const createdAt =
      typeof data?.createdAt === "string"
        ? new Date(data.createdAt)
        : null;

    if (
      !createdAt ||
      Number.isNaN(createdAt.getTime())
    ) {
      return "";
    }

    const formatted = createdAt.toLocaleString(
      undefined,
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    );

    return `
      <p class="response-meta">
        Analysis completed
        ${escapeHTML(formatted)}
      </p>
    `;
  }

  /* =======================================================
     Assistant message rendering
  ======================================================= */

  /*
===========================================================
AI Insights Block
===========================================================
*/

function buildAIInsightsBlock(data) {

  const insights = Array.isArray(data?.aiInsights)
    ? data.aiInsights
        .map(item => safeText(item, ""))
        .filter(Boolean)
        .slice(0,5)
    : [];

  const followUps = Array.isArray(data?.followUpQuestions)
  ? data.followUpQuestions
      .map(item => safeText(item, ""))
      .filter(Boolean)
      .slice(0, 4)
  : [];

  if (
  insights.length === 0 &&
  followUps.length === 0
) {
  return "";
}

  return `
  <div class="ai-insights">

    ${
      insights.length > 0
        ? `
          <strong>AI INSIGHTS</strong>

          <ul>
            ${insights.map(item => `
              <li>${escapeHTML(item)}</li>
            `).join("")}
          </ul>
        `
        : ""
    }

   ${
  followUps.length > 0
    ? `
      <strong>FOLLOW-UP QUESTIONS</strong>

      <div class="follow-up-actions">
        ${followUps.map(question => `
          <button
            type="button"
            class="follow-up-question"
            data-question="${escapeHTML(question)}"
          >
            ${escapeHTML(question)}
          </button>
        `).join("")}
      </div>
    `
    : ""
}

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

    const meaningfulAnalysisParts = [
  data?.why,
  data?.mechanism,
  data?.countercase,
  data?.change
].filter(value =>
  typeof value === "string" &&
  value.trim().length >= 40 &&
  value.trim().toLowerCase() !== "not available."
);

const hasInstrument =
  data?.verification?.isinDetected === true ||
  Boolean(data?.instrument);

const hasSources =
  Array.isArray(data?.sources) &&
  data.sources.length > 0;

const hasInsights =
  Array.isArray(data?.aiInsights) &&
  data.aiInsights.length > 0;

const showPdfExport =
  hasInstrument ||
  (
    hasSources &&
    meaningfulAnalysisParts.length >= 2
  ) ||
  (
    meaningfulAnalysisParts.length >= 3 &&
    hasInsights
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

            ${
  showPdfExport
    ? `
      <button
        type="button"
        class="pdf-export-button"
        aria-label="Export this analysis as PDF"
      >
        Export PDF
      </button>
    `
    : ""
}

            <p class="assistant-answer">
              ${escapeHTML(answer)}
            </p>

            ${buildMarketSnapshotBlock(data)}

            ${buildVerificationScoreBlock(data)}

            ${buildAIInsightsBlock(data)}

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

            ${buildResponseMeta(data)}

            <p class="disclaimer">
              ${escapeHTML(disclaimer)}
            </p>
          </div>
        </article>
      `
    );

    scrollToBottom();
  }

  /* =======================================================
     Error message rendering
  ======================================================= */

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
        <article
          class="
            message
            assistant-message
            error-message
          "
        >
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
              ${escapeHTML(message)}
            </p>
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
    /*
     * Cancel any old request before starting a new one.
     */
    if (activeController) {
      activeController.abort();
    }

    activeController =
      new AbortController();

    const timeoutId =
      window.setTimeout(
        () => {
          if (activeController) {
            activeController.abort();
          }
        },
        REQUEST_TIMEOUT_MS
      );

    let response;

    try {
      response = await fetch(
        SUPABASE_FUNCTION_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Accept":
              "application/json"
          },

          body: JSON.stringify({
            message,
            history:
              conversationHistory
          }),

          signal:
            activeController.signal
        }
      );
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        throw new Error(
          "The request took too long. Please try again."
        );
      }

      throw new Error(
        error instanceof Error
          ? `Network request failed: ${error.message}`
          : "Network request failed."
      );
    } finally {
      window.clearTimeout(timeoutId);
    }

    const rawText =
      await response.text();

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
     Submit message
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

    promptInput.value = "";

    resizeInput();

    showTypingIndicator();

    try {
      const data =
        await askBondStatsAI(
          message
        );

      addToHistory(
    "user",
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
      activeController = null;

      removeTypingIndicator();

      setBusy(false);

      promptInput.focus();
    }
  }

  /* =======================================================
     Session reset
  ======================================================= */

  function clearSession() {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }

    busy = false;

    conversationHistory = [];

    removeTypingIndicator();

    const allMessages = [
      ...messages.querySelectorAll(
        ".message"
      )
    ];

    /*
     * Keep the first welcome message.
     */
    allMessages
      .slice(1)
      .forEach(element => {
        element.remove();
      });

    promptInput.value = "";

    resizeInput();

    setStatus("Ready");

    promptInput.focus();

    scrollToBottom();
  }
    /* =======================================================
     Events
  ======================================================= */

  function exportMessageAsPDF(messageElement) {
  if (!messageElement) {
    return;
  }

  const printableContent =
    messageElement.cloneNode(true);

  printableContent
    .querySelectorAll(
      ".pdf-export-button, .follow-up-actions"
    )
    .forEach(element => {
      element.remove();
    });

  printableContent
    .querySelectorAll("details")
    .forEach(detailsElement => {
      detailsElement.open = true;
    });

  const printWindow = window.open(
    "",
    "_blank"
  );

  if (!printWindow) {
    addErrorMessage(
      "The PDF window was blocked. Please allow pop-ups and try again."
    );
    return;
  }

  const now = new Date();

  printWindow.document.write(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>BondStats AI Analysis</title>

        <style>
          @page {
            size: A4;
            margin: 18mm;
          }

          body {
            margin: 0;
            color: #152019;
            background: #ffffff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11pt;
            line-height: 1.55;
          }

          .pdf-header {
            margin-bottom: 24px;
            padding-bottom: 14px;
            border-bottom: 2px solid #24a866;
          }

          .pdf-header h1 {
            margin: 0 0 6px;
            font-size: 22pt;
          }

          .pdf-header p {
            margin: 0;
            color: #667169;
            font-size: 9pt;
          }

          .assistant-avatar,
          .pdf-export-button,
          .follow-up-actions {
            display: none !important;
          }

          .assistant-message,
          .message-bubble {
            width: 100%;
            max-width: none;
            margin: 0;
            padding: 0;
            border: 0;
            background: transparent;
            box-shadow: none;
          }

          .message-speaker {
            display: block;
            margin-bottom: 12px;
            color: #16864e;
            font-size: 9pt;
            font-weight: 700;
            letter-spacing: 0.12em;
          }

          .assistant-answer {
            margin: 0 0 18px;
            font-size: 13pt;
            font-weight: 600;
          }

          .analysis-block,
          .market-snapshot,
          .verification-score,
          .verification-block,
          .sources-block,
          .ai-insights,
          details {
            break-inside: avoid;
            margin: 13px 0;
            padding: 12px;
            border: 1px solid #ccd8d0;
            border-radius: 8px;
            background: #f7faf8;
          }

          strong,
          summary {
            color: #16864e;
          }

          ul {
            padding-left: 20px;
          }

          a {
            color: #116c42;
            overflow-wrap: anywhere;
          }

          .response-meta,
          .disclaimer {
            margin-top: 17px;
            color: #6c766f;
            font-size: 8.5pt;
          }
        </style>
      </head>

      <body>
        <header class="pdf-header">
          <h1>BondStats AI Analysis</h1>
          <p>
            Generated ${escapeHTML(now.toLocaleString())}
          </p>
        </header>

        <main>
          ${printableContent.outerHTML}
        </main>
      </body>
    </html>
  `);

  printWindow.document.close();

  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 400);
}

  if (form) {
    form.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        submitMessage();
      }
    );
  }

  messages.addEventListener(
  "click",
  event => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const pdfButton =
      target.closest(
        ".pdf-export-button"
      );

    if (pdfButton) {
      const messageElement =
        pdfButton.closest(
          ".assistant-message"
        );

      exportMessageAsPDF(
        messageElement
      );

      return;
    }

    const followUpButton =
      target.closest(
        ".follow-up-question"
      );

    if (!followUpButton || busy) {
      return;
    }

    const question =
      followUpButton.dataset.question?.trim();

    if (!question) {
      return;
    }

    promptInput.value = question;
    resizeInput();
    submitMessage();
  }
);

    promptInput.value = question;
    resizeInput();
    submitMessage();
  }
);
  
  /*
   * Enter sends the message.
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
         * If the button already belongs to the form,
         * the form submit listener handles the request.
         */
        if (
          !form ||
          !form.contains(sendBtn)
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
