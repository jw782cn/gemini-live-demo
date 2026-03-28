import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import https from "node:https";
import { generateAccessToken } from "./auth.js";

const WS_PORT = parseInt(process.env.WS_PORT ?? "8080", 10);
const DEBUG = ["1", "true", "yes"].includes(
  (process.env.DEBUG ?? "").toLowerCase(),
);

interface SetupMessage {
  service_url?: string;
  bearer_token?: string;
}

function proxyMessages(
  source: WebSocket,
  destination: WebSocket,
  label: string,
) {
  source.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (DEBUG) {
        console.log(
          `Proxying from ${label}: ${JSON.stringify(data).slice(0, 200)}`,
        );
      }
      destination.send(JSON.stringify(data));
    } catch (err) {
      console.error(`Error processing message from ${label}:`, err);
    }
  });
}

async function connectToGemini(
  clientWs: WebSocket,
  bearerToken: string,
  serviceUrl: string,
) {
  console.log(`Connecting to Gemini API: ${serviceUrl.slice(0, 80)}...`);

  const upstream = new WebSocket(serviceUrl, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
    agent: serviceUrl.startsWith("wss://")
      ? new https.Agent({ rejectUnauthorized: true })
      : undefined,
  });

  upstream.on("open", () => {
    console.log("Connected to Gemini API");
    proxyMessages(clientWs, upstream, "client");
    proxyMessages(upstream, clientWs, "server");
  });

  upstream.on("close", (code, reason) => {
    console.log(
      `Server connection closed: ${code} - ${reason.toString()}`,
    );
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason.toString());
    }
  });

  upstream.on("error", (err) => {
    console.error("Failed to connect to Gemini API:", err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1008, "Upstream connection failed");
    }
  });

  clientWs.on("close", () => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.close();
    }
  });
}

async function handleClient(clientWs: WebSocket) {
  console.log("New WebSocket client connection...");

  const timeout = setTimeout(() => {
    console.log("Timeout waiting for first message from client");
    clientWs.close(1008, "Timeout");
  }, 10_000);

  clientWs.once("message", async (raw) => {
    clearTimeout(timeout);

    try {
      const msg: SetupMessage = JSON.parse(raw.toString());
      let { bearer_token: bearerToken, service_url: serviceUrl } = msg;

      if (!bearerToken) {
        console.log("Generating access token...");
        bearerToken = (await generateAccessToken()) ?? undefined;
        if (!bearerToken) {
          console.error("Failed to generate access token");
          clientWs.close(1008, "Authentication failed");
          return;
        }
        console.log("Access token generated");
      }

      if (!serviceUrl) {
        console.error("Error: Service URL is missing");
        clientWs.close(1008, "Service URL is required");
        return;
      }

      await connectToGemini(clientWs, bearerToken, serviceUrl);
    } catch (err) {
      console.error("Error handling client:", err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1011, "Internal error");
      }
    }
  });
}

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", handleClient);

console.log(`\n  WebSocket proxy running on ws://localhost:${WS_PORT}\n`);
