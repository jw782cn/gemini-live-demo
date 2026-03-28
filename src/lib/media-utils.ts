import type { GeminiLiveAPI } from "./gemini-live-api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function float32ToPCM16(float32: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    int16[i] = Math.max(-1, Math.min(1, float32[i])) * 0x7fff;
  }
  return int16.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// ---------------------------------------------------------------------------
// AudioStreamer – captures mic audio and sends to Gemini
// ---------------------------------------------------------------------------

export class AudioStreamer {
  private client: GeminiLiveAPI;
  private audioContext: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private _streaming = false;
  private readonly sampleRate = 16_000;

  onVolume: ((level: number) => void) | null = null;

  constructor(client: GeminiLiveAPI) {
    this.client = client;
  }

  get isStreaming() {
    return this._streaming;
  }

  async start(deviceId?: string) {
    const constraints: MediaTrackConstraints = {
      sampleRate: this.sampleRate,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (deviceId) constraints.deviceId = { exact: deviceId };

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });

    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    await this.audioContext.audioWorklet.addModule("/audio-processors/capture.worklet.js");

    this.worklet = new AudioWorkletNode(this.audioContext, "audio-capture-processor");
    this.worklet.port.onmessage = (evt: MessageEvent) => {
      if (!this._streaming) return;
      if (evt.data.type === "audio") {
        const samples = evt.data.data as Float32Array;

        // RMS volume (0–1)
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        const rms = Math.sqrt(sum / samples.length);
        const level = Math.min(1, rms / 0.25);
        this.onVolume?.(level);

        const pcm = float32ToPCM16(samples);
        const b64 = arrayBufferToBase64(pcm);
        if (this.client.connected) this.client.sendAudio(b64);
      }
    };

    const source = this.audioContext.createMediaStreamSource(this.stream);
    source.connect(this.worklet);
    this._streaming = true;
  }

  stop() {
    this._streaming = false;
    this.worklet?.disconnect();
    this.worklet?.port.close();
    this.worklet = null;
    this.audioContext?.close();
    this.audioContext = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

// ---------------------------------------------------------------------------
// BaseVideoCapture – shared camera / screen logic
// ---------------------------------------------------------------------------

class BaseVideoCapture {
  protected client: GeminiLiveAPI;
  protected video: HTMLVideoElement | null = null;
  protected canvas: HTMLCanvasElement | null = null;
  protected ctx: CanvasRenderingContext2D | null = null;
  protected stream: MediaStream | null = null;
  protected interval: ReturnType<typeof setInterval> | null = null;
  protected fps = 1;
  protected quality = 0.8;
  private _streaming = false;

  constructor(client: GeminiLiveAPI) {
    this.client = client;
  }

  get isStreaming() {
    return this._streaming;
  }

  protected init(width: number, height: number) {
    this.video = document.createElement("video");
    this.video.srcObject = this.stream;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;

    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d");
  }

  protected async waitReady() {
    await new Promise<void>((r) => {
      this.video!.onloadedmetadata = () => r();
    });
    this.video!.play();
  }

  protected startCapturing() {
    this._streaming = true;
    this.interval = setInterval(() => {
      if (!this._streaming || !this.video || !this.canvas || !this.ctx) return;
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      this.canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const reader = new FileReader();
          reader.onloadend = () => {
            const b64 = (reader.result as string).split(",")[1];
            if (this.client.connected) this.client.sendImage(b64);
          };
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        this.quality,
      );
    }, 1000 / this.fps);
  }

  stop() {
    this._streaming = false;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
  }

  getVideoElement() {
    return this.video;
  }
}

// ---------------------------------------------------------------------------
// VideoStreamer – camera
// ---------------------------------------------------------------------------

export interface VideoStartOptions {
  fps?: number;
  width?: number;
  height?: number;
  facingMode?: string;
  quality?: number;
  deviceId?: string | null;
}

export class VideoStreamer extends BaseVideoCapture {
  async start(opts: VideoStartOptions = {}) {
    const {
      fps = 1,
      width = 640,
      height = 480,
      facingMode = "user",
      quality = 0.8,
      deviceId = null,
    } = opts;
    this.fps = fps;
    this.quality = quality;

    const constraints: MediaTrackConstraints = {
      width: { ideal: width },
      height: { ideal: height },
    };
    if (deviceId) {
      constraints.deviceId = { exact: deviceId };
    } else {
      constraints.facingMode = facingMode;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
    this.init(width, height);
    await this.waitReady();
    this.startCapturing();
    return this.video!;
  }

  stop() {
    super.stop();
  }
}

// ---------------------------------------------------------------------------
// ScreenCapture
// ---------------------------------------------------------------------------

export class ScreenCapture extends BaseVideoCapture {
  async start(opts: { fps?: number; width?: number; height?: number; quality?: number } = {}) {
    const { fps = 0.5, width = 1280, height = 720, quality = 0.7 } = opts;
    this.fps = fps;
    this.quality = quality;

    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: width }, height: { ideal: height } },
      audio: false,
    });

    this.init(width, height);
    await this.waitReady();
    this.startCapturing();

    this.stream.getVideoTracks()[0].onended = () => this.stop();
    return this.video!;
  }

  stop() {
    super.stop();
  }
}

// ---------------------------------------------------------------------------
// AudioPlayer – plays Gemini audio responses
// ---------------------------------------------------------------------------

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private ready = false;
  private _volume = 0.8;
  private readonly sampleRate = 24_000;

  async init() {
    if (this.ready) return;
    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    await this.audioContext.audioWorklet.addModule("/audio-processors/playback.worklet.js");
    this.worklet = new AudioWorkletNode(this.audioContext, "pcm-processor");
    this.gain = this.audioContext.createGain();
    this.gain.gain.value = this._volume;
    this.worklet.connect(this.gain);
    this.gain.connect(this.audioContext.destination);
    this.ready = true;
  }

  async play(base64Audio: string) {
    if (!this.ready) await this.init();
    if (this.audioContext!.state === "suspended") await this.audioContext!.resume();

    const bin = atob(base64Audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const int16 = new Int16Array(bytes.buffer);
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;

    this.worklet!.port.postMessage(f32);
  }

  interrupt() {
    this.worklet?.port.postMessage("interrupt");
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.gain) this.gain.gain.value = this._volume;
  }

  destroy() {
    this.audioContext?.close();
    this.audioContext = null;
    this.ready = false;
  }
}
