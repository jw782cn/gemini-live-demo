import { useCallback, useRef, useState } from "react";
import { GeminiLiveAPI } from "../lib/gemini-live-api";
import { AudioPlayer, AudioStreamer } from "../lib/media-utils";
import {
  ResponseType,
  DEFAULT_CONFIG,
  type TranscriptionData,
  type FunctionCallData,
} from "../types";

export function useGemini() {
  const [connected, setConnected] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");

  const clientRef = useRef<GeminiLiveAPI | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const reconnectRef = useRef<(() => void) | null>(null);
  const retriesRef = useRef(0);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>();
  const MAX_RETRIES = 5;

  const showTranscript = useCallback((text: string) => {
    setTranscript(text);
    clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setTranscript(""), 4000);
  }, []);

  const connect = useCallback(async () => {
    const api = new GeminiLiveAPI({ ...DEFAULT_CONFIG });

    const player = new AudioPlayer();
    await player.init();
    playerRef.current = player;

    api.onReceiveResponse = (msg) => {
      switch (msg.type) {
        case ResponseType.AUDIO:
          setSpeaking(true);
          player.play(msg.data as string);
          break;
        case ResponseType.OUTPUT_TRANSCRIPTION: {
          const t = msg.data as TranscriptionData;
          if (!t.finished) showTranscript(t.text);
          break;
        }
        case ResponseType.INPUT_TRANSCRIPTION: {
          const t = msg.data as TranscriptionData;
          if (!t.finished) showTranscript(t.text);
          break;
        }
        case ResponseType.TURN_COMPLETE:
          setSpeaking(false);
          break;
        case ResponseType.TOOL_CALL: {
          const tc = msg.data as FunctionCallData;
          tc.functionCalls.forEach((fc) => api.callFunction(fc.name, fc.args));
          break;
        }
        case ResponseType.INTERRUPTED:
          setSpeaking(false);
          player.interrupt();
          break;
      }
    };

    api.onConnectionStarted = () => {
      retriesRef.current = 0;
      setConnected(true);
    };

    api.onClose = () => {
      setConnected(false);
      setSpeaking(false);
      setMicActive(false);
      streamerRef.current?.stop();
      streamerRef.current = null;
      if (reconnectRef.current && retriesRef.current < MAX_RETRIES) {
        retriesRef.current++;
        const delay = Math.min(2000 * Math.pow(2, retriesRef.current - 1), 16000);
        setTimeout(() => reconnectRef.current?.(), delay);
      }
    };

    api.onErrorMessage = () => setConnected(false);

    api.connect();
    clientRef.current = api;
  }, [showTranscript]);

  reconnectRef.current = connect;

  const disconnect = useCallback(() => {
    reconnectRef.current = null;
    streamerRef.current?.stop();
    streamerRef.current = null;
    clientRef.current?.disconnect();
    clientRef.current = null;
    playerRef.current?.destroy();
    playerRef.current = null;
    setConnected(false);
    setMicActive(false);
    setTranscript("");
  }, []);

  const orbRef = useRef<HTMLButtonElement | null>(null);

  const toggleMic = useCallback(async () => {
    if (!clientRef.current) return;
    if (!micActive) {
      try {
        const s = new AudioStreamer(clientRef.current);
        s.onVolume = (level) => {
          orbRef.current?.style.setProperty("--vol", String(level));
        };
        await s.start();
        streamerRef.current = s;
        setMicActive(true);
      } catch {
        /* mic access denied */
      }
    } else {
      streamerRef.current?.stop();
      streamerRef.current = null;
      setMicActive(false);
      orbRef.current?.style.setProperty("--vol", "0");
    }
  }, [micActive]);

  return { connected, micActive, speaking, transcript, connect, disconnect, toggleMic, orbRef };
}
