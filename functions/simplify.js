// functions/simplify.ts

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
- German: Strictly follow Leichte Sprache per DIN SPEC 33429:2025-03.
A proper deutsche einfache sprachen example: "Neue Regeln für die Beleuchtung in Münster

   Die Stadt Münster möchte die Beleuchtung auf Straßen und Wegen verbessern.
    
   Die Menschen sollen sich dort auch nachts sicher fühlen.
    
   Gleichzeitig möchte die Stadt Tiere und Pflanzen schützen.
    
   Was möchte die Stadt erreichen?
    
    Die Stadt möchte:
    
    dunkle Straßen und Wege besser beleuchten,
    Orte sicherer machen, an denen Menschen Angst haben,
    Tiere und Pflanzen vor zu viel Licht schützen,
    Strom sparen.
    Was soll die Stadt tun?
    
    Die Stadt soll prüfen:
    
    Wo ist es nachts zu dunkel?
    
    Wo fühlen sich Menschen unsicher?
    
    Danach soll die Stadt prüfen, wo eine bessere Beleuchtung nötig ist.
    
    An vielen Orten soll moderne Technik eingesetzt werden.
    
    Die Lampen können dann automatisch heller oder dunkler werden.
    
    Zum Beispiel:
    
    Wenn Menschen unterwegs sind, kann das Licht heller werden.
    
    Wenn niemand unterwegs ist, kann das Licht dunkler werden.
    
    In neuen Wohngebieten sollen Lampen eingebaut werden, die man heller oder dunkler stellen kann.
    
    Die Stadt soll auch prüfen, ob sie dafür Geld aus Förderprogrammen bekommen kann.
    
    Förderprogramme sind finanzielle Hilfen zum Beispiel vom Land, vom Bund oder von der Europäischen Union.
    
    Wie können die Menschen in Münster mitmachen?
    
    Auch die Menschen in Münster sollen ihre Meinung sagen können.
    
    Dafür soll es einfache digitale Möglichkeiten geben.
    
    Zum Beispiel eine Umfrage mit dem Handy.
    
    Die Menschen können der Stadt zum Beispiel sagen:
    
    Hier ist es zu dunkel.
    Hier fühle ich mich unsicher.
    Wie geht es danach weiter?
    
    Die Stadt sammelt die Hinweise.
    
    Dann prüft die Stadt die Ergebnisse.
    
    Danach schreibt die Verwaltung einen Bericht für den Stadtrat.
    
    In dem Bericht steht:
    
    Wo gibt es Probleme?
    Was kann verbessert werden?
    Was soll die Stadt als Nächstes tun?
    
    Danach entscheidet der Stadtrat über die weiteren Schritte." 
   

- English: Strictly follow Easy Read standards (A1/A2).
- Dutch: Strictly follow Makkelijk Lezen / Eenvoudige Taal (A1/A2).
- Other languages: Follow CEFR A1/A2 simple reading guidelines.
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

// Rate limiting configuration: 10 requests in a minute results in a 3600 seconds ban
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;     // 10 requests in a minute
const BAN_DURATION_SECONDS = 3600;      // 3600 seconds ban
const BAN_DURATION_MS = BAN_DURATION_SECONDS * 1000;

// In-memory rate limiting state
const bannedClients = new Map(); // clientIp -> banExpiresAt (timestamp)
const requestHistory = new Map(); // clientIp -> Array<timestamp>

function getClientIp(request) {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const ip = xForwardedFor.split(",")[0].trim();
    if (ip) return ip;
  }

  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  const clientIp = request.headers.get("client-ip") || request.headers.get("x-client-ip");
  if (clientIp) return clientIp.trim();

  const fastlyIp = request.headers.get("fastly-client-ip") || request.headers.get("true-client-ip");
  if (fastlyIp) return fastlyIp.trim();

  if (request.ip) return String(request.ip);

  return "unknown";
}

function checkRateLimit(clientIp) {
  const now = Date.now();

  // 1. Check if client is currently banned
  const banExpiresAt = bannedClients.get(clientIp);
  if (banExpiresAt) {
    if (now < banExpiresAt) {
      const remainingSeconds = Math.max(1, Math.ceil((banExpiresAt - now) / 1000));
      return {
        isBanned: true,
        remainingSeconds,
      };
    }
    // Ban has expired
    bannedClients.delete(clientIp);
  }

  // 2. Track requests in the sliding 1-minute window
  let timestamps = requestHistory.get(clientIp) || [];
  timestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  // If this request reaches or exceeds 10 requests in the 1-minute window -> ban for 3600s
  if (timestamps.length + 1 >= MAX_REQUESTS_PER_WINDOW) {
    const banUntil = now + BAN_DURATION_MS;
    bannedClients.set(clientIp, banUntil);
    requestHistory.delete(clientIp);
    return {
      isBanned: true,
      remainingSeconds: BAN_DURATION_SECONDS,
    };
  }

  // Record this request
  timestamps.push(now);
  requestHistory.set(clientIp, timestamps);

  // Periodic cleanup if store grows
  if (requestHistory.size > 10000) {
    for (const [ip, list] of requestHistory.entries()) {
      const active = list.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (active.length === 0) requestHistory.delete(ip);
      else requestHistory.set(ip, active);
    }
  }

  return { isBanned: false };
}

//* Allowed origins for CORS (prevent reflection of arbitrary origins)
/*
const ALLOWED_ORIGINS = new Set([
  "https://joulefish.sites.deploybase.eu",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
]); */

// Allowed model IDs to prevent unauthorized model enumeration and passthrough
// Feel free to add more, will be a variable in the near future
const ALLOWED_MODELS = new Set([
  "gemma-4-26b-a4b-it",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-1.5-pro",
  "gemma-2-27b-it",
  "gemma-2-9b-it",
  "hyai/loes-qwen3-14b",
  "hyai/loes-eurollm-22b",  
]);

const ALLOWED_MODES = new Set(["plain", "easy", "A2 / Simple", "a2", "B1 / Plain"]);

/* we don't need to check corsheaders now
function getCorsHeaders(request) {
  const origin = request.headers.get("origin");
  const isAllowed = origin && ALLOWED_ORIGINS.has(origin);
  const allowOrigin = isAllowed ? origin : "https://joulefish.sites.deploybase.eu";

  const headers = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With",
  };

  if (isAllowed) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}
*/

function getCorsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  // Simple "allow-all" to prevent local dev issues; restrict in production
  return {
    "Access-Control-Allow-Origin": "*", // CHANGE TO "https://your-site.com" IN PRODUCTION
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}


export default async function handler(request) {
  const corsHeaders = getCorsHeaders(request);

  // Pre-assembled headers for JSON responses
  const jsonHeaders = {
    ...corsHeaders,
    "Content-Type": "application/json",
  };

  // Handle CORS preflight check
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders, // Clean 204 response without Content-Type
    });
  }

  // Enforce rate limiting: 10 requests in a minute results in a 3600 seconds ban
  const clientIp = getClientIp(request);
  const rateLimitStatus = checkRateLimit(clientIp);

  if (rateLimitStatus.isBanned) {
    return new Response(
      JSON.stringify({
        error: "Too Many Requests",
        message: `Rate limit exceeded. You are banned for ${rateLimitStatus.remainingSeconds} seconds.`,
      }),
      {
        status: 429,
        headers: {
          ...jsonHeaders,
          "Retry-After": String(rateLimitStatus.remainingSeconds),
        },
      }
    );
  }

  if (request.method !== "POST" && request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  if (request.method === "GET") {
    return new Response(JSON.stringify({
      data: {
        status: "completed",
        response_body: "..."
      }
    }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON", message: "Malformed JSON payload in request body." }),
      { status: 400, headers: jsonHeaders }
    );
  }

  try {
    const { text, model, mode } = body;

    // Strict input type validation
    if (typeof text !== "string" || text.trim() === "") {
      return new Response(
        JSON.stringify({ error: "Invalid input", message: "Text must be a non-empty string." }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Strict mode validation
    if (mode !== undefined && mode !== null && !ALLOWED_MODES.has(mode)) {
      return new Response(
        JSON.stringify({ error: "Invalid mode", message: "Mode must be 'plain' or 'easy'." }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Model allowlisting
    const defaultModel = process.env.LLM_MODEL_NAME_OVERRIDE || "gemma-4-26b-a4b-it";
    if (defaultModel) ALLOWED_MODELS.add(defaultModel);

    if (model !== undefined && model !== null) {
      if (typeof model !== "string" || !ALLOWED_MODELS.has(model)) {
        return new Response(
          JSON.stringify({
            error: "Invalid model",
            message: `Model '${model}' is not supported or not allowed.`
          }),
          { status: 400, headers: jsonHeaders }
        );
      }
    }

    const selectedModel = model || defaultModel;

    // Process environment variables safely
    const apiProvider = (process.env.LLM_API_PROVIDER ?? "gemini").toString().toLowerCase();
    const customUrl = process.env.LLM_API_URL;
    const apiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY;

    const isEasyMode = mode === "easy" || mode === "A2 / Simple" || mode === "a2";
    const systemPrompt = buildSystemPrompt(mode);
    const detectedLang = detectLanguage(text);
    const targetStandard = detectedLang === "German"
      ? (isEasyMode ? "Leichte Sprache (DIN SPEC 33429:2025-03)" : "Einfache Sprache (DIN ISO 24495-1 / DIN 8581-1)")
      : (isEasyMode ? "Easy Read (CEFR A2)" : "Plain Language (CEFR B1)");

    const augmentedText = `[STRICT REQUIREMENT: Input text language is ${detectedLang}. Output MUST be strictly in ${detectedLang}. DO NOT TRANSLATE. Apply ${targetStandard}.]\n\nInput text:\n${text}`;

    let simplifiedResultText = "";

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
        console.error(`Upstream API status: ${fetchResponse.status}`);
        return new Response(
          JSON.stringify({ error: "Upstream error", message: "Error communicating with AI service provider." }),
          { status: 502, headers: jsonHeaders }
        );
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

      if (Array.isArray(parsed.simplifiedText)) {
        simplifiedResultText = parsed.simplifiedText.filter(Boolean).join("\n\n");
      } else if (typeof parsed.simplifiedText === "string") {
        simplifiedResultText = parsed.simplifiedText;
      } else {
        simplifiedResultText = cleaned;
      }
    } else {
      // Path 2: Direct Gemini REST API
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "API Key Missing", message: "No LLM_API_KEY or GEMINI_API_KEY provided." }),
          { status: 503, headers: jsonHeaders }
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
        console.error(`Gemini API status: ${fetchResponse.status}`);
        return new Response(
          JSON.stringify({ error: "Upstream error", message: "Error communicating with AI service provider." }),
          { status: 502, headers: jsonHeaders }
        );
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

      if (Array.isArray(parsed.simplifiedText)) {
        simplifiedResultText = parsed.simplifiedText.filter(Boolean).join("\n\n");
      } else if (typeof parsed.simplifiedText === "string") {
        simplifiedResultText = parsed.simplifiedText;
      } else {
        simplifiedResultText = cleaned;
      }
    }

    // Material shrinkage check (Finding 4): detect if output was severely truncated
    const isTruncated = text.length > 500 && simplifiedResultText.length < text.length * 0.15;

    // Server-enforced metadata: language and styleApplied are derived server-side (Finding 1 & F7)
    return new Response(
      JSON.stringify({
        originalText: text,
        simplifiedText: simplifiedResultText,
        language: detectedLang,           // Server-derived
        styleApplied: targetStandard,     // Server-derived
        modelUsed: selectedModel,
        modeUsed: isEasyMode ? "easy" : "plain",
        truncated: isTruncated
      }),
      { status: 200, headers: jsonHeaders }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Simplification failed", message: "An unexpected error occurred during simplification." }),
      { status: 500, headers: jsonHeaders }
    );
  }
}