import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gpt-4.1-mini";

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

function buildSystemPrompt() {
  return `
You are BondStats AI, a professional financial intelligence assistant.

Rules:
- Answer in original wording.
- Do not copy long text from sources.
- Do not invent citations.
- Do not give personalized investment advice.
- Separate facts, mechanisms, risks, countercases and uncertainty.
- If information may be current or market-sensitive, say that fresh data should be checked.
- Keep answers clear, institutional, structured and useful.

Return only JSON with:
answer, why, mechanism, countercase, confidence, change, disclaimer.
`;
}

async function callOpenAI(message) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: AI_MODEL,
      input: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: message
        }
      ],
      text: {
        format: {
          type: "json_object"
        }
      }
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || "OpenAI request failed");
  }

  const outputText =
    data.output_text ||
    data.output?.flatMap(item => item.content || [])
      ?.map(part => part.text || "")
      ?.join("") ||
    "";

  if (!outputText) {
    throw new Error("Empty AI response");
  }

  return JSON.parse(outputText);
}

function localFallback(question) {
  return {
    answer:
      `Your question is: “${question}”. A rigorous financial answer should separate facts, mechanism, uncertainty and risk.`,
    why:
      "Financial conclusions are more useful when they explain who is affected, through which channel and over what horizon.",
    mechanism:
      "New information changes expectations, required returns or cash-flow assumptions. Prices and financing conditions then adjust.",
    countercase:
      "The same observation can support different conclusions when liquidity, positioning, policy reaction or time horizon changes.",
    confidence:
      "Medium. This is the local fallback engine because no live AI key is available.",
    change:
      "Add AI_API_KEY as a server environment variable to activate the live engine.",
    disclaimer:
      "Educational financial information only. This is not individualized investment advice."
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

    const result = AI_API_KEY
      ? await callOpenAI(message)
      : localFallback(message);

    return res.json({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      answer: result.answer || "",
      why: result.why || "",
      mechanism: result.mechanism || "",
      countercase: result.countercase || "",
      confidence: result.confidence || "",
      change: result.change || "",
      disclaimer:
        result.disclaimer ||
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
    liveAI: Boolean(AI_API_KEY),
    model: AI_MODEL,
    time: new Date().toISOString()
  });
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BondStats AI running on port ${PORT}`);
});
