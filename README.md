# Gemini Live API - Real-time Voice & Vision Agent Demo

A full-stack **TypeScript** web demo for Google's **Gemini Live API** (Multimodal Live API). Supports real-time voice conversation, camera/screen sharing, function calling, and transcription — all accessible on desktop and mobile browsers.

## Architecture

```
React (Vite) ←WebSocket→ Node.js Proxy Server ←WebSocket→ Gemini Live API
```

- **Frontend**: React + TypeScript (Vite) — responsive, mobile-friendly UI
- **Backend**: Node.js/TypeScript WebSocket proxy — handles Google Cloud auth, proxies messages to Gemini
- **API**: Gemini Live API via Google AI or Vertex AI WebSocket endpoints

## Features

- 🎙️ Real-time voice conversation with Gemini
- 📷 Camera and screen sharing support
- 📝 Input/output transcription
- 🔧 Function calling support (custom tools)
- 🔍 Google Search grounding
- ⚙️ Configurable voice, temperature, and activity detection
- 📱 Mobile-friendly responsive design

## Prerequisites

- Node.js 18+
- A Google Cloud project with Generative Language / Vertex AI API enabled
- A service account key or `gcloud` application-default credentials

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/jw782cn/gemini-live-demo.git
cd gemini-live-demo
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env

# Option A: Service account (recommended for server deployment)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account.json

# Option B: gcloud CLI (for local development)
gcloud auth application-default login
```

### 3. Run (dev mode)

```bash
npm run dev
```

This starts both the **Vite dev server** (http://localhost:3000) and the **WebSocket proxy** (ws://localhost:8080) concurrently.

Open http://localhost:3000 in your browser (Chrome recommended for microphone access). Works on mobile too.

### 4. Build for production

```bash
npm run build
```

Static assets are output to `dist/`. Serve them with any static file server and run the WS proxy separately:

```bash
npm start   # starts the WebSocket proxy server
```

## Project Structure

```
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html                    # Vite entry point
├── .env.example
├── server/
│   ├── index.ts                  # WebSocket proxy server
│   └── auth.ts                   # Google Cloud authentication
├── src/
│   ├── main.tsx                  # React entry
│   ├── App.tsx                   # Root component + layout
│   ├── App.css                   # Global responsive styles
│   ├── types.ts                  # Shared TypeScript types
│   ├── lib/
│   │   ├── gemini-live-api.ts    # Gemini Live API client
│   │   └── media-utils.ts        # Audio/video/screen capture
│   ├── hooks/
│   │   ├── useGemini.ts          # Connection & message state
│   │   └── useMedia.ts           # Media stream state
│   └── components/
│       ├── ConfigPanel.tsx       # Settings & configuration
│       ├── ChatPanel.tsx         # Chat messages & input
│       ├── MediaControls.tsx     # Audio/video/screen controls
│       └── StatusBar.tsx         # Debug info
├── public/
│   └── audio-processors/
│       ├── capture.worklet.js    # Audio capture worklet
│       └── playback.worklet.js   # Audio playback worklet
└── README.md
```

## How It Works

1. Browser connects to the Node.js proxy via WebSocket (ws://localhost:8080)
2. Proxy authenticates with Google Cloud using service account / default credentials
3. Proxy establishes a WebSocket connection to the Gemini Live API endpoint
4. Messages are bidirectionally proxied between browser and Gemini
5. React frontend handles audio capture/playback, camera capture, and UI

## Credits

Based on [Google Cloud's Multimodal Live API demo](https://github.com/GoogleCloudPlatform/generative-ai/tree/main/gemini/multimodal-live-api/native-audio-websocket-demo-apps/plain-js-demo-app).

## License

Apache 2.0
