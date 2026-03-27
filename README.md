# Gemini Live API - Real-time Voice & Vision Agent Demo

A web-based demo for Google's **Gemini Live API** (Multimodal Live API) via Vertex AI. Supports real-time voice conversation and vision (camera/screen sharing) with Gemini.

## Architecture

```
Browser (HTML/JS) ←WebSocket→ Python Proxy Server ←WebSocket→ Vertex AI Live API
```

- **Frontend**: Vanilla HTML/JS — captures audio/video from browser, streams to backend
- **Backend**: Python WebSocket proxy — handles Google Cloud auth, proxies messages to Vertex AI
- **API**: Gemini 2.0 Flash Live via Vertex AI WebSocket endpoint

## Features

- 🎙️ Real-time voice conversation with Gemini
- 📷 Camera and screen sharing support
- 📝 Input/output transcription
- 🔧 Function calling support
- 🔍 Google Search grounding
- ⚙️ Configurable voice, temperature, and activity detection

## Prerequisites

- Python 3.9+
- A Google Cloud project with Vertex AI API enabled
- A service account key with Vertex AI permissions

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/jw782cn/gemini-live-demo.git
cd gemini-live-demo
pip install -r requirements.txt
```

### 2. Configure credentials

```bash
cp .env.example .env

# Option A: Service account (recommended for server deployment)
# Place your service account JSON in a safe location
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account.json
export GOOGLE_CLOUD_PROJECT=your-project-id

# Option B: gcloud CLI (for local development)
gcloud auth application-default login
```

### 3. Test connectivity

```bash
python test_connection.py
```

You should see:
```
=== Gemini Live API Connection Test ===

[1/5] Authenticating...
  ✅ Access token obtained
...
[5/5] Waiting for Gemini response...
  ✅ Response received!

🎉 All tests passed! End-to-end connectivity verified.
```

### 4. Run the server

```bash
python server.py
```

Open http://localhost:8000 in your browser (Chrome recommended for microphone access).

## Project Structure

```
├── server.py              # Python WebSocket proxy server + static file server
├── test_connection.py     # End-to-end connectivity test script
├── requirements.txt       # Python dependencies
├── .env.example           # Environment variable template
├── frontend/
│   ├── index.html         # Main UI
│   ├── script.js          # UI logic and event handling
│   ├── geminilive.js      # Gemini Live API client library
│   ├── mediaUtils.js      # Audio/video capture utilities
│   ├── tools.js           # Function calling definitions
│   └── audio-processors/  # Web Audio API worklets
└── README.md
```

## How It Works

1. Browser connects to the Python proxy via WebSocket (ws://localhost:8080)
2. Proxy authenticates with Google Cloud using service account / default credentials
3. Proxy establishes a WebSocket connection to Vertex AI's Live API endpoint
4. Messages are bidirectionally proxied between browser and Vertex AI
5. Frontend handles audio capture/playback, camera capture, and UI

## Credits

Based on [Google Cloud's Multimodal Live API demo](https://github.com/GoogleCloudPlatform/generative-ai/tree/main/gemini/multimodal-live-api/native-audio-websocket-demo-apps/plain-js-demo-app).

## License

Apache 2.0
