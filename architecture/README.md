# 🐟 Joulefish Architecture & Flows Overview

This directory contains the architecture specifications, deployment topographies, sequence flows, and class definitions for **Joulefish**—a cloud-native microservice for translating complex political motions into accessible language (*Leichte Sprache* / Easy Read / *Eenvoudig Communiceren*).

---

## 📑 Table of Contents

- [1. Component & System Context Architecture](#1-component--system-context-architecture)
- [2. Kubernetes Deployment Flow (Motion Tools to Joulefish)](#2-kubernetes-deployment-flow-motion-tools-to-joulefish)
- [3. General Infrastructure & Container Deployment](#3-general-infrastructure--container-deployment)
- [4. Motion Tools Integration Sequence Flow](#4-motion-tools-integration-sequence-flow)
- [5. Full Application Sequence Flow](#5-full-application-sequence-flow)
- [6. Data Models & API Gateway Class Diagram](#6-data-models--api-gateway-class-diagram)
- [7. Generating SVG Assets](#7-generating-svg-assets)

---

## 1. Component & System Context Architecture

The **C4 Component Diagram** illustrates the high-level architecture of Joulefish. The application bundles a React 19 Single Page Application (SPA) frontend and an Express 4 Node.js API Gateway into a single container. The backend LLM router handles dynamic request translation and routes requests to either cloud API endpoints (Google Gemini API via `@google/genai` SDK) or local/private OpenAI-compatible endpoints (LM Studio, Ollama, vLLM, DeepSeek).

```mermaid
C4Context
    title Component & Architecture Diagram - Joulefish

    Person(user, "User / Civil Servant", "Inputs text to be simplified into German 'Leichte Sprache' or Easy Read")
    
    Container_Boundary(app_container, "Joulefish Container (Docker / K8s)") {
        Component(react_ui, "React 19 Frontend SPA", "React, Vite, Tailwind CSS", "Provides workspace, API builder, Google Workspace integration tab, and diff views")
        Component(express_server, "Express Backend Gateway", "Node.js (server.ts)", "Handles API routing (/api/simplify, /api/models, /api/examples), static file serving, and CORS")
        Component(llm_router, "LLM Proxy / Router", "TypeScript", "Checks provider configuration and builds appropriate payload for Gemini SDK or OpenAI REST API")
    }

    System_Ext(gemini_api, "Google Gemini API", "Cloud API via @google/genai SDK")
    System_Ext(custom_llm, "Local / Custom LLM Endpoint", "Ollama, LM Studio, vLLM, DeepSeek (OpenAI compatible)")

    Rel(user, react_ui, "Interacts with UI / Submits text", "HTTPS / Port 3000")
    Rel(react_ui, express_server, "POST /api/simplify", "JSON / REST")
    Rel(express_server, llm_router, "Delegates LLM request", "In-Process")
    Rel(llm_router, gemini_api, "Generates response via SDK", "HTTPS (gemini provider)")
    Rel(llm_router, custom_llm, "POST /v1/chat/completions", "HTTP/HTTPS (openai provider)")
```

---

## 2. Kubernetes Deployment Flow (Motion Tools to Joulefish)

This diagram highlights the internal Kubernetes inter-pod communication flow when **Motion Tools** integrates with Joulefish as a backend microservice:

1. **Motion Tools Pod** extracts the motion text field `motion_text` and issues an internal HTTP `POST /api/simplify` call to the Joulefish `ClusterIP` Service (`http://joulefish:3000`).
2. **Joulefish Pod** processes the incoming request and performs an outbound HTTPS API call to the **Google Gemini Cloud API**.
3. **Google Gemini** returns the simplified JSON payload back to Joulefish.
4. **Joulefish** returns a `200 OK` `SimplifyResponse` back to Motion Tools.
5. **Motion Tools** writes the resulting `simplifiedText` into its database field `simplified_motion_text`.

```mermaid
graph TD
    subgraph K8s_Cluster["Kubernetes Cluster"]
        
        subgraph MotionTools_Deployment["Motion Tools Deployment & Storage"]
            MT_Pod["Motion Tools Pod"]
            MT_App["Motion Tools App / Worker"]
            MT_DB[("Motion Tools Database<br/>field: simplified_motion_text")]
            MT_Pod --- MT_App
        end

        subgraph Joulefish_Deployment["Joulefish Deployment & Service"]
            JF_Service["Joulefish Service<br/>(ClusterIP / Port 3000)"]
            
            subgraph JF_Pod["Joulefish Pod"]
                Node_Runtime["Node.js 20 Runtime"]
                Express_App["Express API Server<br/>(server.ts)"]
                Node_Runtime --- Express_App
            end
            
            JF_Service -->|"Routes traffic to port 3000"| Express_App
        end

    end

    subgraph External_Cloud["External Cloud Providers"]
        Gemini_Model["Google Gemini Model<br/>(generativelanguage.googleapis.com)"]
    end

    MT_App -->|"1. HTTP POST /api/simplify { text: motion_text }<br/>Internal K8s DNS (http://joulefish:3000)"| JF_Service
    Express_App -->|"2. Outbound HTTPS API Call<br/>via @google/genai SDK"| Gemini_Model
    Gemini_Model -.->|"3. Returns generated JSON response"| Express_App
    Express_App -.->|"4. Returns 200 OK SimplifyResponse"| MT_App
    MT_App -->|"5. Writes simplifiedText to database field"| MT_DB
```

---

## 3. General Infrastructure & Container Deployment

The infrastructure diagram demonstrates the single-port architecture of the Joulefish container. The Express gateway hosts both the compiled Vite static SPA assets and the backend `/api/*` REST endpoints on port 3000 behind a Kubernetes Service or Docker Ingress layer.

```mermaid
graph TD
    subgraph K8s_Cluster["Kubernetes Cluster / Docker Host"]
        subgraph Ingress_Layer["Ingress / Port Forwarding"]
            Service["Service (Port 80 -> 3000)"]
        end
        
        subgraph Pod["Joulefish Pod / Container"]
            NodeRuntime["Node.js 20 Runtime (server.ts / dist)"]
            
            subgraph Express_App["Single Port Container (3000)"]
                StaticFiles["Static Vite Assets (dist/)"]
                API_Routes["REST Endpoints (/api/*)"]
            end
        end
    end

    ClientBrowser["Client Web Browser"] --> Service
    Service --> Express_App
    API_Routes --> LocalLLM["Local LLM Server (LM Studio / Ollama / vLLM)"]
    API_Routes --> CloudLLM["Google Gemini Cloud API"]
```

---

## 4. Motion Tools Integration Sequence Flow

Below are the sequence flows specifically modeling Motion Tools calling the Joulefish API with `{ "text": motion_text }` and persisting the output into `simplified_motion_text`.

### Mermaid Sequence Diagram (`motionToolsSequenceDiagram.mmd`)

```mermaid
sequenceDiagram
    autonumber
    participant MT as Motion Tools System
    participant JF as Joulefish Gateway (/api/simplify)
    participant LLM as LLM Engine (Gemini / Custom Provider)
    participant DB as Motion Database

    Note over MT: Input Field: motion_text
    MT->>JF: POST /api/simplify { "text": motion_text }
    JF->>LLM: Request simplification rules (Leichte Sprache / Easy Read)
    LLM-->>JF: JSON payload { simplifiedText, language, styleApplied }
    JF-->>MT: 200 OK (SimplifyResponse)
    MT->>DB: Write simplifiedText into field "simplified_motion_text"
```

### PlantUML Sequence Diagram (`diagram.uml`)

```plantuml
@startuml
participant "Motion Tools" as MT
participant "Joulefish API" as JF
participant "LLM Engine" as LLM
database "Motion Database" as DB

Note over MT: Input Field: motion_text
MT -> JF: POST /api/simplify { "text": motion_text }
JF -> LLM: Request simplification (Leichte Sprache / Plain Language)
LLM --> JF: Return simplified JSON payload
JF --> MT: 200 OK (SimplifyResponse)
MT -> DB: Write simplifiedText to field "simplified_motion_text"
@enduml
```

---

## 5. Full Application Sequence Flow

This sequence diagram depicts the detailed request lifecycle executed inside `server.ts` when processing simplification requests:

1. Automatic input language detection (German, English, Dutch, etc.).
2. Construction of system instructions (e.g. DIN SPEC 33429 for German *Leichte Sprache*).
3. LLM provider selection based on environment configuration (`LLM_API_PROVIDER`).
4. Robust JSON parsing and fallback cleanup of LLM output.
5. Returning structured JSON (`originalText`, `simplifiedText`, `language`, `styleApplied`, `modelUsed`).

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Client App
    participant UI as React SPA (App.tsx)
    participant Server as Express Server (server.ts)
    participant Router as LLM Proxy Engine
    participant Gemini as Google Gemini Cloud API
    participant CustomLLM as Local / OpenAI LLM (LM Studio/Ollama)

    User->>UI: Input political motion text & select model
    UI->>Server: POST /api/simplify { text, model }
    Server->>Server: Detect language (German, English, Dutch, etc.)
    Server->>Server: Build prompt with Leichte Sprache / Easy Read rules
    Server->>Router: Check LLM_API_PROVIDER config

    alt Provider is Google Gemini ("gemini")
        Router->>Gemini: ai.models.generateContent()
        Gemini-->>Router: JSON { language, styleApplied, simplifiedText }
    else Provider is Custom OpenAI ("openai")
        Router->>CustomLLM: POST /v1/chat/completions
        CustomLLM-->>Router: JSON choices payload
    end

    Router-->>Server: Extracted & parsed simplification fields
    Server-->>UI: 200 OK (SimplifyResponse)
    UI-->>User: Display original vs simplified text side-by-side
```

---

## 6. Data Models & API Gateway Class Diagram

The class diagram maps the data interfaces defined in `src/types.ts`, backend endpoints, and environmental variables configured in `server.ts`.

```mermaid
classDiagram
    class SimplifyRequest {
        +string text
        +string model
    }

    class SimplifyResponse {
        +string originalText
        +string simplifiedText
        +string language
        +string styleApplied
        +string modelUsed
    }

    class AppSettings {
        +string selectedModel
        +string inputText
        +string outputText
        +string detectedLang
        +string styleApplied
        +string activeTab
    }

    class EnvironmentConfig {
        +string PORT
        +string GEMINI_API_KEY
        +string LLM_API_PROVIDER
        +string LLM_API_URL
        +string LLM_API_KEY
        +string LLM_MODEL_NAME_OVERRIDE
    }

    class ExpressGateway {
        +startServer()
        +getModels(req, res)
        +getExamples(req, res)
        +handleSimplify(req, res)
        +processModelResponse(responseContent)
    }

    ExpressGateway ..> SimplifyRequest : receives
    ExpressGateway ..> SimplifyResponse : outputs
    ExpressGateway ..> EnvironmentConfig : reads
    AppSettings -- SimplifyRequest : populates
```

---

## 7. Generating SVG Assets

You can automatically compile all `.mmd` diagrams in this folder into vector SVG images by executing `export_mmd.sh`:

```bash
cd architecture
bash export_mmd.sh
```

This uses `@mermaid-js/mermaid-cli` (`mmdc`) to generate SVG files (`classDiagram.svg`, `componentAndArchiteture.svg`, `deploymentAndInfrastructure.svg`, `kubernetes.svg`, `motionToolsSequenceDiagram.svg`, `sequenceDiagram.svg`).
