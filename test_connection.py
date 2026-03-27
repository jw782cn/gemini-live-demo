#!/usr/bin/env python3
"""
Test script to verify end-to-end connectivity with Gemini Live API.

Requirements:
  - GOOGLE_APPLICATION_CREDENTIALS env var pointing to service account JSON
  - google-auth, websockets, certifi packages installed

Tests:
  1. Load service account credentials
  2. Generate access token
  3. Establish WebSocket connection to Gemini Live API
  4. Send session setup + text message
  5. Receive Gemini audio response with transcription
"""

import asyncio
import json
import os
import ssl
import sys

import certifi
import websockets
from google.oauth2 import service_account
from google.auth.transport.requests import Request

SCOPES = [
    "https://www.googleapis.com/auth/generative-language",
    "https://www.googleapis.com/auth/cloud-platform",
]
MODEL = "gemini-2.5-flash-native-audio-latest"
WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"


def get_access_token():
    """Get access token from service account credentials."""
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path or not os.path.exists(creds_path):
        print("  ❌ GOOGLE_APPLICATION_CREDENTIALS not set or file not found")
        sys.exit(1)

    print(f"  Using service account: {creds_path}")
    creds = service_account.Credentials.from_service_account_file(
        creds_path, scopes=SCOPES
    )
    creds.refresh(Request())
    return creds.token


async def test_live_api():
    """Test the full flow: auth -> connect -> send -> receive."""
    print("\n=== Gemini Live API Connection Test ===\n")

    # Step 1: Get access token
    print("[1/5] Authenticating...")
    try:
        token = get_access_token()
        print(f"  ✅ Access token obtained (length={len(token)})")
    except Exception as e:
        print(f"  ❌ Authentication failed: {e}")
        sys.exit(1)

    # Step 2: Connect
    print(f"\n[2/5] Connecting to Gemini Live API...")
    print(f"  URL: {WS_URL}")
    print(f"  Model: {MODEL}")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    try:
        async with websockets.connect(
            WS_URL, additional_headers=headers, ssl=ssl_context
        ) as ws:
            print(f"  ✅ WebSocket connected!")

            # Step 3: Send setup message
            print(f"\n[3/5] Sending session setup...")
            setup_msg = {
                "setup": {
                    "model": f"models/{MODEL}",
                    "generation_config": {
                        "response_modalities": ["AUDIO"],
                        "speech_config": {
                            "voice_config": {
                                "prebuilt_voice_config": {"voice_name": "Puck"}
                            }
                        },
                    },
                    "output_audio_transcription": {},
                }
            }
            await ws.send(json.dumps(setup_msg))

            response = await asyncio.wait_for(ws.recv(), timeout=10)
            data = json.loads(response)
            if data.get("setupComplete") is not None:
                print(f"  ✅ Setup complete confirmed by server")
            else:
                print(f"  ⚠️  Unexpected response: {json.dumps(data)[:200]}")

            # Step 4: Send text message
            print(f"\n[4/5] Sending text message...")
            text_msg = {
                "client_content": {
                    "turns": [
                        {
                            "role": "user",
                            "parts": [{"text": "Say hello in exactly 5 words."}],
                        }
                    ],
                    "turn_complete": True,
                }
            }
            await ws.send(json.dumps(text_msg))
            print(f"  ✅ Text message sent")

            # Step 5: Receive response
            print(f"\n[5/5] Waiting for Gemini response...")
            audio_chunks = 0
            transcription = ""
            turn_complete = False

            while not turn_complete:
                response = await asyncio.wait_for(ws.recv(), timeout=15)
                data = json.loads(response)
                sc = data.get("serverContent", {})

                # Count audio chunks
                parts = sc.get("modelTurn", {}).get("parts", [])
                for part in parts:
                    if "inlineData" in part:
                        audio_chunks += 1

                # Collect transcription
                if sc.get("outputTranscription", {}).get("text"):
                    transcription += sc["outputTranscription"]["text"]

                if sc.get("turnComplete"):
                    turn_complete = True

            print(f"  ✅ Response received!")
            print(f"  Audio chunks: {audio_chunks}")
            print(f"\n{'='*50}")
            print(f"  Gemini says: \"{transcription.strip()}\"")
            print(f"{'='*50}")
            print(f"\n🎉 All tests passed! End-to-end connectivity verified.\n")

    except asyncio.TimeoutError:
        print(f"  ❌ Timeout waiting for response")
        sys.exit(1)
    except Exception as e:
        print(f"  ❌ Connection failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(test_live_api())
