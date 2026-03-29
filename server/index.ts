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

async function handleClient(clientWs: WebSocket) {
  console.log("New WebSocket client connection...");

  const pending: string[] = [];
  let upstream: WebSocket | null = null;

  clientWs.on("message", (raw) => {
    const msg = raw.toString();
    if (DEBUG) console.log(`client → upstream: ${msg.slice(0, 200)}`);

    if (upstream && upstream.readyState === WebSocket.OPEN) {
      upstream.send(msg);
      return;
    }

    pending.push(msg);

    if (pending.length === 1) {
      bootstrapUpstream(msg);
    }
  });

  async function bootstrapUpstream(firstRaw: string) {
    try {
      const first: SetupMessage = JSON.parse(firstRaw);
      let bearerToken = first.bearer_token;
      const serviceUrl = first.service_url;

      if (!serviceUrl) {
        console.error("Error: Service URL is missing");
        clientWs.close(1008, "Service URL is required");
        return;
      }

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

      console.log(`Connecting to Gemini API: ${serviceUrl.slice(0, 80)}...`);

      upstream = new WebSocket(serviceUrl, {
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
        // Flush everything EXCEPT the first message (service_url — proxy-only)
        for (let i = 1; i < pending.length; i++) {
          if (DEBUG) console.log(`client → upstream (buffered): ${pending[i].slice(0, 200)}`);
          upstream!.send(pending[i]);
        }
        pending.length = 0;
      });

      upstream.on("message", (raw) => {
        const msg = raw.toString();
        if (DEBUG) console.log(`upstream → client: ${msg.slice(0, 200)}`);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(msg);
        }
      });

      upstream.on("close", (code, reason) => {
        console.log(`Server connection closed: ${code} - ${reason.toString()}`);
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
    } catch (err) {
      console.error("Error handling client:", err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1011, "Internal error");
      }
    }
  }

  clientWs.on("close", () => {
    if (upstream && upstream.readyState === WebSocket.OPEN) {
      upstream.close();
    }
  });
}

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", handleClient);

console.log(`\n  WebSocket proxy running on ws://localhost:${WS_PORT}\n`);
