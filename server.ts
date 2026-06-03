import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const SYSTEM_PROMPT = `You are an expert at simplifying complex political motions and amendments. Your task is to create a concise, easy-to-understand summary of the provided text while strictly maintaining its original intent and meaning.

Follow these formatting and style guidelines:
- Use simple, plain language and focus only on the key points.
- Remove jargon, legalese, and unnecessary technical details.
- CRITICAL STRUCTURE REQUIREMENT: Do not group the entire summary into one contiguous paragraph. Instead, organize the output so that every distinct legal or logical thought, provision, or point starts on a NEW LINE, and insert a strict EMPTY LINE (blank line) between each separate point. This creates a highly readable, spaced-out layout where each rule or conclusion stands independently.

CRITICAL LANGUAGE RULE (ZERO TOLERANCE FOR TRANSLATION):
- You must draft the summary in the EXACT SAME language as the input text. 
- NEVER translate. If the input is Italian, the output must be Italian. If the input is French, the output must be French. 
- Changing the language of the text is a critical failure.

Stylistic Simplification Rules:
1. If the input text is in German: Apply "Einfache Sprache" style principles based on DIN 8581-1 or ISO 24495-1.
2. If the input text is in English: Apply standard Plain Language principles.
3. If the input text is in Dutch or ANY other language: Simplify the text strictly to an A2/B1 CEFR proficiency level *within that specific language*.

Execution Steps (Follow internally before outputting):
Step 1: Identify the language of the source text.
Step 2: Apply the correct simplification style rule above.
Step 3: Before rendering the final output, verify that the output language perfectly matches the source language identified in Step 1.
Step 4: ALWAYS respond in JSON format with the following keys: "language", "styleApplied", and "simplifiedText".`;

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
    
    // If no models fetched or fallback needed, provide Gemini + Override
    if (models.length === 0) {
      if (modelOverride) {
        models.push({ id: modelOverride, name: `${modelOverride} (Local)` });
      }
    }

    // Always include standard options as fallback
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
      
      // User selection from UI takes priority, then env override, then default
      const modelOverride = model || process.env.LLM_MODEL_NAME_OVERRIDE || "gemini-3.5-flash";

      // If configuration selects OpenAI-compatible or local endpoint routing
      if (apiProvider === "openai" || (customUrl && !customUrl.includes("googleapis.com"))) {
        let endpoint = customUrl || "http://localhost:11434/v1";
        if (!endpoint.endsWith("/chat/completions") && !endpoint.endsWith("/chat/completions/")) {
          endpoint = endpoint.replace(/\/$/, "") + "/chat/completions";
        }

        console.log(`[Deploy Config] Routing LLM request to OpenAI-compatible custom endpoint: ${endpoint} (Model: ${modelOverride})`);

        const requestBody = {
          model: modelOverride,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text }
          ],
          response_format: { type: "text" },
          temperature: 0.2
        };

        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };
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
          throw new Error(`Custom LLM endpoint returned status ${fetchResponse.status}: ${errText}`);
        }

        const json: any = await fetchResponse.json();
        const responseContent = json.choices?.[0]?.message?.content;
        if (!responseContent) {
          throw new Error("No content returned in choices from custom endpoint response structure.");
        }

        let parsedData: any = null;
        try {
          const content = responseContent.trim();
          // Find first { and last }
          const firstBrace = content.indexOf('{');
          const lastBrace = content.lastIndexOf('}');
          
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const potentialJson = content.substring(firstBrace, lastBrace + 1);
            parsedData = JSON.parse(potentialJson);
          } else {
             // Try parsing the whole thing if no braces found (unlikely but possible)
             parsedData = JSON.parse(content);
          }
        } catch (jsonErr) {
          console.warn("Could not parse JSON structure from custom model response.", jsonErr);
        }

        // Resilient field extraction: look for simplifiedText, summary, text, etc. (case-insensitive)
        let simplifiedText = responseContent;
        let language = "Detected";
        let styleApplied = "Plain language custom parsing";

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

          if (t) {
            if (Array.isArray(t)) {
              simplifiedText = t.join("\n");
            } else {
              simplifiedText = String(t);
            }
          }
          if (l) language = String(l);
          if (s) styleApplied = String(s);
        }

        return res.json({
          originalText: text,
          simplifiedText,
          language,
          styleApplied,
          modelUsed: modelOverride
        });
      }

      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(503).json({
          error: "API Key Missing",
          message: "The Gemini API key is missing. Please add your GEMINI_API_KEY in the Secrets panel."
        });
      }

      // Initialize the GoogleGenAI client (lazy/safely inside handler, or re-use)
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      // Default model is gemini-3.5-flash
      const selectedModel = model || "gemini-3.5-flash";

      // Function to map theoretical/user-provided model names to actual active ones
      const resolveModelName = (name: string): string => {
        const lower = name.toLowerCase();
        if (lower.includes("gemma")) {
          return "gemma-2-9b-it";
        }
        return name;
      };

      const resolvedModel = resolveModelName(selectedModel);
      console.log(`Resolving model option: '${selectedModel}' -> '${resolvedModel}'`);

      let response;
      try {
        response = await ai.models.generateContent({
          model: resolvedModel,
          contents: text,
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
        console.warn(`Primary model request to '${resolvedModel}' failed. Retrying with production fallbacks. Error:`, apiErr.message || apiErr);
        
        // Define highly compatible fallback models to try sequentially
        const fallbackModels = ["gemini-1.5-flash"];
        let success = false;
        
        for (const fallbackModel of fallbackModels) {
          try {
            response = await ai.models.generateContent({
              model: fallbackModel,
              contents: text,
              config: {
                systemInstruction: SYSTEM_PROMPT,
                responseMimeType: "application/json"
              }
            });
            success = true;
            break;
          } catch (innerErr) {}
        }
        
        if (!success) {
          throw new Error(`All available LLM model backends returned an error.`);
        }
      }

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Empty response received from the Gemini model.");
      }

      const parsedData = JSON.parse(responseText.trim());

      return res.json({
        originalText: text,
        simplifiedText: parsedData.simplifiedText,
        language: parsedData.language,
        styleApplied: parsedData.styleApplied,
        modelUsed: resolvedModel
      });

    } catch (error: any) {
      console.error("Simplification error:", error);
      return res.status(500).json({
        error: "Simplification failed",
        message: error.message || "An unexpected error occurred during simplification."
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
