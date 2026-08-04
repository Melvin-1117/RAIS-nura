import { getDefaultApiBaseUrl } from '../utils/network';

const getBackendUrl = (apiBaseUrl?: string): string => {
  if (apiBaseUrl && apiBaseUrl.trim().length > 0) {
    return apiBaseUrl.replace(/\/$/, '');
  }
  const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
  const url =
    extra?.BACKEND_URL ||
    process.env.EXPO_PUBLIC_BACKEND_URL ||
    getDefaultApiBaseUrl();
  return url.replace(/\/$/, '');
};

const getBackendWsUrl = (apiBaseUrl?: string): string => {
  const httpUrl = getBackendUrl(apiBaseUrl);
  const wsUrl = httpUrl.replace(/^http/, 'ws');
  return `${wsUrl}/api/live/ws`;
};

const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async <T>(operation: () => Promise<T>, retries = MAX_RETRIES): Promise<T> => {
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < retries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt >= retries) {
        break;
      }

      const delay = 400 * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError;
};

const normalizeSpeaker = (speaker: string | undefined, known: string[]): 'A' | 'B' | 'Unknown' => {
  if (!speaker) {
    return 'Unknown';
  }

  if (!known.includes(speaker)) {
    known.push(speaker);
  }

  const idx = known.indexOf(speaker);
  if (idx === 0) {
    return 'A';
  }
  if (idx === 1) {
    return 'B';
  }
  return 'Unknown';
};

export const transcribeFileWithDiarization = async (fileUri: string): Promise<TranscriptEntry[]> => {
  const backendUrl = getBackendUrl();
  const knownSpeakers: string[] = [];

  return withRetry(async () => {
    const fileResponse = await fetch(fileUri);
    const blob = await fileResponse.blob();

    const formData = new FormData();
    const filename = fileUri.split('/').pop() || 'recording.wav';
    formData.append('file', blob as any, filename);

    const response = await fetch(`${backendUrl}/api/diarize`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Local transcription failed (${response.status}): ${errText || 'Server Error'}`);
    }

    const payload = await response.json();
    const utterances = payload.utterances || [];

    return utterances.map((utterance: any, index: number) => ({
      id: `local-utterance-${index}`,
      speaker: normalizeSpeaker(utterance.speaker_display || utterance.speaker, knownSpeakers),
      text: utterance.text || '',
      startTime: utterance.start || 0,
      endTime: utterance.end || utterance.start || 0,
      isFinal: true,
      confidence: Math.max(0, Math.min(1, utterance.confidence ?? 0.9)),
    }));
  });
};

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type LivePayload = {
  chunk_id?: number;
  timestamp?: number;
  transcript_delta?: string;
  active_speakers?: string[];
  sound_events?: Array<{
    label: string;
    category?: string;
    confidence: number;
    start: number;
    end: number;
    distance?: string;
    distance_score?: number;
    intensity?: string;
    intensity_pct?: number;
  }>;
  intensity_pct?: number;
  connection_state?: string;
  message_type?: string;
  text?: string;
  audio_start?: number;
  audio_end?: number;
  confidence?: number;
  speaker?: string;
};

type LiveCallbacks = {
  onPartial: (entry: TranscriptEntry) => void;
  onFinal: (entry: TranscriptEntry) => void;
  onPayload?: (payload: LivePayload) => void;
  onStateChange?: (state: ConnectionState) => void;
  onError: (message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export class LocalLiveTranscriptionClient {
  private ws: WebSocket | null = null;
  private readonly callbacks: LiveCallbacks;
  private isIntentionallyClosed = false;
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 5;
  private apiBaseUrl?: string;

  constructor(callbacks: LiveCallbacks, apiBaseUrl?: string) {
    this.callbacks = callbacks;
    this.apiBaseUrl = apiBaseUrl;
  }

  connect() {
    const url = getBackendWsUrl(this.apiBaseUrl);
    this.isIntentionallyClosed = false;
    this.callbacks.onStateChange?.(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.callbacks.onStateChange?.('connected');
        this.callbacks.onOpen?.();
      };

      this.ws.onclose = () => {
        this.callbacks.onClose?.();

        // Auto-reconnect with exponential backoff on drop
        if (!this.isIntentionallyClosed && this.reconnectAttempt < this.maxReconnectAttempts) {
          this.reconnectAttempt += 1;
          this.callbacks.onStateChange?.('reconnecting');
          const delay = Math.min(5000, 1000 * 2 ** (this.reconnectAttempt - 1));
          setTimeout(() => {
            if (!this.isIntentionallyClosed) {
              this.connect();
            }
          }, delay);
        } else {
          this.callbacks.onStateChange?.('disconnected');
        }
      };

      this.ws.onerror = () => {
        this.callbacks.onError('Local live transcription WebSocket error');
      };

      this.ws.onmessage = (event) => {
        try {
          const payload: LivePayload = JSON.parse(event.data as string);

          if (payload.message_type === 'Error') {
            this.callbacks.onError((payload as any).error || 'Local live transcription error');
            return;
          }

          // Callback with full M8 payload
          this.callbacks.onPayload?.(payload);

          const text = payload.transcript_delta || payload.text || '';
          if (text) {
            const finalMsg: TranscriptEntry = {
              id: `final-${payload.audio_start || Date.now()}`,
              speaker: (payload.speaker as any) || (payload.active_speakers?.[0] || 'A'),
              text: text,
              startTime: payload.audio_start || 0,
              endTime: payload.audio_end || 0,
              isFinal: true,
              confidence: payload.confidence || 0.9,
            };
            this.callbacks.onFinal(finalMsg);
          }
        } catch {
          this.callbacks.onError('Failed to parse live transcript message');
        }
      };
    } catch (err: any) {
      this.callbacks.onError(err?.message || 'WebSocket initialization failed');
      this.callbacks.onStateChange?.('disconnected');
    }
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  sendChunk(chunk: Uint8Array) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(chunk.buffer);
  }

  close() {
    this.isIntentionallyClosed = true;
    this.ws?.close();
    this.ws = null;
    this.callbacks.onStateChange?.('disconnected');
  }
}
