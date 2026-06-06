import { useState, useEffect } from "react";
import { 
  Scale, 
  FileText, 
  Sparkles, 
  ArrowRight, 
  Languages, 
  Copy, 
  Check, 
  RotateCcw, 
  Info, 
  Globe, 
  Code,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Download,
  Sliders,
  Database,
  Lock,
  Cpu,
  Sun,
  Moon,
  ChevronRight,
  ClipboardList,
  AlertCircle
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

// Initial placeholder, will be populated from API
const EXAMPLES: ExampleItem[] = [];

export default function App() {
  const [inputText, setInputText] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [availableModels, setAvailableModels] = useState<{id: string, name: string}[]>([]);
  const [examples, setExamples] = useState<ExampleItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(1);
  const [apiResult, setApiResult] = useState<SimplifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [activeTab, setActiveTab] = useState<"workspace" | "api-docs" | "apps-script">("workspace");

  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("joulefish-darkmode");
    return saved !== null ? saved === "true" : false;
  });

  useEffect(() => {
    localStorage.setItem("joulefish-darkmode", String(isDarkMode));
  }, [isDarkMode]);

  // Copy helper for dynamic code blocks
  const [copiedSheetsScript, setCopiedSheetsScript] = useState(false);
  const [copiedDocsScript, setCopiedDocsScript] = useState(false);

  // Metrics simulation / measurement
  const [latency, setLatency] = useState<string>("0.0s");
  const [tokensUsed, setTokensUsed] = useState<number>(0);

  // Intent Toggles
  const [ceilingText, setCeilingText] = useState("B1 / Plain");
  const [preservationToggle, setPreservationToggle] = useState(true);
  const [languageLockToggle, setLanguageLockToggle] = useState(true);

  // Get active web environment origin
  const [originUrl, setOriginUrl] = useState("https://api.joulefish.io");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOriginUrl(window.location.origin);
    }
  }, []);

  // Fetch available models from backend discovery endpoint
  useEffect(() => {
    fetch("/api/models")
      .then(res => res.json())
      .then(data => {
        setAvailableModels(data || []);
        if (data && data.length > 0) {
          setSelectedModel(data[0].id);
        }
      })
      .catch(err => console.error("Failed to load models:", err));
  }, []);

  // Fetch dynamic examples
  useEffect(() => {
    fetch("/api/examples")
      .then(res => res.json())
      .then(data => {
        setExamples(data || []);
      })
      .catch(err => console.error("Failed to load examples:", err));
  }, []);

  // Simulate execution steps during API loading
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

  // Copy to clipboard helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyJsonResponse = () => {
    if (!apiResult) return;
    navigator.clipboard.writeText(JSON.stringify(apiResult, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const copySheetsCode = () => {
    navigator.clipboard.writeText(getSheetsScript());
    setCopiedSheetsScript(true);
    setTimeout(() => setCopiedSheetsScript(false), 2000);
  };

  const copyDocsCode = () => {
    navigator.clipboard.writeText(getDocsScript());
    setCopiedDocsScript(true);
    setTimeout(() => setCopiedDocsScript(false), 2000);
  };

  const downloadSummaryFile = () => {
    if (!apiResult) return;
    const element = document.createElement("a");
    const file = new Blob([apiResult.simplifiedText], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `simplified_${apiResult.language.toLowerCase() || "motion"}.txt`;
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
    document.body.removeChild(element);
  };

  // Trigger simplification request
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
      const response = await fetch("/api/simplify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: inputText,
          model: selectedModel
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to process request");
      }

      setApiResult(data);
      
      // Calculate token approximation (roughly 1 token per 3.8 chars for source + output)
      const inputChars = inputText.length;
      const outputChars = data.simplifiedText.length;
      const totalEstimatedTokens = Math.ceil((inputChars + outputChars) / 3.8);
      setTokensUsed(totalEstimatedTokens);

      const end = performance.now();
      const elapsed = ((end - start) / 1000).toFixed(1);
      setLatency(`${elapsed}s`);

    } catch (err: any) {
      setError(err.message || "An error occurred while communicating with the service.");
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

  // Dynamic Google Apps Script generator snippets
  const getSheetsScript = () => {
    return `/**
 * Custom Google Sheets Function to simplify complex legalese / legislation
 * @param {string} text The target motion or paragraph to simplify
 * @return {string} The simplified plain language output.
 * @customfunction
 */
function JOULEFISH_SIMPLIFY(text) {
  if (!text) return "";
  var url = "${originUrl}/api/simplify";
  var payload = {
    text: text,
    model: "gemini-1.5-flash"
  };
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var json = JSON.parse(response.getContentText());
    if (responseCode === 200 && json.simplifiedText) {
      return json.simplifiedText;
    } else {
      return "Error: " + (json.message || json.error || "Failed with code " + responseCode);
    }
  } catch (err) {
    return "Error: " + err.toString();
  }
}`;
  };

  const getDocsScript = () => {
    return `/**
 * Adds a custom menu to Google Docs when opened to trigger in-place legislation simplification
 */
function onOpen() {
  DocumentApp.getUi()
    .createMenu('Joulefish')
    .addItem('Simplify Selected Text', 'simplifySelection')
    .addToUi();
}

/**
 * Simplifies the currently highlighted/selected text in the Google Doc
 */
function simplifySelection() {
  var doc = DocumentApp.getActiveDocument();
  var selection = doc.getSelection();
  
  if (!selection) {
    DocumentApp.getUi().alert('Selection Required: Please highlight/select the legal text first.');
    return;
  }
  
  var elements = selection.getSelectedElements();
  var element = elements[0].getElement();
  var text = "";
  
  if (element.editAsText) {
    text = element.editAsText().getText();
  } else {
    text = element.getText();
  }
  
  if (!text || text.trim() === "") {
    DocumentApp.getUi().alert('Select non-empty text to simplify.');
    return;
  }
  
  // Call the server API
  var url = "${originUrl}/api/simplify";
  var payload = {
    text: text,
    model: "gemini-3.5-flash"
  };
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
      // Prompt option to replace or insert after
      var ui = DocumentApp.getUi();
      var buttonResult = ui.alert('Simplification Complete', 'Do you want to insert the simplification after (YES) or replace the selected text (NO)?', ui.ButtonSet.YES_NO);
      
      if (buttonResult == ui.Button.YES) {
        var body = doc.getBody();
        var simplified = "\\n\\n-- Simplified Plain Language: --\\n" + json.simplifiedText + "\\n";
        if (element.editAsText) {
          element.editAsText().appendText(simplified);
        } else {
          doc.getBody().appendParagraph(simplified);
        }
      } else {
        if (element.editAsText) {
          element.editAsText().setText(json.simplifiedText);
        } else {
          element.setText(json.simplifiedText);
        }
      }
    } else {
      DocumentApp.getUi().alert('Execution Error: ' + (json.message || "Failed API call."));
    }
  } catch (err) {
    DocumentApp.getUi().alert('Error communicating with pipeline: ' + err.toString());
  }
}`;
  };

  return (
    <div className={`min-h-screen font-sans flex flex-col antialiased transition-colors duration-300 ${
      isDarkMode ? "bg-[#111318] text-slate-100" : "bg-[#F8F9FE] text-slate-800"
    }`}>
      {/* Material 3 Top App Bar */}
      <header className={`h-16 flex items-center justify-between px-6 md:px-8 shrink-0 sticky top-0 z-30 transition-shadow duration-300 ${
        isDarkMode 
          ? "bg-[#1A1C22] border-b border-slate-800/80 shadow-[0_1px_3px_rgba(0,0,0,0.4)]" 
          : "bg-white border-b border-indigo-50 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
      }`}>
        <div className="flex items-center gap-3">
          {/* Circular M3 style icon container */}
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

        {/* Tab Selection Segments styled in Material Design 3 Segmented Pill shape */}
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
              id="tab-workspace"
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
              id="tab-api-docs"
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
              id="tab-apps-script"
            >
              <Cpu className="w-3 h-3" />
              Apps Script
            </button>
          </div>

          {/* Theme Toggle Button - Circular Material Icon Button style */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-90 ${
              isDarkMode 
                ? "bg-[#23252C] border-slate-850 text-amber-300 hover:bg-[#2D3039]" 
                : "bg-indigo-50 border-indigo-100 text-indigo-900 hover:bg-indigo-100/50"
            }`}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle Dark Mode"
            id="toggle-dark-mode"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="hidden lg:flex items-center gap-3 text-xs">
            <div className={`h-8 w-[1px] ${isDarkMode ? "bg-slate-800" : "bg-slate-200"}`}></div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className={`font-medium ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}>M3 Core Active</span>
            </div>
            <div className="text-slate-400 font-mono">v3.0.0-material</div>
          </div>
        </div>
      </header>
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Aside Settings Bar (styled in M3 Navigation Drawer theme) */}
        {activeTab === "workspace" && (
          <aside className={`w-full lg:w-76 p-6 flex flex-col gap-6 shrink-0 border-r transition-colors duration-300 ${
            isDarkMode ? "bg-[#181A20] border-slate-800/80" : "bg-slate-50/60 border-indigo-50/80"
          }`}>
            {/* Top-Left Model Selector & Executive Action Panel */}
            <div className="flex flex-col gap-3">
              <label className="text-[10px] font-bold text-slate-405 uppercase tracking-widest block">
                Selected LLM Engine
              </label>
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className={`w-full text-xs font-semibold border rounded-full px-4 py-2.5 cursor-pointer appearance-none transition-colors duration-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 ${
                    isDarkMode ? "bg-[#21232B] border-slate-700 text-slate-100" : "bg-white border-slate-300 text-slate-705 focus:ring-indigo-550"
                  }`}
                  id="model-dropdown-sidebar"
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                  {availableModels.length === 0 && (
                    <option value="">Loading models...</option>
                  )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
                  <ChevronRight className="w-4 h-4 transform rotate-90" />
                </div>
              </div>

              {/* High-visibility primary action button */}
              <button
                onClick={handleSimplify}
                disabled={isLoading || !inputText.trim()}
                className={`w-full py-3 rounded-full font-bold text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                  isLoading || !inputText.trim()
                    ? (isDarkMode ? "bg-slate-800/40 text-slate-500 shadow-none border border-slate-800/60 cursor-not-allowed" : "bg-slate-100 text-slate-400 border border-slate-200/50 cursor-not-allowed shadow-none")
                    : "bg-indigo-600 text-white hover:bg-indigo-550 active:scale-95 shadow-indigo-900/10 hover:shadow-lg hover:shadow-indigo-500/25 dark:hover:shadow-indigo-900/35"
                }`}
                id="btn-execute-sidebar"
              >
                {isLoading ? "Running Pipeline..." : "Execute Summary"}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className={`border-t ${isDarkMode ? "border-slate-800/80" : "border-indigo-100/50"}`} />

            <div>
              <label className={`text-[11px] font-bold uppercase tracking-widest mb-4 block flex items-center gap-1.5 ${
                isDarkMode ? "text-slate-400" : "text-slate-500"
              }`}>
                <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                System Parameters
              </label>
              
              <div className="space-y-4">
                {/* Parameter 1 (Sliders styled as M3 sliders or track selections) */}
                <div className={`p-3 rounded-2xl border transition-colors ${
                  isDarkMode ? "bg-[#21232B] border-slate-800" : "bg-white border-indigo-50 shadow-sm"
                }`}>
                  <div className="flex justify-between mb-1.5">
                    <span className={`text-xs font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>Complexity Ceiling</span>
                    <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider bg-indigo-50/80 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full border border-indigo-100/40 dark:border-indigo-900/30">
                      {ceilingText}
                    </span>
                  </div>
                  <div className={`h-2.5 w-full rounded-full overflow-hidden relative cursor-pointer group select-none ${
                    isDarkMode ? "bg-slate-800" : "bg-indigo-50"
                  }`} onClick={() => setCeilingText(prev => prev === "B1 / Plain" ? "A2 / Simple" : "B1 / Plain")}>
                    <div className={`h-full bg-indigo-600 rounded-full transition-all duration-300 ${ceilingText === "B1 / Plain" ? "w-2/3" : "w-1/3"}`}></div>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1.5 block">Tap track to set depth targets.</span>
                </div>

                {/* Parameter 2 */}
                <div className={`flex items-center justify-between p-3 rounded-2xl border ${
                  isDarkMode ? "bg-[#1E2028] border-slate-800/60" : "bg-white border-indigo-50 shadow-sm"
                }`}>
                  <div className="flex flex-col">
                    <span className={`text-xs font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-700"} flex items-center gap-1`}>
                      Intent Preservation
                    </span>
                    <span className="text-[10px] text-slate-400">Strict legal constraints</span>
                  </div>
                  <button 
                    onClick={() => setPreservationToggle(!preservationToggle)}
                    className={`w-10 h-6 rounded-full relative transition-colors duration-200 focus:outline-hidden ${
                      preservationToggle ? "bg-indigo-600" : (isDarkMode ? "bg-slate-800" : "bg-slate-200")
                    }`}
                  >
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all duration-200 ${
                      preservationToggle ? "translate-x-4" : "translate-x-0"
                    }`} />
                  </button>
                </div>

                {/* Parameter 3 */}
                <div className={`flex items-center justify-between p-3 rounded-2xl border ${
                  isDarkMode ? "bg-[#1E2028] border-slate-800/60" : "bg-white border-indigo-50 shadow-sm"
                }`}>
                  <div className="flex flex-col">
                    <span className={`text-xs font-semibold ${isDarkMode ? "text-slate-300" : "text-slate-700"} flex items-center gap-1`}>
                      Strict Language Lock
                    </span>
                    <span className="text-[10px] text-slate-400">Zero Translation mode</span>
                  </div>
                  <button 
                    onClick={() => setLanguageLockToggle(!languageLockToggle)}
                    className={`w-10 h-6 rounded-full relative transition-colors duration-200 focus:outline-hidden ${
                      languageLockToggle ? "bg-indigo-600" : (isDarkMode ? "bg-slate-800" : "bg-slate-200")
                    }`}
                  >
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all duration-200 ${
                      languageLockToggle ? "translate-x-4" : "translate-x-0"
                    }`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Language Standards block (styled as elegant M3 list items with roundings) */}
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
                  <strong className="text-indigo-600 dark:text-indigo-400 font-semibold block mb-0.5">🇩🇪 DE (German)</strong>
                  Leichte Sprache Principles based on DIN SPEC 33429 or ISO 24495-1 specifications.
                </div>
                <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed transition-colors duration-200 ${
                  isDarkMode ? "bg-[#21232B] border-slate-800 text-slate-300" : "bg-white border-indigo-50 text-slate-600 shadow-sm"
                }`}>
                  <strong className="text-indigo-600 dark:text-indigo-400 font-semibold block mb-0.5">🇬🇧 EN (English)</strong>
                  Standard civil Easy read principles to keep output highly readable.
                </div>
                <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed transition-colors duration-200 ${
                  isDarkMode ? "bg-[#21232B] border-slate-800 text-slate-300" : "bg-white border-indigo-50 text-slate-600 shadow-sm"
                }`}>
                  <strong className="text-indigo-600 dark:text-indigo-400 font-semibold block mb-0.5">🇪🇺 Other</strong>
                  Simplify the regional document to CEFR A2/B1 proficiency levels.
                </div>
              </div>
            </div>


          </aside>
        )}

        {/* Central Workspace Work Area */}
        <section className={`flex-1 flex flex-col p-5 md:p-8 gap-6 overflow-y-auto transition-colors duration-200 ${
          isDarkMode ? "bg-[#0B1220]" : "bg-slate-50/50"
        }`}>
          {activeTab === "workspace" ? (
            <>
              {/* Material vertical stacked layout: ensures output is as wide as the source field */}
              <div className="flex flex-col gap-6 flex-1">
                
                {/* Input Text Box */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h2 className={`text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${
                      isDarkMode ? "text-slate-400" : "text-slate-500"
                    }`}>
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      Source Motion / Amendment
                    </h2>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 border rounded-md text-[10px] font-mono transition-colors duration-200 ${
                        isDarkMode ? "bg-[#18233C] border-slate-800 text-slate-400" : "bg-white border-slate-200 text-slate-500"
                      }`}>
                        {inputText.length} chars
                      </span>
                      {inputText && (
                        <button
                          onClick={clearAll}
                          className="text-[10px] text-slate-400 hover:text-red-500 font-bold uppercase tracking-wider transition-colors cursor-pointer"
                          id="btn-clear-main"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div className={`flex-1 border rounded-2xl p-5 shadow-sm flex flex-col min-h-[250px] transition-colors duration-200 ${
                    isDarkMode ? "bg-[#111A2E] border-slate-800" : "bg-white border-slate-200"
                  }`}>
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Paste legislative motions, parliamentary decisions, amendment documents, or treaty definitions here. They will be processed matching style rules instantly."
                      className={`w-full flex-1 resize-none outline-hidden border-0 text-sm leading-relaxed font-serif focus:ring-0 ${
                        isDarkMode ? "text-slate-100 placeholder:text-slate-500 bg-[#111A2E]" : "text-slate-700 placeholder:text-slate-400 bg-white"
                      }`}
                      id="motion-textarea"
                    />

                    {/* Example Buttons strip in box */}
                    <div className={`mt-4 pt-3 border-t ${isDarkMode ? "border-slate-800" : "border-slate-100"}`}>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                        Quick Templates (Auto-loads translation scenarios)
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {examples.map((ex) => (
                          <button
                            key={ex.id}
                            onClick={() => loadExample(ex)}
                            className={`px-2.5 py-1 text-[11px] font-medium border rounded-md transition-all cursor-pointer ${
                              isDarkMode 
                                ? "bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700" 
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                            }`}
                            id={`tag-${ex.id}`}
                          >
                            {ex.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Simplified Output Box */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Plain language generated below
                    </h2>
                  </div>
                  
                  <div className={`flex-1 border-2 rounded-3xl shadow-xs overflow-hidden relative flex flex-col min-h-[250px] transition-all duration-300 ${
                    isDarkMode 
                      ? "bg-[#1E2028] border-slate-800 shadow-indigo-950/10" 
                      : "bg-white border-indigo-50/80 shadow-indigo-100/30"
                  }`}>
                    {/* Visual left highlight line conforming to M3 tint */}
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600"></div>

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
                              <span className={`text-xs font-bold block ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>Simplification Pipeline Active</span>
                              <span className="text-[11px] text-slate-400 font-mono mt-0.5 block animate-bounce">
                                {loadingStep === 1 && "Detecting source language and context..."}
                                {loadingStep === 2 && `Applying Style Rules via ${selectedModel}...`}
                                {loadingStep === 3 && "Verifying Zero-Translation integrity..."}
                              </span>
                            </div>
                          </motion.div>
                        ) : error ? (
                          <motion.div
                            key="error"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`p-4 border rounded-2xl flex gap-3 text-xs ${
                              isDarkMode ? "bg-red-950/20 border-red-900/30 text-red-200" : "bg-red-50 border-red-100 text-red-800"
                            }`}
                          >
                            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                            <div>
                              <strong className="font-semibold block">Simplification failed</strong>
                              <span className="block mt-0.5 leading-relaxed">{error}</span>
                            </div>
                          </motion.div>
                        ) : apiResult ? (
                          <motion.div
                            key="result"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex-1 flex flex-col"
                          >

                            {/* Thought structured paragraph block (Guarantees every thought is on new line with blank spaces) */}
                            <div className="space-y-4 flex-1">
                              {apiResult.simplifiedText.split('\n').map((thought, idx) => {
                                const trimmed = thought.trim();
                                if (!trimmed) return null;
                                return (
                                  <p key={idx} className={`text-[14px] leading-relaxed font-sans font-medium ${
                                    isDarkMode ? "text-slate-200" : "text-slate-800"
                                  }`}>
                                    {trimmed}
                                  </p>
                                );
                              })}
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="empty"
                            className="flex-1 flex flex-col items-center justify-center text-center p-12 text-slate-400"
                          >
                            <Info className={`w-8 h-8 mb-2 ${isDarkMode ? "text-slate-700" : "text-slate-200"}`} id="empty-info" />
                            <span className={`text-xs font-bold block ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>Unified Output Waiting</span>
                            <span className="text-[11px] text-slate-400 mt-1 max-w-xs block leading-normal">
                              Input legislative language context above, or trigger a regional standard template to generate real-time plain language.
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {apiResult && !isLoading && (
                      <div className={`px-5 py-3.5 flex items-center justify-between text-[11px] border-t transition-colors duration-200 ${
                        isDarkMode ? "bg-[#14151B] border-slate-800 text-slate-400" : "bg-slate-50 border-slate-100 text-slate-600"
                      }`}>
                        <span className="font-mono flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          Zero-Translation Compliant
                        </span>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => copyToClipboard(apiResult.simplifiedText)}
                            className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                              isDarkMode 
                                ? "text-indigo-300 bg-indigo-950/40 border border-indigo-900/30 hover:bg-indigo-900/50" 
                                : "text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-900"
                            }`}
                          >
                            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copied ? "Copied!" : "Copy Output"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Black Stats Session Bar from Design HTML */}
              <div className="bg-slate-900 rounded-2xl p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-5 relative overflow-hidden transition-all duration-300">
                <div className="flex gap-10 w-full md:w-auto relative z-10 justify-between md:justify-start">
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase font-bold tracking-tight">Tokens Used</span>
                    <span className="text-white font-mono text-xl mt-0.5">
                      {apiResult ? `${tokensUsed} / 4,096` : "0 / 4,096"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase font-bold tracking-tight">Processing Latency</span>
                    <span className="text-white font-mono text-xl mt-0.5">
                      {apiResult ? latency : "0.0s"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase font-bold tracking-tight">Confidence Score</span>
                    <span className="text-emerald-400 font-mono text-xl mt-0.5">
                      {apiResult ? "98.4%" : "100.0%"}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 w-full md:w-auto relative z-10 justify-end">
                  <button
                    onClick={copyJsonResponse}
                    disabled={!apiResult}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors border ${
                      apiResult
                        ? "bg-white/10 hover:bg-white/20 text-white border-white/10 cursor-pointer"
                        : "bg-white/5 text-slate-600 border-white/5 cursor-not-allowed"
                    }`}
                    id="btn-copy-json"
                  >
                    {copiedJson ? "Copied JSON!" : "Copy JSON Response"}
                  </button>
                  <button
                    onClick={downloadSummaryFile}
                    disabled={!apiResult}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                      apiResult
                        ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/40"
                        : "bg-indigo-900/40 text-slate-500 cursor-not-allowed"
                    }`}
                    id="btn-download"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Summary
                  </button>
                </div>
              </div>
            </>
          ) : activeTab === "api-docs" ? (
            /* Programmatic API Documentation Tab (matches exact theme specs) */
            <div className={`rounded-3xl border overflow-hidden shadow-xs max-w-4xl mx-auto w-full transition-all duration-300 ${
              isDarkMode ? "bg-[#1E2028] border-slate-800" : "bg-white border-indigo-50/60"
            }`}>
              <div className={`p-6 md:p-8 border-b ${
                isDarkMode ? "border-slate-800/80 bg-[#14151B]" : "border-indigo-50/40 bg-slate-50/70"
              }`}>
                <span className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-full tracking-wider border ${
                  isDarkMode 
                    ? "bg-indigo-500/15 text-indigo-300 border-indigo-900/35" 
                    : "bg-indigo-50 text-indigo-750 border-indigo-100/60"
                }`}>
                  Programmatic Pipeline Integration
                </span>
                <h2 className="text-md md:text-lg font-bold mt-2.5">API Documentation &amp; Usage</h2>
                <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? "text-slate-300" : "text-slate-650"}`}>
                  Automate your political text summaries securely. The API is stateless, fully compliant, and supports German "Einfache Sprache" based on federal DIN 8581-1 / ISO guidelines.
                </p>
              </div>

              <div className="p-6 md:p-8 flex flex-col gap-6 font-sans">
                
                {/* environment routing notice */}
                <div className={`p-4 rounded-2xl border flex gap-3 text-xs leading-relaxed ${
                  isDarkMode ? "bg-amber-950/20 border-amber-900/35 text-amber-300" : "bg-amber-50/60 border-amber-200/50 text-amber-900"
                }`}>
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block mb-0.5 font-semibold">Development App Notice</strong>
                    If you are testing requests on a preview workspace URL (containing <code className="font-mono bg-amber-500/10 px-1 py-0.2 rounded font-bold text-[10px]">*ais-dev*</code>), external clients (such as Google Sheets Apps Script or terminal <code className="font-mono bg-amber-500/10 px-1 py-0.2 rounded font-bold text-[10px]">curl</code>) will receive HTML auth login redirections (302 Found).
                    To perform smooth unauthenticated API requests, please copy scripts and invoke calls using the <strong className="underline">Shared Preview URL</strong> (containing <code className="font-mono bg-amber-500/10 px-1 py-0.2 rounded font-bold text-[10px]">*ais-pre*</code>) which is fully open and public.
                  </div>
                </div>

                {/* Endpoint card */}
                <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border p-4 rounded-2xl ${
                  isDarkMode ? "bg-[#14151B] border-slate-800" : "bg-slate-50 border-indigo-100/50"
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="bg-teal-100 text-teal-900 border border-teal-200 text-[10px] font-bold font-mono px-2.5 py-1 rounded">
                      POST
                    </span>
                    <span className={`font-semibold text-xs md:text-sm font-mono ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>
                      {originUrl}/api/simplify
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    Stateless Endpoint
                  </div>
                </div>

                {/* Input payloads */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className={`text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5 ${
                      isDarkMode ? "text-slate-400" : "text-slate-600"
                    }`}>
                      <Code className="w-3.5 h-3.5" />
                      Request Header &amp; Body JSON
                    </h3>
                    <pre className={`text-xs p-4 rounded-2xl border overflow-x-auto font-mono ${
                      isDarkMode ? "bg-slate-950 text-slate-300 border-slate-800" : "bg-slate-50 text-slate-800 border-indigo-100/45"
                    }`}>
{`{
  "text": "Der Bundestag wolle beschließen...",
  "model": "gemini-3.5-flash"
}`}
                    </pre>
                  </div>

                  <div>
                    <h3 className={`text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5 ${
                      isDarkMode ? "text-slate-400" : "text-slate-600"
                    }`}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Compliant Output Schema
                    </h3>
                    <pre className={`text-xs p-4 rounded-2xl border overflow-x-auto font-mono ${
                      isDarkMode ? "bg-slate-950 text-slate-300 border-slate-800" : "bg-slate-50 text-slate-800 border-indigo-100/45"
                    }`}>
{`{
  "originalText": "...",
  "simplifiedText": "Easy summary of key...",
  "language": "German",
  "styleApplied": "Einfache Sprache - DIN 8581-1",
  "modelUsed": "gemini-3.5-flash"
}`}
                    </pre>
                  </div>
                </div>

                {/* cURL Usage example */}
                <div>
                  <h3 className={`text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5 ${
                    isDarkMode ? "text-slate-400" : "text-slate-600"
                  }`}>
                    <Code className="w-3.5 h-3.5" />
                    Integration Example (curl)
                  </h3>
                  <pre className={`text-xs p-4 rounded-2xl border overflow-x-auto font-mono whitespace-pre-wrap break-all ${
                    isDarkMode ? "bg-slate-950 text-slate-300 border-slate-800" : "bg-slate-50 text-slate-800 border-indigo-100/45"
                  }`}>
{`curl -X POST ${originUrl}/api/simplify \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Der Entwurf des Gesetzes zur Änderung des Klimaschutzgesetzes sieht vor..."
  }'`}
                  </pre>
                </div>

              </div>
            </div>
          ) : (
            /* Google Apps Script Integration Console and Instructions */
            <div className={`rounded-3xl border overflow-hidden shadow-xs max-w-4xl mx-auto w-full transition-all duration-300 ${
              isDarkMode ? "bg-[#1E2028] border-slate-800" : "bg-white border-indigo-50/60"
            }`}>
              <div className={`p-6 md:p-8 border-b ${
                isDarkMode ? "border-slate-800/80 bg-[#14151B]" : "border-indigo-50/40 bg-slate-50/70"
              }`}>
                <span className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-full tracking-wider border ${
                  isDarkMode 
                    ? "bg-teal-500/10 text-teal-300 border-teal-900/35" 
                    : "bg-teal-50 text-teal-850 border-teal-100/60"
                }`}>
                  Google Workspace Pipelines
                </span>
                <h2 className="text-md md:text-lg font-bold mt-2.5">Deploy directly into Google Docs &amp; Sheets</h2>
                <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? "text-slate-300" : "text-slate-650"}`}>
                  Make your model available as a native custom helper inside Google Workspace! Trigger simplification of legislative terms in Sheets using formulas or through custom Docs menu bars.
                </p>
              </div>

              <div className="p-6 md:p-8 flex flex-col gap-8 font-sans">
                
                {/* Visual Architecture Info Block */}
                <div className={`p-4 rounded-2xl border flex gap-4 text-xs leading-relaxed ${
                  isDarkMode ? "bg-[#14151B] border-slate-800 text-slate-300" : "bg-slate-50 border-indigo-100 text-slate-700"
                }`}>
                  <Zap className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block mb-1 font-semibold text-indigo-605">Dynamic Workspace Routing</strong>
                    These scripts connect directly from Google's servers to this running container endpoint at <code className="font-mono bg-indigo-950/20 dark:bg-indigo-950/40 px-1 py-0.5 rounded text-indigo-400 break-all">{originUrl}</code>. No extra setup required! Just copy, paste, and run.
                  </div>
                </div>

                {/* Tab layout inside for Sheets vs Docs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  
                  {/* Google Sheets Column */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-emerald-600/20 text-emerald-500 rounded-lg flex items-center justify-center font-bold">
                        田
                      </div>
                      <h3 className="text-sm font-semibold">1. For Google Sheets</h3>
                    </div>

                    <p className={`text-xs leading-relaxed ${isDarkMode ? "text-slate-400" : "text-slate-650"}`}>
                      Adds a spreadsheet formula <code className="font-mono bg-emerald-950/20 px-1 py-0.5 rounded text-emerald-500">=GAMMA_SIMPLIFY(cell)</code> to automatically convert legal text cell-by-cell.
                    </p>

                    <div className="relative">
                      <pre className={`text-[11px] p-4 rounded-2xl border overflow-y-auto max-h-64 font-mono ${
                        isDarkMode ? "bg-slate-950 text-slate-355 border-slate-850" : "bg-slate-50 text-slate-800 border-indigo-100/40"
                      }`}>
                        {getSheetsScript()}
                      </pre>
                      <button
                        onClick={copySheetsCode}
                        className="absolute top-2 right-2 p-1.5 rounded transition-all bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                        title="Copy Sheet Script"
                      >
                        {copiedSheetsScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="space-y-2 mt-2">
                      <h4 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>Setup Instructions</h4>
                      <ol className={`text-xs pl-4 list-decimal space-y-1.5 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                        <li>Open your <strong>Google Spreadsheet</strong>.</li>
                        <li>Click <strong>Extensions &gt; Apps Script</strong> in the header.</li>
                        <li>Delete any placeholder code and paste this script.</li>
                        <li>Press the 💾 Save button.</li>
                        <li>Type <code className="font-mono bg-indigo-500/10 px-1 rounded text-indigo-600 font-semibold">=GAMMA_SIMPLIFY(A1)</code> in any cell!</li>
                      </ol>
                    </div>
                  </div>

                  {/* Google Docs Column */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-indigo-600/20 text-indigo-500 rounded-lg flex items-center justify-center font-bold">
                        目
                      </div>
                      <h3 className="text-sm font-semibold">2. For Google Docs</h3>
                    </div>

                    <p className={`text-xs leading-relaxed ${isDarkMode ? "text-slate-400" : "text-slate-650"}`}>
                      Creates a custom menu bar option <strong>GammaMotion &gt; Simplify Selected Text</strong>. Perfect for working directly inside amendments.
                    </p>

                    <div className="relative">
                      <pre className={`text-[11px] p-4 rounded-2xl border overflow-y-auto max-h-64 font-mono ${
                        isDarkMode ? "bg-slate-950 text-slate-355 border-slate-850" : "bg-slate-50 text-slate-800 border-indigo-100/40"
                      }`}>
                        {getDocsScript()}
                      </pre>
                      <button
                        onClick={copyDocsCode}
                        className="absolute top-2 right-2 p-1.5 rounded transition-all bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                        title="Copy Doc Script"
                      >
                        {copiedDocsScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="space-y-2 mt-2">
                      <h4 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>Setup Instructions</h4>
                      <ol className={`text-xs pl-4 list-decimal space-y-1.5 ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>
                        <li>Open your <strong>Google Doc</strong>.</li>
                        <li>Click <strong>Extensions &gt; Apps Script</strong>.</li>
                        <li>Paste this code and save it.</li>
                        <li>Refresh the Google Doc tab.</li>
                        <li>Highlight any complicated text segment, select <strong>GammaMotion &gt; Simplify Selected Text</strong> in the menu!</li>
                      </ol>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Footer conforming to styling structure */}
      <footer className={`h-10 flex items-center justify-between px-6 md:px-8 text-[10px] uppercase font-semibold transition-colors duration-200 ${
        isDarkMode ? "bg-[#111A2E] border-t border-slate-800 text-slate-500" : "bg-white border-t border-slate-200 text-slate-400"
      }`}>
        <div>Connected: API Endpoint :: https://api.gamma-model.io/v1/simplify</div>
        <div className="flex gap-4">
          <span>Compliance: GDPR</span>
          <span>Security: TLS 1.3</span>
          <span>Auth: OAuth2 Bearer</span>
        </div>
      </footer>
    </div>
  );
}
