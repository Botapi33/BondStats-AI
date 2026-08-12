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

    window.BondStatsSetConversationHistory = function (messages) {
  conversationHistory =
    Array.isArray(messages)
      ? messages
          .filter(
            (m) =>
              m &&
              (m.role === "user" ||
                m.role === "assistant") &&
              typeof m.content === "string"
          )
          .map((m) => ({
            role: m.role,
            content: m.content.slice(0, 2500)
          }))
          .slice(-6)
      : [];
};

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
  function buildChartsBlock(data) {
  const charts = Array.isArray(data?.charts)
    ? data.charts.filter(chart =>
        chart &&
        typeof chart === "object" &&
        Array.isArray(chart.labels) &&
        chart.labels.length > 0 &&
        Array.isArray(chart.series) &&
        chart.series.length > 0
      )
    : [];

  if (charts.length === 0) {
    return "";
  }

  return `
    <section class="bondstats-charts">
      <div class="bondstats-charts-header">
        <span>MARKET VISUALIZATION</span>
      </div>

      ${charts.map((chart, index) => {
        const chartId =
          `bondstats-chart-${Date.now()}-${index}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        return `
          <article class="bondstats-chart-card">
            <div class="bondstats-chart-heading">
              <div>
                <strong>
                  ${escapeHTML(
                    safeText(chart.title, "Market Analysis")
                  )}
                </strong>

                ${
                  chart.subtitle
                    ? `<p>${escapeHTML(
                        safeText(chart.subtitle, "")
                      )}</p>`
                    : ""
                }
              </div>

              ${
                chart.unit
                  ? `<span class="bondstats-chart-unit">
                      ${escapeHTML(
                        safeText(chart.unit, "")
                      )}
                    </span>`
                  : ""
              }
            </div>

            <div class="bondstats-chart-canvas-wrap">
              <canvas
                id="${chartId}"
                class="bondstats-chart-canvas"
                data-chart-index="${index}"
              ></canvas>
            </div>

            ${
              chart.note
                ? `<div class="bondstats-chart-note">
                    ${escapeHTML(
                      safeText(chart.note, "")
                    )}
                  </div>`
                : ""
            }
          </article>
        `;
      }).join("")}
    </section>
  `;
}
  function renderBondStatsCharts(data) {
  if (
    !Array.isArray(data?.charts) ||
    data.charts.length === 0
  ) {
    return;
  }

  const canvases = Array.from(
    messages.querySelectorAll(".bondstats-chart-canvas")
  ).slice(-data.charts.length);

  canvases.forEach((canvas, index) => {
    const chart = data.charts[index];

    if (
      !chart ||
      !Array.isArray(chart.labels) ||
      !Array.isArray(chart.series) ||
      chart.series.length === 0
    ) {
      return;
    }

    const series = chart.series[0];

    if (!Array.isArray(series?.values)) {
      return;
    }

    const values = series.values
      .map(Number)
      .filter(Number.isFinite);

    if (values.length === 0) {
      return;
    }

    const container = canvas.parentElement;

    const width =
      Math.max(
        620,
        container?.clientWidth || 620
      );

    const height = 320;

    const ratio =
      window.devicePixelRatio || 1;

    canvas.width = width * ratio;
    canvas.height = height * ratio;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.maxWidth = "100%";

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    ctx.scale(ratio, ratio);

   const padding = {
  top: 34,
  right: 34,
  bottom: 58,
  left: 78
};

    const plotWidth =
      width -
      padding.left -
      padding.right;

    const plotHeight =
      height -
      padding.top -
      padding.bottom;

    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);

    if (minValue === maxValue) {
      minValue -= 1;
      maxValue += 1;
    }

    const crossesZero =
  minValue < 0 &&
  maxValue > 0;

if (crossesZero) {
  const maxAbs = Math.max(
    Math.abs(minValue),
    Math.abs(maxValue)
  );

  const magnitude = Math.pow(
    10,
    Math.floor(
      Math.log10(
        Math.max(maxAbs, 0.0001)
      )
    )
  );

  const normalized =
    maxAbs / magnitude;

  let niceNormalized;

  if (normalized <= 1) {
    niceNormalized = 1;
  } else if (normalized <= 2) {
    niceNormalized = 2;
  } else if (normalized <= 4) {
    niceNormalized = 4;
  } else if (normalized <= 8) {
    niceNormalized = 8;
  } else {
    niceNormalized = 10;
  }

  const axisLimit =
    niceNormalized * magnitude;

  minValue = -axisLimit;
  maxValue = axisLimit;
} else {
  const range =
    maxValue - minValue;

  minValue -= range * 0.08;
  maxValue += range * 0.08;
}

    const getX = index =>
      padding.left +
      (
        index /
        Math.max(values.length - 1, 1)
      ) * plotWidth;

    const getY = value =>
      padding.top +
      (
        1 -
        (value - minValue) /
        (maxValue - minValue)
      ) * plotHeight;

    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    /* Background */

    ctx.fillStyle =
      "rgba(4, 28, 20, 0.45)";

    ctx.fillRect(
      0,
      0,
      width,
      height
    );

    /* Horizontal grid */

ctx.lineWidth = 1;
ctx.font = "12px Arial, sans-serif";

const gridSteps = 4;

for (let step = 0; step <= gridSteps; step++) {
  const fraction = step / gridSteps;

  const value =
    maxValue -
    fraction * (maxValue - minValue);

  const y =
    padding.top +
    fraction * plotHeight;

  const is =
    Math.abs(value) <
    (maxValue - minValue) * 0.08;

  ctx.beginPath();

  ctx.strokeStyle = is
    ? "rgba(120, 255, 165, 0.30)"
    : "rgba(120, 255, 165, 0.075)";

  ctx.lineWidth = is ? 1.4 : 1;

  ctx.moveTo(
    padding.left,
    y
  );

  ctx.lineTo(
    width - padding.right,
    y
  );

  ctx.stroke();

  const roundedValue =
    Math.abs(value) < 0.05
      ? 0
      : value;

  const sign =
    roundedValue > 0
      ? "+"
      : "";

  ctx.fillStyle = is
    ? "rgba(230, 255, 238, 0.95)"
    : "rgba(220, 245, 228, 0.66)";

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  ctx.fillText(
    chart.unit?.includes("%")
      ? `${sign}${roundedValue.toFixed(1)}%`
      : `${sign}${roundedValue.toFixed(1)}`,
    padding.left - 14,
    y
  );
}

    /* Zero line */

if (
  minValue < 0 &&
  maxValue > 0
) {
  const zeroY = getY(0);

  ctx.beginPath();
  ctx.strokeStyle =
    "rgba(122, 255, 171, 0.42)";
  ctx.lineWidth = 1.5;

  ctx.moveTo(
    padding.left,
    zeroY
  );

  ctx.lineTo(
    width - padding.right,
    zeroY
  );

  ctx.stroke();

}

/* X labels */

ctx.font =
  "11px Arial, sans-serif";

ctx.fillStyle =
  "rgba(220, 245, 228, 0.68)";

ctx.textAlign = "center";
ctx.textBaseline = "top";

chart.labels.forEach(
  (label, i) => {
    const x = getX(i);

    ctx.fillText(
      String(label),
      x,
      height -
        padding.bottom +
        18
    );
  }
);

/* Axis caption */

ctx.fillStyle =
  "rgba(200, 235, 212, 0.48)";
ctx.font =
  "10px Arial, sans-serif";
ctx.textAlign = "center";

ctx.fillText(
  "Yield shock",
  padding.left +
    plotWidth / 2,
  height - 10
);

/* Line */

ctx.beginPath();

values.forEach(
  (value, i) => {
    const x = getX(i);
    const y = getY(value);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
);

ctx.strokeStyle =
  "rgba(113, 255, 159, 0.98)";

ctx.lineWidth = 2.4;

ctx.lineJoin = "round";
ctx.lineCap = "round";

ctx.shadowColor =
  "rgba(113, 255, 159, 0.24)";
ctx.shadowBlur = 7;

ctx.stroke();

ctx.shadowBlur = 0;

/* Points */

values.forEach(
  (value, i) => {
    const x = getX(i);
    const y = getY(value);

    ctx.beginPath();

    ctx.arc(
      x,
      y,
      3.6,
      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      "rgba(154, 255, 184, 1)";

    ctx.fill();

    ctx.strokeStyle =
      "rgba(7, 35, 25, 0.95)";

    ctx.lineWidth = 1.6;

    ctx.stroke();
  }
);

    /* Line */

    ctx.beginPath();

    values.forEach(
      (value, i) => {
        const x = getX(i);
        const y = getY(value);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    );

    ctx.strokeStyle =
      "#71ff9f";

    ctx.lineWidth = 3;

    ctx.shadowColor =
      "rgba(113, 255, 159, 0.45)";

    ctx.shadowBlur = 9;

    ctx.stroke();

    ctx.shadowBlur = 0;

    /* Points */

    values.forEach(
      (value, i) => {
        const x = getX(i);
        const y = getY(value);

        ctx.beginPath();

        ctx.arc(
          x,
          y,
          4,
          0,
          Math.PI * 2
        );

        ctx.fillStyle =
          "#9affb8";

        ctx.fill();

        ctx.strokeStyle =
          "rgba(5, 35, 24, 0.9)";

        ctx.lineWidth = 2;

        ctx.stroke();
      }
    );
  });
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


const showPdfExport =
  data?.verification?.isinDetected === true ||
  Boolean(data?.instrument) ||
  (
    Array.isArray(data?.sources) &&
    data.sources.length > 0
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
        onclick="window.print()"
      >
        Export PDF
      </button>

      <button
  type="button"
  class="share-analysis-button"
>
  Share
</button>
    `
    : ""
}

${/\bif\b/i.test(answer) && /\b(basis points|bps|nario|stress test)\b/i.test(answer)
  ? '<div style="margin:12px 0;padding:14px 16px;border:1px solid rgba(80,255,140,.45);border-radius:14px;background:rgba(80,255,140,.08);"><strong style="display:block;font-size:13px;letter-spacing:1.4px;">BONDSTATS DIGITAL TWIN</strong><span style="font-size:12px;opacity:.75;">Market Scenario Analysis</span></div>'
  : ''}

            <p class="assistant-answer">
              ${escapeHTML(answer)}
            </p>

            ${buildMarketSnapshotBlock(data)}

            ${buildVerificationScoreBlock(data)}

            ${buildAIInsightsBlock(data)}

            ${buildChartsBlock(data)}

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

    renderBondStatsCharts(data);
    
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
    const button =
      event.target.closest(
        ".follow-up-question"
      );

    if (!button || busy) {
      return;
    }

    const question =
      button.dataset.question?.trim();

    if (!question) {
      return;
    }

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
