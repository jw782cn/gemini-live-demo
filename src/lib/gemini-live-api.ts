import {
  ResponseType,
  type ParsedResponse,
  type TranscriptionData,
  type FunctionCallData,
  type GeminiConfig,
  type ToolDefinition,
} from "../types";

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

export function parseResponse(data: Record<string, unknown>): ParsedResponse {
  const result: ParsedResponse = { type: "", data: "", endOfTurn: false };

  const serverContent = data.serverContent as Record<string, unknown> | undefined;
  result.endOfTurn = !!(serverContent?.turnComplete);

  const modelTurn = serverContent?.modelTurn as Record<string, unknown> | undefined;
  const parts = modelTurn?.parts as Array<Record<string, unknown>> | undefined;

  if (data.setupComplete) {
    result.type = ResponseType.SETUP_COMPLETE;
  } else if (serverContent?.turnComplete) {
    result.type = ResponseType.TURN_COMPLETE;
  } else if (serverContent?.interrupted) {
    result.type = ResponseType.INTERRUPTED;
  } else if (serverContent?.inputTranscription) {
    const t = serverContent.inputTranscription as Record<string, unknown>;
    result.type = ResponseType.INPUT_TRANSCRIPTION;
    result.data = {
      text: (t.text as string) ?? "",
      finished: !!(t.finished),
    } satisfies TranscriptionData;
  } else if (serverContent?.outputTranscription) {
    const t = serverContent.outputTranscription as Record<string, unknown>;
    result.type = ResponseType.OUTPUT_TRANSCRIPTION;
    result.data = {
      text: (t.text as string) ?? "",
      finished: !!(t.finished),
    } satisfies TranscriptionData;
  } else if (data.toolCall) {
    result.type = ResponseType.TOOL_CALL;
    result.data = data.toolCall as FunctionCallData;
  } else if (parts?.length && parts[0].text) {
    result.type = ResponseType.TEXT;
    result.data = parts[0].text as string;
  } else if (parts?.length && parts[0].inlineData) {
    result.type = ResponseType.AUDIO;
    result.data = (parts[0].inlineData as Record<string, unknown>).data as string;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tool (function call) definitions
// ---------------------------------------------------------------------------

export class FunctionCallDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiredParameters: string[];

  constructor(
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    requiredParameters: string[],
  ) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.requiredParameters = requiredParameters;
  }

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: { required: this.requiredParameters, ...this.parameters },
    };
  }

  run(params: Record<string, unknown>): void {
    console.log(`Running ${this.name}`, params);
  }
}

export class ShowAlertTool extends FunctionCallDefinition {
  constructor() {
    super(
      "show_alert",
      "Displays an alert dialog box with a message to the user",
      {
        type: "object",
        properties: {
          message: { type: "string", description: "The message to display in the alert box" },
          title: { type: "string", description: "Optional title prefix for the alert message" },
        },
      },
      ["message"],
    );
  }

  run(params: Record<string, unknown>) {
    const message = (params.message as string) || "Alert!";
    const title = params.title as string | undefined;
    alert(title ? `${title}: ${message}` : message);
  }
}

export class AddCSSStyleTool extends FunctionCallDefinition {
  constructor() {
    super(
      "add_css_style",
      "Injects CSS styles into the current page with !important flag",
      {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector to target elements" },
          property: { type: "string", description: "CSS property to set" },
          value: { type: "string", description: "Value for the CSS property" },
          styleId: { type: "string", description: "Optional ID for the style element" },
        },
      },
      ["selector", "property", "value"],
    );
  }

  run(params: Record<string, unknown>) {
    const { selector, property, value, styleId } = params as {
      selector: string;
      property: string;
      value: string;
      styleId?: string;
    };

    let el: HTMLStyleElement | null = null;
    if (styleId) {
      el = document.getElementById(styleId) as HTMLStyleElement | null;
    }
    if (!el) {
      el = document.createElement("style");
      if (styleId) el.id = styleId;
      document.head.appendChild(el);
    }

    const rule = `${selector} { ${property}: ${value} !important; }`;
    el.textContent = styleId ? rule : (el.textContent ?? "") + rule;
  }
}

// ---------------------------------------------------------------------------
// Main API client
// ---------------------------------------------------------------------------

export type ResponseCallback = (msg: ParsedResponse) => void;
export type ErrorCallback = (msg: string) => void;
export type VoidCallback = () => void;

export class GeminiLiveAPI {
  private ws: WebSocket | null = null;
  private config: GeminiConfig;
  private functions: FunctionCallDefinition[] = [];
  private functionsMap: Record<string, FunctionCallDefinition> = {};

  connected = false;
  lastSetupMessage: Record<string, unknown> | null = null;

  onReceiveResponse: ResponseCallback = () => {};
  onConnectionStarted: VoidCallback = () => {};
  onErrorMessage: ErrorCallback = (msg) => alert(msg);
  onClose: VoidCallback = () => {};

  constructor(config: GeminiConfig) {
    this.config = config;
  }

  // ---- tool management ----

  addFunction(fn: FunctionCallDefinition) {
    this.functions.push(fn);
    this.functionsMap[fn.name] = fn;
  }

  callFunction(name: string, params: Record<string, unknown>) {
    this.functionsMap[name]?.run(params);
  }

  // ---- connection ----

  connect() {
    const { proxyUrl } = this.config;
    this.ws = new WebSocket(proxyUrl);

    this.ws.onopen = () => {
      this.connected = true;
      this.sendInitialSetup();
      this.onConnectionStarted();
    };

    this.ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data as string);
      this.onReceiveResponse(parseResponse(data));
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.onClose();
    };

    this.ws.onerror = () => {
      this.connected = false;
      this.onErrorMessage("Connection error");
    };
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  // ---- messaging ----

  send(message: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendText(text: string) {
    this.send({ realtime_input: { text } });
  }

  sendToolResponse(toolCallId: string, response: unknown) {
    this.send({ tool_response: { id: toolCallId, response } });
  }

  sendAudio(base64PCM: string) {
    this.send({
      realtime_input: { audio: { mime_type: "audio/pcm", data: base64PCM } },
    });
  }

  sendImage(base64Image: string, mimeType = "image/jpeg") {
    this.send({
      realtime_input: { video: { mime_type: mimeType, data: base64Image } },
    });
  }

  // ---- setup ----

  private get modelUri() {
    const { model, projectId, useGoogleAI } = this.config;
    return useGoogleAI
      ? `models/${model}`
      : `projects/${projectId}/locations/us-central1/publishers/google/models/${model}`;
  }

  private get serviceUrl() {
    const { useGoogleAI } = this.config;
    const host = useGoogleAI
      ? "generativelanguage.googleapis.com"
      : "us-central1-aiplatform.googleapis.com";
    const path = useGoogleAI
      ? "ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
      : "ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent";
    return `wss://${host}/${path}`;
  }

  private sendInitialSetup() {
    this.send({ service_url: this.serviceUrl });

    const sessionConfig: Record<string, unknown> = {
      model: this.modelUri,
      generation_config: {
        response_modalities: this.config.responseModalities,
        temperature: this.config.temperature,
        speech_config: {
          voice_config: {
            prebuilt_voice_config: { voice_name: this.config.voiceName },
          },
        },
      },
      system_instruction: {
        parts: [{ text: this.config.systemInstructions }],
      },
      realtime_input_config: {
        automatic_activity_detection: {
          disabled: this.config.automaticActivityDetection.disabled,
        },
      },
    };

    if (this.functions.length > 0) {
      sessionConfig.tools = {
        function_declarations: this.functions.map((f) => f.getDefinition()),
      };
    }
    if (this.config.enableAffectiveDialog) {
      (sessionConfig.generation_config as Record<string, unknown>).enable_affective_dialog = true;
    }
    if (this.config.proactivity.proactiveAudio) {
      sessionConfig.proactivity = this.config.proactivity;
    }
    if (this.config.inputAudioTranscription) {
      sessionConfig.input_audio_transcription = {};
    }
    if (this.config.outputAudioTranscription) {
      sessionConfig.output_audio_transcription = {};
    }

    const setup = { setup: sessionConfig };

    if (this.config.googleGrounding) {
      sessionConfig.tools = { google_search: {} };
    }

    this.lastSetupMessage = setup;
    this.send(setup);
  }
}
