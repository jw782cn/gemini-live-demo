import { useEffect, useRef } from "react";
import { useGemini } from "./hooks/useGemini";

export default function App() {
  const { connected, micActive, speaking, connect, disconnect, toggleMic, transcript, orbRef } =
    useGemini();

  const didConnect = useRef(false);
  useEffect(() => {
    if (!didConnect.current) {
      didConnect.current = true;
      connect();
    }
  }, [connect]);

  const status = !connected
    ? "Connecting..."
    : speaking
      ? "Speaking..."
      : micActive
        ? "Listening..."
        : "Tap to speak";

  return (
    <div className="app">
      {/* Giant center orb */}
      <main className="stage">
        <button
          ref={orbRef}
          className={`orb ${speaking ? "speaking" : micActive ? "active" : ""} ${connected ? "ready" : "offline"}`}
          onClick={toggleMic}
          disabled={!connected}
          aria-label={micActive ? "Stop" : "Speak"}
        >
          <div className="orb-ring" />
          <div className="orb-ring r2" />
          <svg className="orb-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
            <path d="M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V20H8v2h8v-2h-3v-2.07A7 7 0 0 0 19 11h-2z" />
          </svg>
        </button>

        <p className="status">{status}</p>

        {transcript && (
          <p className="transcript">{transcript}</p>
        )}
      </main>

      {/* Minimal bottom bar */}
      <footer className="bar">
        <span className="brand">Gemini Live</span>
        <button className="bar-btn" onClick={connected ? disconnect : connect}>
          {connected ? "Disconnect" : "Reconnect"}
        </button>
      </footer>
    </div>
  );
}
