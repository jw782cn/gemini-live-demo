#!/usr/bin/env python3
"""WebSocket Proxy Server for Gemini Live API with Static File Serving.

Handles authentication via Google service account, proxies WebSocket connections
between browser client and Gemini Live API, and serves the web frontend.

Supports two backends:
  - Google AI (generativelanguage.googleapis.com) - default, works with service account
  - Vertex AI (aiplatform.googleapis.com) - requires Vertex AI Live API enabled

Authentication: Service account JSON via GOOGLE_APPLICATION_CREDENTIALS env var,
or gcloud application-default credentials.
"""

import asyncio
import json
import mimetypes
import os
import ssl

import certifi
import google.auth
import websockets
from aiohttp import web
from google.auth.transport.requests import Request
from google.oauth2 import service_account
from websockets.exceptions import ConnectionClosed
from websockets.legacy.protocol import WebSocketCommonProtocol
from websockets.legacy.server import WebSocketServerProtocol

DEBUG = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")
HTTP_PORT = int(os.environ.get("HTTP_PORT", 8000))
WS_PORT = int(os.environ.get("WS_PORT", 8080))

SCOPES = [
    "https://www.googleapis.com/auth/generative-language",
    "https://www.googleapis.com/auth/cloud-platform",
]


def generate_access_token():
    """Retrieves an access token using service account or default credentials."""
    try:
        creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if creds_path and os.path.exists(creds_path):
            creds = service_account.Credentials.from_service_account_file(
                creds_path, scopes=SCOPES
            )
        else:
            creds, _ = google.auth.default(scopes=SCOPES)

        if not creds.valid:
            creds.refresh(Request())
        return creds.token
    except Exception as e:
        print(f"Error generating access token: {e}")
        print("Make sure GOOGLE_APPLICATION_CREDENTIALS is set or run: gcloud auth application-default login")
        return None


async def proxy_task(
    source_websocket: WebSocketCommonProtocol,
    destination_websocket: WebSocketCommonProtocol,
    is_server: bool,
) -> None:
    """Forwards messages between WebSocket connections."""
    try:
        async for message in source_websocket:
            try:
                data = json.loads(message)
                if DEBUG:
                    print(f"Proxying from {'server' if is_server else 'client'}: {str(data)[:200]}")
                await destination_websocket.send(json.dumps(data))
            except Exception as e:
                print(f"Error processing message: {e}")
    except ConnectionClosed as e:
        print(f"{'Server' if is_server else 'Client'} connection closed: {e.code} - {e.reason}")
    except Exception as e:
        print(f"Unexpected error in proxy_task: {e}")
    finally:
        await destination_websocket.close()


async def create_proxy(
    client_websocket: WebSocketCommonProtocol, bearer_token: str, service_url: str
) -> None:
    """Establishes a WebSocket connection to Gemini and creates bidirectional proxy."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    print(f"Connecting to Gemini API: {service_url[:80]}...")

    try:
        async with websockets.connect(
            service_url, additional_headers=headers, ssl=ssl_context
        ) as server_websocket:
            print("✅ Connected to Gemini API")

            client_to_server_task = asyncio.create_task(
                proxy_task(client_websocket, server_websocket, is_server=False)
            )
            server_to_client_task = asyncio.create_task(
                proxy_task(server_websocket, client_websocket, is_server=True)
            )

            done, pending = await asyncio.wait(
                [client_to_server_task, server_to_client_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            try:
                await server_websocket.close()
            except Exception:
                pass
            try:
                await client_websocket.close()
            except Exception:
                pass

    except ConnectionClosed as e:
        print(f"Server connection closed: {e.code} - {e.reason}")
        if not client_websocket.closed:
            await client_websocket.close(code=e.code, reason=e.reason)
    except Exception as e:
        print(f"Failed to connect to Gemini API: {e}")
        if not client_websocket.closed:
            await client_websocket.close(code=1008, reason="Upstream connection failed")


async def handle_websocket_client(client_websocket: WebSocketServerProtocol) -> None:
    """Handles a new WebSocket client connection.

    Expects first message with optional bearer_token and service_url.
    If no bearer_token provided, generates one using credentials.
    """
    print("🔌 New WebSocket client connection...")
    try:
        service_setup_message = await asyncio.wait_for(
            client_websocket.recv(), timeout=10.0
        )
        service_setup_message_data = json.loads(service_setup_message)

        bearer_token = service_setup_message_data.get("bearer_token")
        service_url = service_setup_message_data.get("service_url")

        if not bearer_token:
            print("🔑 Generating access token...")
            bearer_token = generate_access_token()
            if not bearer_token:
                print("❌ Failed to generate access token")
                await client_websocket.close(code=1008, reason="Authentication failed")
                return
            print("✅ Access token generated")

        if not service_url:
            print("❌ Error: Service URL is missing")
            await client_websocket.close(code=1008, reason="Service URL is required")
            return

        await create_proxy(client_websocket, bearer_token, service_url)

    except asyncio.TimeoutError:
        print("⏱️ Timeout waiting for the first message from the client")
        await client_websocket.close(code=1008, reason="Timeout")
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in first message: {e}")
        await client_websocket.close(code=1008, reason="Invalid JSON")
    except Exception as e:
        print(f"❌ Error handling client: {e}")
        if not client_websocket.closed:
            await client_websocket.close(code=1011, reason="Internal error")


async def serve_static_file(request):
    """Serve static files from the frontend directory."""
    path = request.match_info.get("path", "index.html")
    path = path.lstrip("/")
    if ".." in path:
        return web.Response(text="Invalid path", status=400)
    if not path or path == "/":
        path = "index.html"

    frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
    file_path = os.path.join(frontend_dir, path)

    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        return web.Response(text="File not found", status=404)

    content_type, _ = mimetypes.guess_type(file_path)
    if content_type is None:
        content_type = "application/octet-stream"

    try:
        with open(file_path, "rb") as f:
            content = f.read()
        return web.Response(body=content, content_type=content_type)
    except Exception as e:
        print(f"Error serving file {path}: {e}")
        return web.Response(text="Internal server error", status=500)


async def start_http_server():
    """Start the HTTP server for serving static files."""
    app = web.Application()
    app.router.add_get("/", serve_static_file)
    app.router.add_get("/{path:.*}", serve_static_file)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", HTTP_PORT)
    await site.start()
    print(f"🌐 HTTP server running on http://localhost:{HTTP_PORT}")


async def start_websocket_server():
    """Start the WebSocket proxy server."""
    async with websockets.serve(handle_websocket_client, "0.0.0.0", WS_PORT):
        print(f"🔌 WebSocket proxy running on ws://localhost:{WS_PORT}")
        await asyncio.Future()


async def main():
    """Starts both HTTP and WebSocket servers."""
    print(f"""
╔════════════════════════════════════════════════════════════╗
║     Gemini Live API - Voice & Vision Agent Demo           ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  📱 Web Interface:   http://localhost:{HTTP_PORT:<5}                  ║
║  🔌 WebSocket Proxy: ws://localhost:{WS_PORT:<5}                   ║
║                                                            ║
║  Auth: Service account (GOOGLE_APPLICATION_CREDENTIALS)   ║
║    or: gcloud auth application-default login              ║
║                                                            ║
║  Open the web interface and click Connect to start!       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
""")
    await asyncio.gather(start_http_server(), start_websocket_server())


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Servers stopped")
