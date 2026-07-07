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
  engineStatusText.textContent = text;
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
  const article = document.createElement("article");
  article.className = "message user-message";
  article.innerHTML = `
    <div class="message-bubble">
      <span class="message-speaker">YOU</span>
      <p>${escapeHTML(text)}</p>
    </div>
  `;
  messages.appendChild(article);
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

  const article = document.createElement("article");
  article.className = "message assistant-message";
  article.innerHTML = `
    <div class="assistant-avatar" aria-hidden="true">AI</div>
    <div class="message-bubble">
      <span class="message-speaker">BONDSTATS AI</span>
      <p>${escapeHTML(data.answer)}</p>

      <div class="analysis-grid">
        ${blocks.map(([title, content]) => `
          <div class="analysis-block">
            <strong>${escapeHTML(title)}</strong>
            <p>${escapeHTML(content)}</p>
          </div>
        `).join("")}
      </div>

      <p class="disclaimer">
        Educational financial information only. This is not individualized investment advice.
      </p>
    </div>
  `;
  messages.appendChild(article);
  scrollToBottom();
}

function detectTopic(question) {
  const q = question.toLowerCase();

  if (q.includes("inflation") || q.includes("cpi") || q.includes("preise")) {
    return {
      answer: "Inflation means the general price level rises over time. For markets, the key question is whether inflation is temporary, broad-based, persistent, or strong enough to change central-bank behavior.",
      why: "Inflation affects purchasing power, interest rates, real yields, bond prices, company margins, wages, currencies and long-term real returns.",
      mechanism: "Demand pressure or supply shocks can lift prices. If inflation expectations and wages adjust, central banks may tighten policy. Higher discount rates can then reprice bonds, equities and credit.",
      countercase: "Inflation can fade without lasting market damage if it is concentrated in volatile categories and does not spread into wages or expectations.",
      confidence: "High for the general framework. Current inflation interpretation requires fresh data.",
      change: "Core inflation, wage growth, energy prices, inflation expectations and central-bank guidance."
    };
  }

  if (q.includes("bond") || q.includes("bonds") || q.includes("anleihe") || q.includes("duration") || q.includes("yield")) {
    return {
      answer: "A bond is a stream of promised future cash flows. Its value depends mainly on interest rates, duration, credit risk, liquidity and maturity.",
      why: "Bonds transmit monetary policy into the financial system and strongly influence borrowing costs, portfolio risk and valuation across asset classes.",
      mechanism: "When required yields rise, future cash flows are discounted more heavily and bond prices usually fall. Longer-duration bonds are generally more sensitive to rate changes.",
      countercase: "Credit spreads, inflation-linked features, callable structures and liquidity stress can complicate the simple price-yield relationship.",
      confidence: "High for plain fixed-rate bonds. Lower for complex instruments without details.",
      change: "Yield curve movement, central-bank policy, credit spreads, issuer fundamentals and liquidity conditions."
    };
  }

  if (q.includes("central bank") || q.includes("fed") || q.includes("ecb") || q.includes("zins") || q.includes("rates")) {
    return {
      answer: "Central banks influence financial conditions through policy rates, liquidity tools, balance-sheet policy and communication. Markets often move on expectations before policy actually changes.",
      why: "Policy expectations affect bond yields, currencies, bank funding, credit creation, equity valuations and inflation expectations.",
      mechanism: "Economic data changes the expected policy path. That shifts yields and financial conditions, which then affect borrowing, spending, investment and risk appetite.",
      countercase: "Central banks do not fully control long-term yields, global liquidity, fiscal policy, credit spreads or investor positioning.",
      confidence: "High for the transmission framework. Specific policy forecasts require current data.",
      change: "Inflation, labor markets, growth data, financial stability risks and official central-bank communication."
    };
  }

  if (q.includes("yield curve") || q.includes("zinskurve")) {
    return {
      answer: "The yield curve compares interest rates across maturities. Its shape reflects expectations for future policy rates, inflation, growth and term premia.",
      why: "The curve affects banks, bond portfolios, recession interpretation, duration risk and funding conditions.",
      mechanism: "New macro information changes expectations for future short rates and risk premia. Different maturities reprice by different amounts, changing the curve shape.",
      countercase: "An inverted curve is not a mechanical recession timer. Safe-asset demand, central-bank balance sheets and term-premium shifts can distort the signal.",
      confidence: "High for the framework. Medium for conclusions from the curve alone.",
      change: "Policy guidance, inflation data, labor-market data, term-premium estimates and balance-sheet policy."
    };
  }

  if (q.includes("stock") || q.includes("stocks") || q.includes("equity") || q.includes("aktie")) {
    return {
      answer: "Stocks represent ownership claims on companies. Their value depends on expected cash flows, profitability, growth, valuation multiples and discount rates.",
      why: "Equities are often the main long-term growth engine in portfolios, but they carry drawdown, valuation and earnings risk.",
      mechanism: "If expected earnings rise or discount rates fall, equity valuations can improve. If margins weaken or rates rise, valuations may compress.",
      countercase: "A good company can still be a poor investment if the price already reflects overly optimistic expectations.",
      confidence: "High for the valuation logic. Specific stock analysis requires fresh company data.",
      change: "Earnings revisions, margins, rates, sector trends, balance-sheet strength and valuation."
    };
  }

  if (q.includes("risk") || q.includes("portfolio") || q.includes("diversification")) {
    return {
      answer: "Portfolio risk is not only volatility. It includes concentration, liquidity, currency exposure, duration, credit risk, drawdown risk and scenario sensitivity.",
      why: "Many portfolios look diversified by number of positions but are concentrated in the same macro driver or risk factor.",
      mechanism: "Assets that share the same driver can fall together during stress. Real diversification comes from different return drivers, horizons and liquidity profiles.",
      countercase: "Too much diversification can dilute conviction and make a portfolio harder to understand.",
      confidence: "High for the framework. Actual risk requires position-level data.",
      change: "Top holdings, sector exposure, cash level, bond duration, currency exposure and stress-test results."
    };
  }

  return {
    answer: `A rigorous financial answer to “${question}” should separate the direct claim, the mechanism, the risk, the countercase and the uncertainty.`,
    why: "Financial reasoning improves when it explains who is affected, through which channel and over what time horizon.",
    mechanism: "New information changes expectations. Expectations change required returns, cash-flow assumptions or risk appetite. Prices and financing conditions then adjust.",
    countercase: "The same fact can lead to different conclusions if the time horizon, liquidity, policy reaction or market positioning changes.",
    confidence: "Medium. The question needs more detail for a stronger answer.",
    change: "Specify market, country, asset class, time horizon and whether you want a macro, valuation, policy or risk perspective."
  };
}

async function submitMessage() {
  if (busy) return;

  const question = promptInput.value.trim();
  if (!question) return;

  addUserMessage(question);
  promptInput.value = "";
  resizeInput();

  setBusy(true);
  setStatus("Building Analysis");

  await new Promise(resolve => setTimeout(resolve, 650));

  addAssistantMessage(detectTopic(question));

  setBusy(false);
  setStatus("Offline Engine Online");
  promptInput.focus();
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
setStatus("Offline Engine Online");
promptInput.focus();
