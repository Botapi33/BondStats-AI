import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = Number(process.env.PORT || 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use(express.static(publicDir, { etag: true, maxAge: 0 }));

function cleanText(value, max = 6000) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, max);
}

function localFinancialAnswer(question) {
  const q = question.toLowerCase();

  if (q.includes("inflation")) {
    return {
      answer:
        "Inflation is a sustained increase in the general price level, which reduces purchasing power. For markets, the key question is whether inflation is temporary, broad-based, persistent, or strong enough to change central-bank behavior.",
      why:
        "Inflation affects policy rates, real yields, bond prices, currency strength, company margins, consumer behavior, and long-term real returns.",
      mechanism:
        "Demand pressure or supply shock → higher prices → inflation expectations and wages may adjust → central banks may tighten policy → discount rates and financing conditions reprice.",
      countercase:
        "Inflation can fade without major policy damage if it is concentrated in volatile categories and does not become embedded in wages or expectations.",
      confidence:
        "High for the general mechanism. Current-market conclusions require fresh data.",
      change:
        "Core inflation, wage growth, inflation expectations, productivity, energy prices, and central-bank guidance."
    };
  }

  if (q.includes("yield curve") || q.includes("zinskurve")) {
    return {
      answer:
        "The yield curve compares interest rates across maturities. Its shape reflects expectations for future short-term rates, inflation, growth, risk premia, and demand for safe assets.",
      why:
        "The curve influences bank margins, bond portfolios, duration risk, lending conditions, and macroeconomic interpretation.",
      mechanism:
        "New information changes expectations about growth, inflation, or policy → expected future rates and term premia move → different maturities reprice differently.",
      countercase:
        "An inverted yield curve is not a mechanical recession timer. Term premia, central-bank balance sheets, and safe-asset demand can distort the signal.",
      confidence:
        "High for the framework. Medium for conclusions based only on curve shape.",
      change:
        "Policy guidance, inflation data, labor-market data, term-premium estimates, and central-bank balance-sheet changes."
    };
  }

  if (q.includes("bond") || q.includes("anleihe")) {
    return {
      answer:
        "A bond is a contractual stream of future cash flows. Its value depends on the cash flows, discount rate, credit risk, liquidity, maturity, and optionality.",
      why:
        "Bonds are central to financial systems because they transmit interest-rate expectations, credit conditions, and funding costs.",
      mechanism:
        "Required yield rises → future cash flows are discounted more heavily → present value falls. Required yield falls → present value generally rises.",
      countercase:
        "The simple price-yield relationship can be complicated by credit spreads, inflation linkage, callable structures, or liquidity stress.",
      confidence:
        "High for plain fixed-rate bonds. Instrument-specific structures require separate analysis.",
      change:
        "Yield level, curve shape, credit spread, issuer fundamentals, liquidity, maturity, and embedded options."
    };
  }

  if (q.includes("central bank") || q.includes("fed") || q.includes("ecb")) {
    return {
      answer:
        "Central banks influence financial conditions through policy rates, liquidity operations, balance-sheet policy, regulation, and communication. Markets react not only to decisions, but also to expectations about future reaction functions.",
      why:
        "Central-bank policy affects discount rates, bank funding, currency values, credit creation, asset prices, and inflation expectations.",
      mechanism:
        "Macro data changes → policy expectations shift → rates, yields, currencies, and risk assets adjust → real economy effects follow through borrowing costs and confidence.",
      countercase:
        "Central banks do not fully control long-term yields, risk appetite, credit spreads, or global capital flows.",
      confidence:
        "High for the transmission framework. Specific policy forecasts require current data and source verification.",
      change:
        "Inflation trend, labor market, financial stability risks, growth data, and official policy communication."
    };
  }

  return {
    answer:
      `Your question is: “${question}”. A rigorous financial answer should separate facts, mechanism, uncertainty, and portfolio relevance. The strongest starting point is identifying the market, time horizon, transmission channel, and variables that would change the conclusion.`,
    why:
      "Financial conclusions become more useful when they specify who is affected, through which balance-sheet or pricing channel, and over what horizon.",
    mechanism:
      "New information → expectations change → required returns or cash-flow assumptions change → prices and financing conditions adjust → second-round effects may follow.",
    countercase:
      "The same observation can support different conclusions when positioning, liquidity, policy reaction, valuation, or time horizon changes.",
    confidence:
      "Medium. The question needs more specific context for a stronger conclusion.",
    change:
      "Specify country, market, asset class, horizon, and whether you want a macro, policy, valuation, or risk perspective."
  };
}

app.post("/api/chat", async (req, res) => {
  try {
    const message = cleanText(req.body?.message);

    if (!message) {
      return res.status(400).json({
        error: "Please enter a financial question."
      });
    }

    const result = localFinancialAnswer(message);

    return res.json({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...result,
      disclaimer:
        "Educational financial information only. This is not individualized investment advice."
    });
  } catch (error) {
    console.error("Chat error:", error);
    return res.status(500).json({
      error: "The analysis could not be completed."
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "BondStats AI",
    time: new Date().toISOString()
  });
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BondStats AI running on port ${PORT}`);
});
