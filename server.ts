import express from "express";
import path from "path";
import fs from "fs/promises";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

// Load local .env if present (PaaS platforms pass process.env directly at runtime)
dotenv.config();

// Startup validation check
function validateEnvironment() {
  const provider = (process.env.LLM_API_PROVIDER || "gemini").toLowerCase();
  
  if (provider === "gemini" && !process.env.GEMINI_API_KEY) {
    console.warn("⚠️  [ENV WARNING] GEMINI_API_KEY is not set. Requests to Gemini will fail.");
  }
}

validateEnvironment();

const buildSystemPrompt = (mode: string = "plain"): string => {
  const isEasy = mode === "easy" || mode === "A2 / Simple" || mode === "a2";

  if (isEasy) {
    return `You simplify political and civic texts into Leichte Sprache / Easy Read (CEFR A1–A2 level).
STRICT RULE: YOU MUST STAY IN THE EXACT SAME LANGUAGE AS THE INPUT. DO NOT TRANSLATE.

RULES FOR LEICHTE SPRACHE / EASY READ:
1. IDENTIFY input language and LOCK output to it. (NEVER TRANSLATE).
2. TARGET AUDIENCE: People with learning difficulties or significant reading impairments (CEFR A1/A2).
3. SENTENCE LENGTH & STRUCTURE:
- Very short sentences (maximum 8–12 words per sentence).
- Exactly ONE sentence per line.
- Strictly ONE thought or statement per sentence.
4. GRAMMAR RESTRICTIONS:
- NO genitive (in German: replace genitive with "von", e.g. "vom Rat" instead of "des Rates").
- NO passive voice (use active verbs and direct actions).
- NO subjunctive/Konjunktiv, no convoluted subordinate clauses, no relative clauses.
5. VOCABULARY & STYLE:
- Use simple, everyday vocabulary.
- NO jargon, legalisms, or metaphors. Explain difficult terms simply.
- In German: hyphenate long compound words if helpful (e.g., "Nacht-Zeiten", "Licht-Verschmutzung").
- Use clear, explicit questions or section headers (e.g., "Worum geht es?", "Was soll getan werden?", "Warum machen wir das?").
6. STANDARDS BY LANGUAGE:
- If Input is German: Strictly follow Leichte Sprache per DIN SPEC 33429:2025-03.
- If Input is English: Strictly follow Easy Read standards (A1/A2).
- If Input is Dutch: Strictly follow Makkelijk Lezen / Eenvoudige Taal (A1/A2).
- Other languages: Follow CEFR A1/A2 simple reading guidelines.
7. OUTPUT strictly valid JSON with keys: "language", "styleApplied", and "simplifiedText".
In "styleApplied", indicate: "Leichte Sprache (DIN SPEC 33429:2025-03)".`;
  }

  return `You simplify political and civic texts into Plain Language / Einfache Sprache (CEFR B1 level).
STRICT RULE: YOU MUST STAY IN THE EXACT SAME LANGUAGE AS THE INPUT. DO NOT TRANSLATE.

RULES FOR EINFACHE SPRACHE / PLAIN LANGUAGE:
1. IDENTIFY input language and LOCK output to it. (NEVER TRANSLATE).
2. TARGET AUDIENCE: Broad general public, citizens, and voters (CEFR B1 level).
3. FORMAT & STRUCTURE:
- Write natural, fluid paragraphs with a clear, logical structure.
- Use meaningful headings and structured bulleted lists for key action items or demands.
- DO NOT force one sentence per line. Sentences should flow naturally in standard paragraphs.
4. GRAMMAR & SYNTAX:
- Clear, active, and accessible sentence construction.
- Natural grammar is encouraged: genitives and natural compound sentences ARE permitted when easy to read.
- Avoid bureaucratic legalese, officialese (Beamtendeutsch), and nested clauses (Schachtelsätze).
5. TONE:
- Maintain an adult, dignified, and professional civic tone.
- DO NOT infantilize the reader.
6. STANDARDS BY LANGUAGE:
- If Input is German: Strictly follow Einfache Sprache per DIN 8581-1:2024-05.
- If Input is English: Strictly follow Plain Language per ISO 24495-1 (B1).
- If Input is Dutch: Strictly follow Duidelijke Taal / Eenvoudig Communiceren (B1).
- Other languages: Follow CEFR B1 Plain Language guidelines.
7. OUTPUT strictly valid JSON with keys: "language", "styleApplied", and "simplifiedText".
In "styleApplied", indicate: "Einfache Sprache (DIN ISO 24495-1 / DIN 8581-1)".`;
};

const detectLanguage = (text: string): string => {
  const lower = text.toLowerCase();
  const de = (lower.match(/\b(der|die|das|und|ist|nicht|von|für)\b/g) || []).length;
  const en = (lower.match(/\b(the|and|is|not|this|with|for)\b/g) || []).length;
  const nl = (lower.match(/\b(de|het|en|is|niet|van|voor)\b/g) || []).length;

  if (de > en && de > nl) return "German";
  if (en > de && en > nl) return "English";
  if (nl > de && nl > en) return "Dutch";
  return "Detected Language";
};

// Clean and reliable JSON processing from model output
const processModelResponse = (responseContent: string) => {
  let cleaned = responseContent.trim();

  // Strip markdown code fences if wrapped by the LLM
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  try {
    const parsedData = JSON.parse(cleaned);
    return {
      simplifiedText: parsedData.simplifiedText || cleaned,
      language: parsedData.language || "Detected",
      styleApplied: parsedData.styleApplied || "Plain language guidelines applied"
    };
  } catch (err) {
    console.warn("[Parser Warning] Response was not valid JSON, returning raw output.");
    return {
      simplifiedText: cleaned,
      language: "Detected",
      styleApplied: "Plain language guidelines applied"
    };
  }
};

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Model discovery endpoint
  app.get("/api/models", async (req, res) => {
    const apiProvider = (process.env.LLM_API_PROVIDER || "gemini").toLowerCase();
    const customUrl = process.env.LLM_API_URL;
    const modelOverride = process.env.LLM_MODEL_NAME_OVERRIDE;

    let models: Array<{ id: string; name: string }> = [];

    if (apiProvider === "openai" && customUrl) {
      try {
        let baseUrl = customUrl.split("/chat/completions")[0];
        if (!baseUrl.endsWith("/v1")) {
          baseUrl = baseUrl.replace(/\/$/, "") + "/v1";
        }
        const response = await fetch(`${baseUrl}/models`);
        if (response.ok) {
          const data: any = await response.json();
          if (Array.isArray(data.data)) {
            models = data.data.map((m: any) => ({ id: m.id, name: m.id }));
          }
        }
      } catch (e) {
        console.warn("Could not fetch models from custom provider:", e);
      }
    }

    if (models.length === 0 && modelOverride) {
      models.push({ id: modelOverride, name: `${modelOverride} (Custom)` });
    }

    const defaults = [
      { id: "gemini-2.5-flash", name: "gemini-2.5-flash (Standard)" },
      { id: "gemini-2.5-pro", name: "gemini-2.5-pro (Reasoning)" },
      { id: "gemma-2-27b-it", name: "gemma-2-27b-it (High Cap 27B)" },
      { id: "gemma-2-9b-it", name: "gemma-2-9b-it (Balanced 9B)" }
    ];

    defaults.forEach((d) => {
      if (!models.find((m) => m.id === d.id)) models.push(d);
    });

    res.json(models);
  });

  // Example file reader endpoint
  app.get("/api/examples", async (req, res) => {
    const examplesDir = path.join(process.cwd(), "public", "examples");
    const examples: any[] = [];

    try {
      await fs.access(examplesDir);
      const languages = await fs.readdir(examplesDir);

      for (const lang of languages) {
        if (lang.startsWith(".")) continue;

        const langPath = path.join(examplesDir, lang);
        const stats = await fs.stat(langPath);

        if (stats.isDirectory()) {
          const files = await fs.readdir(langPath);
          for (const file of files) {
            if (file.endsWith(".txt")) {
              const filePath = path.join(langPath, file);
              const content = await fs.readFile(filePath, "utf-8");
              const lines = content.split("\n").filter((l) => l.trim().length > 0);
              const title = lines[0] ? lines[0].substring(0, 50).trim() : file.replace(".txt", "");

              examples.push({
                id: `${lang}-${file}`,
                title: title,
                lang: lang.replace("_", " "),
                label: `From ${lang} directory`,
                text: content
              });
            }
          }
        }
      }
      res.json(examples);
    } catch (err: any) {
      console.warn("[Examples] Directory inaccessible or missing:", err.message);
      res.json([]);
    }
  });

  // Main simplification pipeline
  app.post("/api/simplify", async (req, res) => {
    try {
      const { text, model, mode } = req.body;

      if (!text || typeof text !== "string" || text.trim() === "") {
        return res.status(400).json({
          error: "Invalid input",
          message: "Please enter a non-empty text to simplify."
        });
      }

      const isEasyMode = mode === "easy" || mode === "A2 / Simple" || mode === "a2";
      const systemPrompt = buildSystemPrompt(mode);

      const apiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY;
      const apiProvider = (process.env.LLM_API_PROVIDER || "gemini").toLowerCase();
      const customUrl = process.env.LLM_API_URL;
      const selectedModel = model || process.env.LLM_MODEL_NAME_OVERRIDE || "gemini-2.5-flash";

      const detectedLang = detectLanguage(text);
      const targetStandard = detectedLang === "German"
        ? (isEasyMode ? "Leichte Sprache (DIN SPEC 33429:2025-03)" : "Einfache Sprache (DIN ISO 24495-1 / DIN 8581-1)")
        : (isEasyMode ? "Easy Read (CEFR A2)" : "Plain Language (CEFR B1)");

      const augmentedText = `[STRICT REQUIREMENT: Input text language is ${detectedLang}. Output MUST be strictly in ${detectedLang}. DO NOT TRANSLATE. Apply ${targetStandard}.]\n\nInput text:\n${text}`;

      // Custom / OpenAI Compatible Provider Path
      if (apiProvider === "openai" || (customUrl && !customUrl.includes("googleapis.com"))) {
        let endpoint = customUrl || "http://localhost:11434/v1";
        if (!endpoint.endsWith("/chat/completions")) {
          endpoint = endpoint.replace(/\/$/, "") + "/chat/completions";
        }

        const headers: Record<string, string> = { "Content-Type": "application/json" };
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

        const json: any = await fetchResponse.json();
        const responseContent = json.choices?.[0]?.message?.content;
        if (!responseContent) throw new Error("Empty response from custom endpoint.");

        const processed = processModelResponse(responseContent);
        return res.json({
          originalText: text,
          ...processed,
          modelUsed: selectedModel,
          modeUsed: isEasyMode ? "easy" : "plain"
        });
      }

      // Gemini Native Path
      if (!apiKey) {
        return res.status(503).json({
          error: "API Key Missing",
          message: "The API key is missing. Please set GEMINI_API_KEY or LLM_API_KEY in your environment configuration."
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: augmentedText,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              language: { type: Type.STRING },
              styleApplied: { type: Type.STRING },
              simplifiedText: { type: Type.STRING }
            },
            required: ["language", "styleApplied", "simplifiedText"]
          }
        }
      });

      if (!response.text) throw new Error("Empty response returned from Gemini.");

      const processed = processModelResponse(response.text);

      return res.json({
        originalText: text,
        ...processed,
        modelUsed: selectedModel,
        modeUsed: isEasyMode ? "easy" : "plain"
      });

    } catch (error: any) {
      console.error("Simplification error:", error);
      return res.status(500).json({
        error: "Simplification failed",
        message: error.message || "An unexpected error occurred."
      });
    }
  });

  // Serve static UI / Middleware setup
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();