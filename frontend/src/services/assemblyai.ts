import Constants from 'expo-constants';

import {
  AssemblyAIFinalMessage,
  AssemblyAILiveMessage,
  AssemblyAIPartialMessage,
  AssemblyAITranscriptResponse,
  TranscriptEntry,
} from '../types/transcript';

const BASE_URL = 'https://api.assemblyai.com/v2';
const LIVE_WS_URL = 'wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000';

const MAX_RETRIES = 3;

const getApiKey = (): string => {
  const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
  const valueFromExtra =
    extra?.ASSEMBLYAI_API_KEY ||
    extra?.assemblyAiApiKey;

  const valueFromEnv =
    process.env.EXPO_PUBLIC_ASSEMBLYAI_API_KEY ||
    process.env.ASSEMBLYAI_API_KEY;

  const apiKey = (valueFromExtra || valueFromEnv || '').trim();

  if (!apiKey) {
    throw new Error(
      'Missing AssemblyAI API key. Set EXPO_PUBLIC_ASSEMBLYAI_API_KEY or ASSEMBLYAI_API_KEY.'
    );
  }

  return apiKey;
};

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

const mean = (values: number[]): number => {
  if (values.length === 0) {
    return 0.8;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const uploadAudioToAssemblyAI = async (fileUri: string): Promise<string> => {
  const apiKey = getApiKey();

  return withRetry(async () => {
    const fileResponse = await fetch(fileUri);
    const blob = await fileResponse.blob();

    const uploadResponse = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'content-type': 'application/octet-stream',
      },
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed (${uploadResponse.status})`);
    }

    const uploadJson = (await uploadResponse.json()) as { upload_url?: string };
    if (!uploadJson.upload_url) {
      throw new Error('Upload succeeded but upload_url is missing');
    }

    return uploadJson.upload_url;
  });
};

export const requestTranscript = async (audioUrl: string): Promise<string> => {
  const apiKey = getApiKey();

  return withRetry(async () => {
    const response = await fetch(`${BASE_URL}/transcript`, {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Transcript request failed (${response.status})`);
    }

    const json = (await response.json()) as AssemblyAITranscriptResponse;
    if (!json.id) {
      throw new Error('Transcript request returned no transcript id');
    }

    return json.id;
  });
};

export const pollTranscriptUntilComplete = async (transcriptId: string): Promise<TranscriptEntry[]> => {
  const apiKey = getApiKey();
  const maxPolls = 120;
  const pollDelayMs = 2000;
  const knownSpeakers: string[] = [];

  for (let i = 0; i < maxPolls; i += 1) {
    const response = await withRetry(async () => {
      const r = await fetch(`${BASE_URL}/transcript/${transcriptId}`, {
        method: 'GET',
        headers: {
          authorization: apiKey,
        },
      });

      if (!r.ok) {
        throw new Error(`Polling failed (${r.status})`);
      }

      return r;
    });

    const payload = (await response.json()) as AssemblyAITranscriptResponse;

    if (payload.status === 'error') {
      throw new Error(payload.error || 'AssemblyAI transcript processing failed');
    }

    if (payload.status === 'completed') {
      const utterances = payload.utterances ?? [];
      return utterances.map((utterance, index) => ({
        id: `${transcriptId}-${index}`,
        speaker: normalizeSpeaker(utterance.speaker, knownSpeakers),
        text: utterance.text || '',
        startTime: utterance.start || 0,
        endTime: utterance.end || utterance.start || 0,
        isFinal: true,
        confidence: Math.max(0, Math.min(1, utterance.confidence ?? 0.8)),
      }));
    }

    await sleep(pollDelayMs);
  }

  throw new Error('Transcription timed out. Please try a shorter file or retry.');
};

export const transcribeFileWithDiarization = async (fileUri: string): Promise<TranscriptEntry[]> => {
  try {
    const uploadUrl = await uploadAudioToAssemblyAI(fileUri);
    const transcriptId = await requestTranscript(uploadUrl);
    return await pollTranscriptUntilComplete(transcriptId);
  } catch (error: any) {
    throw new Error(error?.message || 'Failed to transcribe audio file');
  }
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
    const apiKey = getApiKey();
    const url = `${LIVE_WS_URL}&token=${encodeURIComponent(apiKey)}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.callbacks.onOpen?.();
    };

    this.ws.onclose = () => {
      this.callbacks.onClose?.();
    };

    this.ws.onerror = () => {
      this.callbacks.onError('Live transcription WebSocket error');
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as AssemblyAILiveMessage;

        if (payload.message_type === 'Error') {
          this.callbacks.onError(payload.error || 'AssemblyAI live transcription error');
          return;
        }

        if (payload.message_type === 'PartialTranscript') {
          const partial = this.mapPartialMessage(payload);
          this.callbacks.onPartial(partial);
          return;
        }

        if (payload.message_type === 'FinalTranscript') {
          const finalMsg = this.mapFinalMessage(payload);
          this.callbacks.onFinal(finalMsg);
        }
      } catch {
        this.callbacks.onError('Failed to parse live transcript message');
      }
    };
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

  private mapPartialMessage(message: AssemblyAIPartialMessage): TranscriptEntry {
    return {
      id: `partial-${message.audio_start}`,
      speaker: 'Unknown',
      text: message.text || '',
      startTime: message.audio_start || 0,
      endTime: message.audio_end || message.audio_start || 0,
      isFinal: false,
      confidence: Math.max(0, Math.min(1, message.confidence ?? 0.7)),
    };
  }

  private mapFinalMessage(message: AssemblyAIFinalMessage): TranscriptEntry {
    const confidenceValues = (message.words || [])
      .map((word) => word.confidence ?? 0)
      .filter((value) => value > 0);

    return {
      id: `final-${message.audio_start}-${Date.now()}`,
      speaker: 'Unknown',
      text: message.text || '',
      startTime: message.audio_start || 0,
      endTime: message.audio_end || message.audio_start || 0,
      isFinal: true,
      confidence: Math.max(0, Math.min(1, message.confidence ?? mean(confidenceValues))),
    };
  }
}
