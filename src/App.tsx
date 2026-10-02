import { useState, useEffect } from "react";
import { 
  FileText, 
  Sparkles, 
  ArrowRight, 
  Languages, 
  Copy, 
  Check, 
  Download, 
  Sliders, 
  Cpu, 
  Sun, 
  Moon, 
  ChevronRight,
  Globe
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { SimplifyResponse } from "./types";

interface ExampleItem {
  id: string;
  title: string;
  lang: string;
  label: string;
  text: string;
}

const DEFAULT_EXAMPLES: ExampleItem[] = [
  {
    id: "de-motion",
    title: "🇩🇪 DE: Klimaschutzgesetz Motion",
    lang: "German",
    label: "German Motion",
    text: "Der Bundestag möge beschließen, dass § 4 Abs. 2 des Bundes-Klimaschutzgesetzes dahingehend abgeändert wird, dass die bundesweiten Treibhausgasminderungspfade zur Erreichung der Klimaneutralität bis zum Jahr 2045 einer jährlichen, nach Sektoren getrennten Überprüfung durch den Expertenrat für Klimafragen unterzogen werden."
  },
  {
    id: "en-amendment",
    title: "🇬🇧 EN: Energy Transition Act",
    lang: "English",
    label: "English Amendment",
    text: "Notwithstanding section 12(3) of the Environmental Protection Act, all administrative authorities shall, upon enactment hereof, implement expedited permitting procedures for renewable power installations exceeding 50 megawatts capacity."
  },
  {
    id: "nl-policy",
    title: "🇳🇱 NL: Woningbouwnota",
    lang: "Dutch",
    label: "Dutch Policy",
    text: "De Raad besluit overeenkomstig het ingediende voorstel tot vaststelling van de Verordening inzake de versnelling van de woningbouw, met dien verstande dat artikel 3, tweede lid, zodanig wordt gewijzigd dat het aandeel sociale huurwoningen minimaal dertig procent bedraagt."
  }
];

const DEFAULT_MODELS = [
  { id: "gemma-4-26b-a4b-it", name: "Gemma 4 26B (Default)" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" }
];

export default function App() {
  const [inputText, setInputText] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemma-4-26b-a4b-it");
  const [availableModels] = useState<{id: string, name: string}[]>(DEFAULT_MODELS);
  const [examples] = useState<ExampleItem[]>(DEFAULT_EXAMPLES);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(1);
  const [apiResult, setApiResult] = useState<SimplifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"workspace" | "api-docs" | "apps-script">("workspace");
  const SIMPLIFY_API_URL = import.meta.env.VITE_SIMPLIFY_FUNCTION_URL || "https://simplify-joulefish.fn.deploybase.eu";

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("joulefish-darkmode");
    return saved !== null ? saved === "true" : false;
  });

  useEffect(() => {
    localStorage.setItem("joulefish-darkmode", String(isDarkMode));
  }, [isDarkMode]);

  const [copiedSheetsScript, setCopiedSheetsScript] = useState(false);

  const [latency, setLatency] = useState<string>("0.0s");
  const [tokensUsed, setTokensUsed] = useState<number>(0);

  const [ceilingText, setCeilingText] = useState("B1 / Plain");
  const [preservationToggle, setPreservationToggle] = useState(true);

  useEffect(() => {
    let timer1: NodeJS.Timeout;
    let timer2: NodeJS.Timeout;

    if (isLoading) {
      setLoadingStep(1);
      timer1 = setTimeout(() => {
        setLoadingStep(2);
      }, 1200);

      timer2 = setTimeout(() => {
        setLoadingStep(3);
      }, 2500);
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isLoading]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copySheetsCode = () => {
    navigator.clipboard.writeText(getSheetsScript());
    setCopiedSheetsScript(true);
    setTimeout(() => setCopiedSheetsScript(false), 2000);
  };

  const downloadSummaryFile = () => {
    if (!apiResult) return;
    const element = document.createElement("a");
    const file = new Blob([apiResult.simplifiedText], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `simplified_${apiResult.language?.toLowerCase() || "motion"}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleSimplify = async () => {
    if (!inputText.trim()) {
      setError("Please write or paste a political motion / amendment to simplify.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setApiResult(null);
    const start = performance.now();

    try {
      const response = await fetch(SIMPLIFY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          text: inputText,
          model: selectedModel,
          mode: ceilingText === "B1 / Plain" ? "plain" : "easy"
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || `HTTP ${response.status} error from server`);
      }

      const data: SimplifyResponse = await response.json();
      setApiResult(data);

      const inputChars = inputText.length;
      const outputChars = data.simplifiedText ? data.simplifiedText.length : 0;
      const totalEstimatedTokens = Math.ceil((inputChars + outputChars) / 3.8);
      setTokensUsed(totalEstimatedTokens);

      const end = performance.now();
      const elapsed = ((end - start) / 1000).toFixed(1);
      setLatency(`${elapsed}s`);

    } catch (err: any) {
      setError(err?.message || "An error occurred while communicating with the simplification service.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadExample = (ex: ExampleItem) => {
    setInputText(ex.text);
    setError(null);
    setApiResult(null);
  };

  const clearAll = () => {
    setInputText("");
    setError(null);
    setApiResult(null);
  };

  const getSheetsScript = () => {
    return `/** Custom Google Sheets Function */
function JOULEFISH_SIMPLIFY(text) {
  if (!text) return "";
  var url = "${SIMPLIFY_API_URL}";
  var payload = { text: text, mode: "plain" };
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  try {
    var response = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(response.getContentText());
    if (response.getResponseCode() === 200 && json.simplifiedText) {
      return json.simplifiedText;
    } else {
      return "Error: " + (json.message || json.error || "Failed with code " + response.getResponseCode());
    }
  } catch (err) {
    return "Error: " + err.toString();
  }
}`;
  };

  return (
    <div className={`min-h-screen font-sans flex flex-col antialiased transition-colors duration-300 ${
      isDarkMode ? "bg-[#111318] text-slate-100" : "bg-[#F8F9FE] text-slate-800"
    }`}>
      {/* Top Header Bar */}
      <header className={`h-16 flex items-center justify-between px-6 md:px-8 shrink-0 sticky top-0 z-30 transition-shadow duration-300 ${
        isDarkMode 
          ? "bg-[#1A1C22] border-b border-slate-800/80 shadow-[0_1px_3px_rgba(0,0,0,0.4)]" 
          : "bg-white border-b border-indigo-50 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
      }`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4">
            <div className={`p-2 rounded-xl transition-colors duration-200 ${
              isDarkMode ? "bg-indigo-600/20 text-indigo-400" : "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
            }`}>
              <img src="/joulefish-logo.svg" alt="Joulefish Logo" className="w-8 h-8" />
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-0 md:gap-2">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
                Joulefish
              </h1>
              <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full tracking-wider self-start md:self-auto ${
                isDarkMode ? "bg-[#2D3038] text-indigo-300" : "bg-indigo-50 text-indigo-700"
              }`}>
                Democratising language through AI
              </span>
            </div>
          </div>
        </div>

        {/* Tab Selection Segments */}
        <div className="flex items-center gap-3 md:gap-5">
          <div className={`flex items-center p-1 rounded-full border text-xs gap-1 ${
            isDarkMode ? "bg-[#101216] border-slate-800" : "bg-indigo-50/70 border-indigo-100/60"
          }`}>
            <button
              onClick={() => setActiveTab("workspace")}
              className={`px-4 py-1.8 font-medium rounded-full transition-all duration-300 cursor-pointer ${
                activeTab === "workspace"
                  ? (isDarkMode ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/40" : "bg-indigo-600 text-white shadow-sm shadow-indigo-100")
                  : (isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-800")
              }`}
            >
              Workspace
            </button>
            <button
              onClick={() => setActiveTab("api-docs")}
              className={`px-4 py-1.8 font-medium rounded-full transition-all duration-300 cursor-pointer ${
                activeTab === "api-docs"
                  ? (isDarkMode ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/40" : "bg-indigo-600 text-white shadow-sm shadow-indigo-100")
                  : (isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-800")
              }`}
            >
              API Reference
            </button>
            <button
              onClick={() => setActiveTab("apps-script")}
              className={`px-4 py-1.8 font-medium rounded-full transition-all duration-300 cursor-pointer flex items-center gap-1 ${
                activeTab === "apps-script"
                  ? (isDarkMode ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/40" : "bg-indigo-600 text-white shadow-sm shadow-indigo-100")
                  : (isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-800")
              }`}
            >
              <Cpu className="w-3 h-3" />
              Apps Script
            </button>
          </div>

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all cursor-pointer hover:scale-105 ${
              isDarkMode 
                ? "bg-[#23252C] border-slate-800 text-amber-300 hover:bg-[#2D3039]" 
                : "bg-indigo-50 border-indigo-100 text-indigo-900 hover:bg-indigo-100/50"
            }`}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Navigation Bar */}
        {activeTab === "workspace" && (
          <aside className={`w-full lg:w-76 p-6 flex flex-col gap-6 shrink-0 border-r transition-colors duration-300 ${
            isDarkMode ? "bg-[#181A20] border-slate-800/80" : "bg-slate-50/60 border-indigo-50/80"
          }`}>
            <div className="flex flex-col gap-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Selected LLM Engine
              </label>
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className={`w-full text-xs font-semibold border rounded-full px-4 py-2.5 cursor-pointer appearance-none transition-colors duration-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 ${
                    isDarkMode ? "bg-[#21232B] border-slate-700 text-slate-100" : "bg-white border-slate-300 text-slate-700"
                  }`}
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
                  <ChevronRight className="w-4 h-4 transform rotate-90" />
                </div>
              </div>

              <button
                onClick={handleSimplify}
                disabled={isLoading || !inputText.trim()}
                className={`w-full py-3 rounded-full font-bold text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                  isLoading || !inputText.trim()
                    ? (isDarkMode ? "bg-slate-800/40 text-slate-500 shadow-none cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none")
                    : "bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 shadow-indigo-900/10"
                }`}
              >
                {isLoading ? "Running Pipeline..." : "Execute Summary"}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className={`border-t ${isDarkMode ? "border-slate-800/80" : "border-indigo-100/50"}`} />

            <div>
              <label className={`text-[11px] font-bold uppercase tracking-widest mb-4 flex items-center gap-1.5 ${
                isDarkMode ? "text-slate-400" : "text-slate-500"
              }`}>
                <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                System Parameters
              </label>
              
              <div className="space-y-4">
                <div className={`p-3 rounded-2xl border ${
                  isDarkMode ? "bg-[#21232B] border-slate-800" : "bg-white border-indigo-50 shadow-sm"
                }`}>
                  <div className="flex justify-between mb-1.5 items-center">
                    <span className={`text-xs font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>Complexity Ceiling</span>
                    <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/30">
                      {ceilingText}
                    </span>
                  </div>
                  <div 
                    className={`h-2.5 w-full rounded-full overflow-hidden relative cursor-pointer ${isDarkMode ? "bg-slate-800" : "bg-indigo-50"}`}
                    onClick={() => setCeilingText(prev => prev === "B1 / Plain" ? "A2 / Simple" : "B1 / Plain")}
                  >
                    <div className={`h-full bg-indigo-600 rounded-full transition-all duration-300 ${ceilingText === "B1 / Plain" ? "w-2/3" : "w-1/3"}`} />
                  </div>
                </div>

                <div className={`flex items-center justify-between p-3 rounded-2xl border ${
                  isDarkMode ? "bg-[#1E2028] border-slate-800/60" : "bg-white border-indigo-50 shadow-sm"
                }`}>
                  <span className={`text-xs font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                    Intent Preservation
                  </span>
                  <button 
                    onClick={() => setPreservationToggle(!preservationToggle)}
                    className={`w-10 h-6 rounded-full relative transition-colors duration-200 ${
                      preservationToggle ? "bg-indigo-600" : (isDarkMode ? "bg-slate-800" : "bg-slate-200")
                    }`}
                  >
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all duration-200 ${
                      preservationToggle ? "translate-x-4" : "translate-x-0"
                    }`} />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className={`text-[11px] font-bold uppercase tracking-widest mb-3 block flex items-center gap-1.5 ${
                isDarkMode ? "text-slate-400" : "text-slate-500"
              }`}>
                <Globe className="w-3.5 h-3.5 text-indigo-500" />
                Language Standards
              </label>
              
              <div className="space-y-2">
                <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed transition-colors duration-200 ${
                  isDarkMode ? "bg-[#21232B] border-slate-800 text-slate-300" : "bg-white border-indigo-50 text-slate-600 shadow-sm"
                }`}>
                  <strong className="text-indigo-600 dark:text-indigo-400 font-semibold block mb-1">🇩🇪 DE (German)</strong>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                    • <strong>Einfache Sprache:</strong> DIN ISO 24495-1 &amp; DIN 8581-1 (Plain language / B1 for general public)
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    • <strong>Leichte Sprache:</strong> DIN SPEC 33429 (Easy read / A2 accessible rules)
                  </span>
                </div>
                <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed transition-colors duration-200 ${
                  isDarkMode ? "bg-[#21232B] border-slate-800 text-slate-300" : "bg-white border-indigo-50 text-slate-600 shadow-sm"
                }`}>
                  <strong className="text-indigo-600 dark:text-indigo-400 font-semibold block mb-0.5">🇬🇧 EN (English)</strong>
                  Plain Language (ISO 24495-1) and Easy Read civil accessibility standards.
                </div>
                <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed transition-colors duration-200 ${
                  isDarkMode ? "bg-[#21232B] border-slate-800 text-slate-300" : "bg-white border-indigo-50 text-slate-600 shadow-sm"
                }`}>
                  <strong className="text-indigo-600 dark:text-indigo-400 font-semibold block mb-0.5">🇳🇱 NL (Dutch)</strong>
                  Duidelijke Taal / B1 Eenvoudig Communiceren &amp; Makkelijk Lezen.
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Central Main Workspace Area */}
        <section className={`flex-1 flex flex-col p-5 md:p-8 gap-6 overflow-y-auto ${
          isDarkMode ? "bg-[#0B1220]" : "bg-slate-50/50"
        }`}>
          {activeTab === "workspace" && (
            <div className="flex flex-col gap-6 flex-1">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className={`text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${
                    isDarkMode ? "text-slate-400" : "text-slate-500"
                  }`}>
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    Source Motion / Amendment
                  </h2>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 border rounded-md text-[10px] font-mono ${
                      isDarkMode ? "bg-[#18233C] border-slate-800 text-slate-400" : "bg-white border-slate-200 text-slate-500"
                    }`}>
                      {inputText.length} chars
                    </span>
                    {inputText && (
                      <button
                        onClick={clearAll}
                        className="text-[10px] text-slate-400 hover:text-red-500 font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className={`border rounded-2xl p-5 shadow-sm flex flex-col min-h-[220px] ${
                  isDarkMode ? "bg-[#111A2E] border-slate-800" : "bg-white border-slate-200"
                }`}>
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste legislative motions, parliamentary decisions, amendment documents, or legal definitions here..."
                    className={`w-full flex-1 resize-none outline-hidden border-0 text-sm leading-relaxed font-serif ${
                      isDarkMode ? "text-slate-100 placeholder:text-slate-500 bg-[#111A2E]" : "text-slate-700 placeholder:text-slate-400 bg-white"
                    }`}
                  />

                  <div className={`mt-4 pt-3 border-t ${isDarkMode ? "border-slate-800" : "border-slate-100"}`}>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                      Quick Templates
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {examples.map((ex) => (
                        <button
                          key={ex.id}
                          onClick={() => loadExample(ex)}
                          className={`px-2.5 py-1 text-[11px] font-medium border rounded-md transition-all cursor-pointer ${
                            isDarkMode 
                              ? "bg-slate-800 border-slate-700 text-slate-300 hover:text-white" 
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {ex.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Output Section */}
              <div className="flex flex-col gap-3 flex-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Plain language output
                  </h2>
                </div>

                <div className={`flex-1 border-2 rounded-3xl overflow-hidden relative flex flex-col min-h-[250px] ${
                  isDarkMode ? "bg-[#1E2028] border-slate-800" : "bg-white border-indigo-50/80 shadow-sm"
                }`}>
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600" />

                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <AnimatePresence mode="wait">
                      {isLoading ? (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex-1 flex flex-col items-center justify-center p-8 gap-4"
                        >
                          <div className="w-10 h-10 rounded-full border border-indigo-100 border-t-indigo-600 animate-spin" />
                          <div className="text-center">
                            <span className={`text-xs font-bold block ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>
                              Simplification Pipeline Active
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                              {loadingStep === 1 && "Detecting source language and context..."}
                              {loadingStep === 2 && `Applying Style Rules via ${selectedModel}...`}
                              {loadingStep === 3 && "Formatting JSON response..."}
                            </span>
                          </div>
                        </motion.div>
                      ) : error ? (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs">
                          {error}
                        </div>
                      ) : apiResult ? (
                        <motion.div
                          key="result"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col justify-between h-full gap-6"
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-4">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                                {apiResult.language}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                Standard: {apiResult.styleApplied}
                              </span>
                            </div>
                            <p className={`text-base leading-relaxed whitespace-pre-wrap ${
                              isDarkMode ? "text-slate-100" : "text-slate-800"
                            }`}>
                              {apiResult.simplifiedText}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-4 text-[11px] text-slate-400 font-mono">
                              <span>Latency: {latency}</span>
                              <span>Est. Tokens: {tokensUsed}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => copyToClipboard(apiResult.simplifiedText)}
                                className="p-2 rounded-lg border text-xs flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? "Copied" : "Copy"}
                              </button>
                              <button
                                onClick={downloadSummaryFile}
                                className="p-2 rounded-lg border text-xs flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Download
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 p-8">
                          <Languages className="w-12 h-12 mb-3 opacity-30 text-indigo-500" />
                          <p className="text-xs font-medium">
                            Select a template or paste legal text above, then click "Execute Summary" to run.
                          </p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* API Docs Tab */}
          {activeTab === "api-docs" && (
            <div className="max-w-3xl space-y-6">
              <h2 className="text-lg font-bold">Deploybase Endpoint Integration</h2>
              <div className="p-4 rounded-xl border bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto">
                <p className="text-slate-400">// Direct HTTPS Function Door (Synchronous with CORS support)</p>
                <p className="mt-2 text-indigo-400">POST {SIMPLIFY_API_URL}</p>
                <pre className="mt-2 text-emerald-400">
{JSON.stringify({
  text: "Münster, 03.02.2026\nRatsantrag...",
  mode: "plain"
}, null, 2)}
                </pre>
                <p className="mt-4 text-slate-400">// Direct Response (HTTP 200)</p>
                <pre className="mt-2 text-indigo-200">
{JSON.stringify({
  simplifiedText: "Der Rat beschließt die Maßnahme in einfacher Sprache...",
  language: "de"
}, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Apps Script Tab */}
          {activeTab === "apps-script" && (
            <div className="max-w-3xl space-y-6">
              <h2 className="text-lg font-bold">Google Workspace Scripts</h2>
              <p className="text-xs text-slate-400">
                Copy the snippet below into Extensions &gt; Apps Script inside Google Sheets to call your Deploybase serverless function directly.
              </p>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-500">Google Sheets Custom Function</h3>
                  <button onClick={copySheetsCode} className="px-3 py-1 rounded-md text-xs border flex items-center gap-1">
                    {copiedSheetsScript ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    Copy Code
                  </button>
                </div>
                <pre className="p-4 rounded-xl border bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto">
                  {getSheetsScript()}
                </pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}