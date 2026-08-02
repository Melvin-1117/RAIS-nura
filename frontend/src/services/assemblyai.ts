import Constants from 'expo-constants';

import {
  AssemblyAIFinalMessage,
  AssemblyAILiveMessage,
  AssemblyAIPartialMessage,
  TranscriptEntry,
} from '../types/transcript';

const getBackendUrl = (): string => {
  const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
  const url =
    extra?.BACKEND_URL ||
    process.env.EXPO_PUBLIC_BACKEND_URL ||
    'http://localhost:8000';
  return url.replace(/\/$/, '');
};

const getBackendWsUrl = (): string => {
  const httpUrl = getBackendUrl();
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

type LiveCallbacks = {
  onPartial: (entry: TranscriptEntry) => void;
  onFinal: (entry: TranscriptEntry) => void;
  onError: (message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export class AssemblyAILiveClient {
  private ws: WebSocket | null = null;
  private readonly callbacks: LiveCallbacks;

  constructor(callbacks: LiveCallbacks) {
    this.callbacks = callbacks;
  }

  connect() {
    const url = getBackendWsUrl();

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.callbacks.onOpen?.();
      };

      this.ws.onclose = () => {
        this.callbacks.onClose?.();
      };

      this.ws.onerror = () => {
        this.callbacks.onError('Local live transcription WebSocket error');
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string);

          if (payload.message_type === 'Error') {
            this.callbacks.onError(payload.error || 'Local live transcription error');
            return;
          }

          if (payload.message_type === 'PartialTranscript') {
            const partial: TranscriptEntry = {
              id: `partial-${payload.audio_start || Date.now()}`,
              speaker: (payload.speaker as any) || 'A',
              text: payload.text || '',
              startTime: payload.audio_start || 0,
              endTime: payload.audio_end || 0,
              isFinal: false,
              confidence: payload.confidence || 0.85,
            };
            this.callbacks.onPartial(partial);
            return;
          }

          if (payload.message_type === 'FinalTranscript') {
            const finalMsg: TranscriptEntry = {
              id: `final-${payload.audio_start || Date.now()}`,
              speaker: (payload.speaker as any) || 'A',
              text: payload.text || '',
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
    this.ws?.close();
    this.ws = null;
  }
}
