const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const AI_MODEL = Deno.env.get("AI_MODEL") || "gpt-4.1-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function cleanText(value: unknown, max = 6000) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, max);
}

function systemPrompt() {
  return `
You are BondStats AI, a professional financial intelligence assistant.

Rules:
- Give original, copyright-safe answers.
- Do not copy long text from sources.
- Do not invent citations.
- Do not provide personalized investment advice.
- Separate answer, importance, mechanism, countercase, confidence and what could change the view.
- If current data is required, say that fresh data should be checked.

Return only valid JSON:
{
  "answer": "...",
  "why": "...",
  "mechanism": "...",
  "countercase": "...",
  "confidence": "...",
  "change": "...",
  "disclaimer": "..."
}
`;
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!OPENAI_API_KEY) {
      return Response.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500, headers: corsHeaders }
      );
    }

    const body = await request.json().catch(() => ({}));
    const message = cleanText(body.message);

    if (!message) {
      return Response.json(
        { error: "Please enter a financial question." },
        { status: 400, headers: corsHeaders }
      );
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: AI_MODEL,
        input: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: message }
        ],
        text: {
          format: {
            type: "json_object"
          }
        }
      })
    });

    const data = await openaiResponse.json().catch(() => ({}));

    if (!openaiResponse.ok) {
      return Response.json(
        {
          error:
            data?.error?.message ||
            "The AI request failed."
        },
        { status: 500, headers: corsHeaders }
      );
    }

    const outputText =
      data.output_text ||
      data.output?.flatMap((item: any) => item.content || [])
        ?.map((part: any) => part.text || "")
        ?.join("") ||
      "";

    if (!outputText) {
      return Response.json(
        { error: "Empty AI response." },
        { status: 500, headers: corsHeaders }
      );
    }

    const result = JSON.parse(outputText);

    return Response.json(
      {
        answer: result.answer || "",
        why: result.why || "",
        mechanism: result.mechanism || "",
        countercase: result.countercase || "",
        confidence: result.confidence || "",
        change: result.change || "",
        disclaimer:
          result.disclaimer ||
          "Educational financial information only. Not individualized investment advice."
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      { error: "The analysis could not be completed." },
      { status: 500, headers: corsHeaders }
    );
  }
});
