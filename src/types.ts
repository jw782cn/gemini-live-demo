export enum ResponseType {
  TEXT = "TEXT",
  AUDIO = "AUDIO",
  SETUP_COMPLETE = "SETUP_COMPLETE",
  INTERRUPTED = "INTERRUPTED",
  TURN_COMPLETE = "TURN_COMPLETE",
  TOOL_CALL = "TOOL_CALL",
  INPUT_TRANSCRIPTION = "INPUT_TRANSCRIPTION",
  OUTPUT_TRANSCRIPTION = "OUTPUT_TRANSCRIPTION",
}

export interface TranscriptionData {
  text: string;
  finished: boolean;
}

export interface FunctionCallData {
  functionCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
}

export interface ParsedResponse {
  type: ResponseType | "";
  data: string | TranscriptionData | FunctionCallData | "";
  endOfTurn: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AutomaticActivityDetection {
  disabled: boolean;
  silence_duration_ms: number;
  prefix_padding_ms: number;
  end_of_speech_sensitivity: string;
  start_of_speech_sensitivity: string;
}

export interface GeminiConfig {
  proxyUrl: string;
  projectId: string;
  model: string;
  useGoogleAI: boolean;
  systemInstructions: string;
  voiceName: string;
  temperature: number;
  responseModalities: string[];
  googleGrounding: boolean;
  enableAffectiveDialog: boolean;
  proactivity: { proactiveAudio: boolean };
  inputAudioTranscription: boolean;
  outputAudioTranscription: boolean;
  automaticActivityDetection: AutomaticActivityDetection;
  activityHandling: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  type: "user" | "assistant" | "system" | "user-transcript";
}

export const DEFAULT_CONFIG: GeminiConfig = {
  proxyUrl: "ws://localhost:8080",
  projectId: "",
  model: "gemini-3.1-flash-live-preview",
  useGoogleAI: true,
  systemInstructions: "You are a helpful assistant. Be concise and friendly.",
  voiceName: "Puck",
  temperature: 1.0,
  responseModalities: ["AUDIO"],
  googleGrounding: false,
  enableAffectiveDialog: false,
  proactivity: { proactiveAudio: false },
  inputAudioTranscription: true,
  outputAudioTranscription: true,
  automaticActivityDetection: {
    disabled: false,
    silence_duration_ms: 500,
    prefix_padding_ms: 500,
    end_of_speech_sensitivity: "END_SENSITIVITY_UNSPECIFIED",
    start_of_speech_sensitivity: "START_SENSITIVITY_UNSPECIFIED",
  },
  activityHandling: "ACTIVITY_HANDLING_UNSPECIFIED",
};
