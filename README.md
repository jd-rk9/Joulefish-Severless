# 🐟 Joulefish

Do you have motions, amendments, or complicated political texts that you want to make accessible to everyone?

Joulefish is an open-source, lightweight, fully cloud-native application designed to democratize dense language. While it includes a beautiful web interface, it is architected API-first—perfect for running microservices on the same Kubernetes cluster or private network. It works out of the box with both local deployments and major cloud AI providers.

## 🌌 What's in a name?

As you might have guessed, Joulefish is a blend of the legendary Babel Fish (the ultimate sci-fi translator) and a Joule. A joule is a small, efficient unit of energy, just like a volt. But single joules, just like volts, multiply to create a massive, powerful impact.

## What is Joulefish?

Joulefish is a tool that takes complex political texts and simplifies them into easy-to-understand language. It is designed to be used by anyone who wants to understand political texts better, whether they are a politician, a journalist, or a member of the public. It is also designed to be used by organizations that want to make their political texts more accessible to the public.

---

## 🚀 Key Features

**German "Leichte Sprache" & A2/B1 Standardization**: Translates convoluted legislative amendments, draft policies, and legal frameworks into understandable clauses using direct structural rules.
**Flexible Deploy-Time Routing**: Fully configurable to route calls either to cloud-based API endpoints (Gemini, OpenAI, Anthropic) or to locally hosted, privacy-first, OpenAI-compatible model servers (LM Studio, Ollama, vLLM, DeepSeek, etc.).
**Stateless API Gateway**: Exposes standard endpoints to integrate plain-language simplifications directly into your existing internal workflows and automation pipelines.
**Material Design 3 Console UI**: Styled in a responsive, high-contrast, beautiful dark slate and warm light-indigo interface inspired by Google Material 3 spacing, negative space, and typographic hierarchies.
**Unified Single-Column Layout**: Full desktop-and-mobile layout matching output fields to source dimensions for balanced, side-by-side text review.
**Adaptive Model Selection**: Quick, seamless model switching across lightweight local models or premier cloud LLMs right at the top left of the workspace.
**Google Workspace Integration**: Complete built-in Apps Script resources for triggering formulas in Google Sheets or custom formatting menus directly inside Google Docs.

---

## 🛠️ Deployment Routing Configuration

Joulefish is lightweight and built to run anywhere you need it:
**🐳 Locally**: Quickly spin it up via Docker and connect it to your local model server running LM Studio.
**☸️ In the Cloud**: Deploy it natively on a Kubernetes (k8s) cluster or any cloud PaaS to use as an internal network utility.
**🤖 Hybrid Backends**: Mix and match your intelligence—route simple queries to local models and heavy legislative analysis to remote endpoints like Gemini, ChatGPT, or Claude.

You can seamlessly change and configure the backend LLM engine at deploy-time. The server can automatically switch between Google Gemini SDK and an OpenAI-compatible endpoint.

Configure these keys inside your production environment or local `.env` file:

```env
# Define the provider to use ("gemini" or "openai")
LLM_API_PROVIDER="gemini"

# Custom provider's base API endpoint
# Examples:
# - For Local Ollama: "http://localhost:11434/v1"
# - For Local LM Studio: "http://localhost:1234/v1"
# - For DeepSeek/Custom: "https://api.deepseek.com/v1"
LLM_API_URL="https://generativelanguage.googleapis.com"

# Custom LLM Bearer token or API key
LLM_API_KEY="your-api-key-here"

# Model name configuration (e.g. llama3, mistral, deepseek-chat)
LLM_MODEL_NAME_OVERRIDE="gemini-3.5-flash"
```

---

## 🐳 Quickstart with Docker

This application includes a multi-stage Docker build to package both the React Vite frontend and the Express backend server securely.

### 1. Build the Docker Image

```bash
docker build -t gammamotion-console .
```

### 2. Run the Container

Pass your API credentials as runtime environment flags:

```bash
docker run -p 3000:3000 \
  -e GEMINI_API_KEY="your_gemini_api_key" \
  -e LLM_API_PROVIDER="gemini" \
  gammamotion-console
```

The application will be accessible at `http://localhost:3000`.

---

## 💻 Local Development

Before running locally, ensure you have **Node.js 18+** installed:

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

### 3. Run Development Server

```bash
npm run dev
```

### 4. Build and Compile for Production

```bash
npm run build
npm start
```

---

## 📂 Project Architecture

```
├── /Dockerfile             # Multi-stage production container build
├── /server.ts              # Express API router & LLM proxy controller
├── /src/
│   ├── App.tsx             # Polished Material UI Core App & State Engine
│   ├── main.tsx            # App bundle entry point
│   └── index.css           # Global typography definitions & Tailwind
├── /package.json           # Declarations, builds, and dependencies
└── /metadata.json          # Core application properties & permissions


## Known issues

* Hard to setup with cloud LLM's
* Properly tested with local LLM's through LM Studio not Olama
*
```
