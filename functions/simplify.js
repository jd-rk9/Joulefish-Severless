// functions/simplify.ts

const corsHeaders = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization"
};

const detectLanguage = (text) => {
  const lower = text.toLowerCase();
  const de = (lower.match(/\b(der|die|das|und|ist|nicht|von|für)\b/g) || []).length;
  const en = (lower.match(/\b(the|and|is|not|this|with|for)\b/g) || []).length;
  const nl = (lower.match(/\b(de|het|en|is|niet|van|voor)\b/g) || []).length;

  if (de > en && de > nl) return "German";
  if (en > de && en > nl) return "English";
  if (nl > de && nl > en) return "Dutch";
  return "Detected Language";
};

const buildSystemPrompt = (mode = "plain") => {
  const isEasy = mode === "easy" || mode === "A2 / Simple" || mode === "a2";

  if (isEasy) {
    return `You simplify political and civic texts into Leichte Sprache / Easy Read (CEFR A1–A2 level).
STRICT RULE: YOU MUST STAY IN THE EXACT SAME LANGUAGE AS THE INPUT. DO NOT TRANSLATE.

RULES FOR LEICHTE SPRACHE / EASY READ:
1. IDENTIFY input language and LOCK output to it. (NEVER TRANSLATE).
2. TARGET AUDIENCE: People with learning difficulties or significant reading impairments (CEFR A1/A2).
3. SENTENCE LENGTH & STRUCTURE: Very short sentences (max 8–12 words). Exactly ONE sentence per line.
4. GRAMMAR RESTRICTIONS: NO genitive, NO passive voice, NO subjunctive.
5. STANDARDS BY LANGUAGE:
- German: DIN SPEC 33429:2025-03.
- English: Easy Read (A1/A2).
- Dutch: Makkelijk Lezen (A1/A2).
6. OUTPUT strictly valid JSON with keys: "language", "styleApplied", and "simplifiedText".`;
  }

  return `You simplify political and civic texts into Plain Language / Einfache Sprache (CEFR B1 level).
STRICT RULE: YOU MUST STAY IN THE EXACT SAME LANGUAGE AS THE INPUT. DO NOT TRANSLATE.

RULES FOR EINFACHE SPRACHE / PLAIN LANGUAGE:
1. IDENTIFY input language and LOCK output to it. (NEVER TRANSLATE).
2. TARGET AUDIENCE: Broad general public (CEFR B1 level).
3. FORMAT: Write natural, fluid paragraphs.
4. STANDARDS BY LANGUAGE:
- German: DIN 8581-1:2024-05 / DIN ISO 24495-1.
- English: ISO 24495-1 (B1).
- Dutch: Duidelijke Taal (B1).
5. OUTPUT strictly valid JSON with keys: "language", "styleApplied", and "simplifiedText".`;
};

export default async function handler(request) {
  // Handle CORS preflight options check
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const body = await request.json();
    const { text, model, mode } = body;

    if (!text || typeof text !== "string" || text.trim() === "") {
      return new Response(
        JSON.stringify({ error: "Invalid input", message: "Text cannot be empty." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Process environment variables safely
    const apiProvider = (process.env.LLM_API_PROVIDER ?? "gemini").toString().toLowerCase();
    const customUrl = process.env.LLM_API_URL;
    const apiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY;
    const selectedModel = model || process.env.LLM_MODEL_NAME_OVERRIDE || "gemini-2.5-flash";

    const isEasyMode = mode === "easy" || mode === "A2 / Simple" || mode === "a2";
    const systemPrompt = buildSystemPrompt(mode);
    const detectedLang = detectLanguage(text);
    const targetStandard = detectedLang === "German"
      ? (isEasyMode ? "Leichte Sprache (DIN SPEC 33429:2025-03)" : "Einfache Sprache (DIN ISO 24495-1 / DIN 8581-1)")
      : (isEasyMode ? "Easy Read (CEFR A2)" : "Plain Language (CEFR B1)");

    const augmentedText = `[STRICT REQUIREMENT: Input text language is ${detectedLang}. Output MUST be strictly in ${detectedLang}. DO NOT TRANSLATE. Apply ${targetStandard}.]\n\nInput text:\n${text}`;

    // Path 1: Custom OpenAI-compatible endpoint
    if (apiProvider === "openai" || customUrl) {
      let endpoint = customUrl || "https://hostyourai.com/api/v1/chat/completions";
      if (!endpoint.endsWith("/chat/completions")) {
        endpoint = endpoint.replace(/\/$/, "") + "/chat/completions";
      }

      const headers = { "Content-Type": "application/json" };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const fetchResponse = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: augmentedText }
          ],
          temperature: 0.2
        })
      });

      if (!fetchResponse.ok) {
        const errText = await fetchResponse.text();
        throw new Error(`Custom API returned status ${fetchResponse.status}: ${errText}`);
      }

      const json = await fetchResponse.json();
      const responseContent = json.choices?.[0]?.message?.content;
      if (!responseContent || typeof responseContent !== "string") {
        throw new Error("Empty or invalid response content from LLM host.");
      }

      let cleaned = responseContent.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      let parsed = {};
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { simplifiedText: cleaned };
      }

      return new Response(
        JSON.stringify({
          originalText: text,
          simplifiedText: parsed.simplifiedText || cleaned,
          language: parsed.language || detectedLang,
          styleApplied: parsed.styleApplied || targetStandard,
          modelUsed: selectedModel,
          modeUsed: isEasyMode ? "easy" : "plain"
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Path 2: Direct Gemini REST API (No heavy SDK dependencies)
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API Key Missing", message: "No LLM_API_KEY or GEMINI_API_KEY provided." }),
        { status: 503, headers: corsHeaders }
      );
    }

    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

    const geminiPayload = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          parts: [{ text: augmentedText }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            language: { type: "STRING" },
            styleApplied: { type: "STRING" },
            simplifiedText: { type: "STRING" }
          },
          required: ["language", "styleApplied", "simplifiedText"]
        }
      }
    };

    const fetchResponse = await fetch(geminiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload)
    });

    if (!fetchResponse.ok) {
      const errText = await fetchResponse.text();
      throw new Error(`Gemini API returned status ${fetchResponse.status}: ${errText}`);
    }

    const geminiJson = await fetchResponse.json();
    const rawText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let cleaned = rawText.trim();

    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let parsed = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { simplifiedText: cleaned };
    }

    return new Response(
      JSON.stringify({
        originalText: text,
        simplifiedText: parsed.simplifiedText || cleaned,
        language: parsed.language || detectedLang,
        styleApplied: parsed.styleApplied || targetStandard,
        modelUsed: selectedModel,
        modeUsed: isEasyMode ? "easy" : "plain"
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Simplification failed", message: error?.message || "An unknown error occurred." }),
      { status: 500, headers: corsHeaders }
    );
  }
}