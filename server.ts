import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs/promises";

// Load environment variables
dotenv.config();

const SYSTEM_PROMPT = `You simplify political texts. 
STRICT RULE: YOU MUST STAY IN THE EXACT SAME LANGUAGE AS THE INPUT. DO NOT TRANSLATE.

RULES:
1. IDENTIFY input language and LOCK output to it. (NEVER TRANSLATE).
2. USE simple words, active voice, and short sentences (one per line).
3. NO genitive, no passive voice, no jargon, no metaphors.
4. If Input is German: Follow Leichte Sprache per (DIN SPEC 33429).
5. If Input is English: Follow Easy Read standards.
6. If Input is Dutch: Follow Eenvoudig Communiceren.
7. If Input is in any other language: Follow the rules for that language. When not avaible default to A2/B1 level of that language in the CEFR
8. OUTPUT strictly valid JSON with keys: "language", "styleApplied", and "simplifiedText".`;

// Simple language detection helper
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

// Helper to resiliently extract and clean fields from LLM response (JSON or raw string)
const processModelResponse = (responseContent: string) => {
  let parsedData: any = null;
  const content = responseContent.trim();
  
  // Attempt 1: Standard JSON.parse
  try {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const potentialJson = content.substring(firstBrace, lastBrace + 1);
      parsedData = JSON.parse(potentialJson);
    } else {
      parsedData = JSON.parse(content);
    }
  } catch (e) {
    // Attempt 2: Handle unescaped newlines in the string
    try {
      // Very aggressive: find anything that looks like "simplifiedText": "..." and escape internal newlines
      // This is risky, so we better use Regex extraction as a fallback for specific fields.
      console.warn("[Parsing] Standard JSON parse failed, using regex fallback.");
    } catch (e2) {}
  }

  let simplifiedText = responseContent;
  let language = "Detected";
  let styleApplied = "Plain language guidelines applied";

  // If we have an object, extract fields
  if (parsedData && typeof parsedData === "object") {
    const findValue = (aliases: string[]) => {
      const entry = Object.entries(parsedData).find(([key]) => 
        aliases.includes(key.toLowerCase().replace(/[^a-z]/g, ""))
      );
      return entry ? entry[1] : null;
    };

    const t = findValue(["simplifiedtext", "summary", "text", "simplified", "output"]);
    const l = findValue(["language", "lang", "detectedlanguage"]);
    const s = findValue(["styleapplied", "style", "guidelines"]);

    if (t) simplifiedText = Array.isArray(t) ? t.join("\n") : String(t);
    if (l) language = String(l);
    if (s) styleApplied = String(s);
  } else {
    // Attempt 3: Regex extraction if JSON parsing failed entirely
    const extract = (aliases: string[]) => {
      for (const alias of aliases) {
        const regex = new RegExp(`"${alias}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,|\\s*})`, "i");
        const match = content.match(regex);
        if (match) return match[1];
      }
      return null;
    };

    const t = extract(["simplifiedText", "summary", "text", "simplified", "output"]);
    const l = extract(["language", "lang", "detectedLanguage"]);
    const s = extract(["styleApplied", "style", "guidelines"]);

    if (t) simplifiedText = t;
    if (l) language = l;
    if (s) styleApplied = s;
  }

  // Cleanup: if the extraction still looks like a JSON block, something is wrong
  if (simplifiedText.trim().startsWith("{") && simplifiedText.includes("simplifiedText")) {
    // Last ditch effort: if we still have the whole JSON, try to strip it manually
    simplifiedText = simplifiedText.replace(/\{[\s\S]*?"simplifiedText"\s*:\s*"/i, "").replace(/"\s*,\s*"styleApplied"[\s\S]*?\}$/i, "").replace(/"\s*\}$/, "");
  }

  return { simplifiedText, language, styleApplied };
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Endpoint to discover available models
  app.get("/api/models", async (req, res) => {
    const apiProvider = (process.env.LLM_API_PROVIDER || "gemini").toLowerCase();
    const customUrl = process.env.LLM_API_URL;
    const modelOverride = process.env.LLM_MODEL_NAME_OVERRIDE;
    
    let models: any[] = [];
    
    if (apiProvider === "openai" && customUrl) {
      try {
        let baseUrl = customUrl.split("/chat/completions")[0];
        if (!baseUrl.endsWith("/v1")) {
            baseUrl = baseUrl.replace(/\/$/, "") + "/v1";
        }
        const modelsUrl = `${baseUrl}/models`;
        
        console.log(`[Discovery] Fetching available models from: ${modelsUrl}`);
        const response = await fetch(modelsUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.data && Array.isArray(data.data)) {
            models = data.data.map((m: any) => ({ id: m.id, name: m.id }));
          }
        }
      } catch (e) {
        console.warn("Could not fetch models from custom provider:", e);
      }
    }
    
    if (models.length === 0 && modelOverride) {
      models.push({ id: modelOverride, name: `${modelOverride} (Local)` });
    }

    const defaults = [
      { id: "gemini-3.5-flash", name: "gemini-3.5-flash (Standard)" },
      { id: "gemini-3.1-flash-lite", name: "gemini-3.1-flash-lite (Responsive)" },
      { id: "gemma-2-27b-it", name: "gemma-2-27b-it (High Cap 27B)" },
      { id: "gemma-2-9b-it", name: "gemma-2-9b-it (Balanced 9B)" }
    ];

    defaults.forEach(d => {
      if (!models.find(m => m.id === d.id)) models.push(d);
    });
    
    res.json(models);
  });

  // Endpoint to fetch dynamic examples from filesystem
  app.get("/api/examples", async (req, res) => {
    const examplesDir = path.join(process.cwd(), "public", "examples");
    const examples: any[] = [];

    console.log(`[Examples] Scanning directory: ${examplesDir}`);

    try {
      // Check if directory exists
      try {
        await fs.access(examplesDir);
      } catch (e) {
        console.warn(`[Examples] Directory does not exist: ${examplesDir}`);
        return res.json([]);
      }

      const languages = await fs.readdir(examplesDir);
      console.log(`[Examples] Found ${languages.length} entries in root examples dir`);
      
      for (const lang of languages) {
        if (lang.startsWith(".")) continue; // Skip .DS_Store etc

        const langPath = path.join(examplesDir, lang);
        const stats = await fs.stat(langPath);
        
        if (stats.isDirectory()) {
          const files = await fs.readdir(langPath);
          console.log(`[Examples] Scanning ${lang}: found ${files.length} files`);

          for (const file of files) {
            if (file.endsWith(".txt")) {
              const filePath = path.join(langPath, file);
              const content = await fs.readFile(filePath, "utf-8");
              
              const lines = content.split("\n").filter(l => l.trim().length > 0);
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
      console.log(`[Examples] Returning ${examples.length} total examples`);
      res.json(examples);
    } catch (err: any) {
      console.error("[Examples] Error loading dynamic examples:", err.message);
      res.json([]);
    }
  });

  // API Route to simplify a political motion
  app.post("/api/simplify", async (req, res) => {
    try {
      const { text, model } = req.body;

      if (!text || typeof text !== "string" || text.trim() === "") {
        return res.status(400).json({
          error: "Invalid input",
          message: "Please enter a non-empty text to simplify."
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      const apiProvider = (process.env.LLM_API_PROVIDER || "gemini").toLowerCase();
      const customUrl = process.env.LLM_API_URL;
      const customKey = process.env.LLM_API_KEY || apiKey;
      
      const modelOverride = model || process.env.LLM_MODEL_NAME_OVERRIDE || "gemini-3.5-flash";

      const detectedLang = detectLanguage(text);
      const augmentedText = `[STRICT REQUIREMENT: Input text language is ${detectedLang}. Your response MUST be strictly in ${detectedLang}. DO NOT TRANSLATE TO GERMAN.]\n\nInput text: ${text}`;

      // Case 1: Custom OpenAI-compatible
      if (apiProvider === "openai" || (customUrl && !customUrl.includes("googleapis.com"))) {
        let endpoint = customUrl || "http://localhost:11434/v1";
        if (!endpoint.endsWith("/chat/completions") && !endpoint.endsWith("/chat/completions/")) {
          endpoint = endpoint.replace(/\/$/, "") + "/chat/completions";
        }

        console.log(`[Deploy Config] Routing to Custom API: ${endpoint} (Model: ${modelOverride})`);

        const requestBody = {
          model: modelOverride,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: augmentedText }
          ],
          response_format: { type: "text" },
          temperature: 0.2
        };

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (customKey && customKey !== "MY_GEMINI_API_KEY") {
          headers["Authorization"] = `Bearer ${customKey}`;
        }

        const fetchResponse = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody)
        });

        if (!fetchResponse.ok) {
          const errText = await fetchResponse.text();
          throw new Error(`Custom API returned status ${fetchResponse.status}: ${errText}`);
        }

        const json: any = await fetchResponse.json();
        const responseContent = json.choices?.[0]?.message?.content;
        if (!responseContent) throw new Error("No content returned in choices.");

        const processed = processModelResponse(responseContent);

        return res.json({
          originalText: text,
          ...processed,
          modelUsed: modelOverride
        });
      }

      // Case 2: Google Gemini
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(503).json({
          error: "API Key Missing",
          message: "The Gemini API key is missing. Please add your GEMINI_API_KEY."
        });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } }
      });

      const selectedModel = model || "gemini-3.5-flash";
      const resolveModelName = (name: string): string => {
        const lower = name.toLowerCase();
        if (lower.includes("gemma")) return "gemma-2-9b-it";
        return name;
      };

      const resolvedModel = resolveModelName(selectedModel);
      console.log(`[Deploy Config] Routing to Gemini: ${resolvedModel}`);

      let response;
      try {
        response = await ai.models.generateContent({
          model: resolvedModel,
          contents: augmentedText,
          config: {
            systemInstruction: SYSTEM_PROMPT,
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
      } catch (apiErr: any) {
        console.warn(`[Gemini] Request failed, trying fallback. Error:`, apiErr.message);
        const fallbackModels = ["gemini-1.5-flash"];
        let success = false;
        for (const fallbackModel of fallbackModels) {
          try {
            response = await ai.models.generateContent({
              model: fallbackModel,
              contents: {
                role: "user",
                parts: [{ text: augmentedText }]
              },
              config: {
                systemInstruction: SYSTEM_PROMPT,
                responseMimeType: "application/json"
              }
            });
            success = true;
            break;
          } catch (innerErr) {}
        }
        if (!success) throw new Error(`All LLM model backends failed.`);
      }

      const responseText = response.text;
      if (!responseText) throw new Error("Empty response from Gemini.");

      const processed = processModelResponse(responseText);

      return res.json({
        originalText: text,
        ...processed,
        modelUsed: resolvedModel
      });

    } catch (error: any) {
      console.error("Simplification error:", error);
      return res.status(500).json({
        error: "Simplification failed",
        message: error.message || "An unexpected error occurred."
      });
    }
  });

  // Serve static assets / Vite middle wares
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
