import {
  AudioModule,
  AudioQuality,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { Platform } from 'react-native';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  ConnectionState,
  LivePayload,
  LocalLiveTranscriptionClient,
  transcribeFileWithDiarization,
} from '../services/liveTranscriptionClient';
import { useTranscriptStore } from '../store/transcriptStore';
import { TranscriptEntry } from '../types/transcript';

const CHUNK_DURATION_MS = 2000;

const estimateChunkEnergy = (buffer: Uint8Array): number => {
  if (buffer.byteLength < 4) {
    return 0;
  }

  let sumSquares = 0;
  let sampleCount = 0;

  const dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  for (let i = 0; i < dataView.byteLength - 1; i += 2) {
    const sample = dataView.getInt16(i, true) / 32768;
    sumSquares += sample * sample;
    sampleCount += 1;
  }

  if (sampleCount === 0) {
    return 0;
  }

  return Math.sqrt(sumSquares / sampleCount);
};

const fileUriToBytes = async (uri: string): Promise<Uint8Array> => {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

const recordingOptions: RecordingOptions = {
  extension: '.wav',
  sampleRate: 16000,
  android: {
    extension: '.wav',
    outputFormat: 'default',
    audioEncoder: 'default',
    sampleRate: 16000,
  },
  ios: {
    extension: '.wav',
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  numberOfChannels: 1,
  bitRate: 256000,
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

export const useTranscription = (apiBaseUrl?: string) => {
  const {
    transcript,
    isLoading,
    error,
    setLoading,
    setError,
    setLive,
    resetTranscript,
    addMany,
    addOrUpdate,
  } = useTranscriptStore();

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [latestPayload, setLatestPayload] = useState<LivePayload | null>(null);

  const liveClientRef = useRef<LocalLiveTranscriptionClient | null>(null);
  const chunkLoopRunningRef = useRef(false);
  const recorderRef = useRef<AudioRecorder | null>(null);

  const getOrCreateRecorder = useCallback((): AudioRecorder => {
    if (recorderRef.current) {
      return recorderRef.current;
    }

    const audioModuleAny = AudioModule as any;
    const recorder: AudioRecorder = audioModuleAny?.createAudioRecorder
      ? audioModuleAny.createAudioRecorder(recordingOptions)
      : new audioModuleAny.AudioRecorder(recordingOptions);
    recorderRef.current = recorder;
    return recorder;
  }, []);

  const uploadFile = useCallback(
    async (fileUri: string) => {
      setLoading(true);
      setError(null);

      try {
        const entries = await transcribeFileWithDiarization(fileUri);
        resetTranscript();
        addMany(entries);
        return entries;
      } catch (err: any) {
        const message = err?.message || 'Unable to transcribe audio file.';
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [addMany, resetTranscript, setError, setLoading]
  );

  const streamChunkLoop = useCallback(async () => {
    chunkLoopRunningRef.current = true;

    while (chunkLoopRunningRef.current && liveClientRef.current?.isOpen()) {
      const recorder = getOrCreateRecorder();

      try {
        await recorder.prepareToRecordAsync();
        recorder.record();

        await new Promise((resolve) => setTimeout(resolve, CHUNK_DURATION_MS));

        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) {
          continue;
        }

        const bytes = await fileUriToBytes(uri);

        // Silence detection: skip near-empty chunks.
        const energy = estimateChunkEnergy(bytes);
        if (energy < 0.005) {
          continue;
        }

        // Strip WAV header if present — the recorder produces .wav files with
        // a 44+ byte RIFF header, but the backend expects raw PCM int16 data.
        let pcmBytes = bytes;
        if (
          bytes.length >= 44 &&
          bytes[0] === 0x52 && // 'R'
          bytes[1] === 0x49 && // 'I'
          bytes[2] === 0x46 && // 'F'
          bytes[3] === 0x46    // 'F'
        ) {
          // Find the 'data' sub-chunk marker
          let dataOffset = 44; // default fallback
          for (let i = 12; i < Math.min(bytes.length - 8, 200); i++) {
            if (
              bytes[i] === 0x64 &&     // 'd'
              bytes[i + 1] === 0x61 && // 'a'
              bytes[i + 2] === 0x74 && // 't'
              bytes[i + 3] === 0x61    // 'a'
            ) {
              dataOffset = i + 8; // skip 'data' (4) + chunk-size (4)
              break;
            }
          }
          pcmBytes = bytes.slice(dataOffset);
        }

        console.log(
          `[Live Chunk] Sending ${pcmBytes.byteLength} PCM bytes (was ${bytes.byteLength} raw, energy=${energy.toFixed(4)})`
        );
        liveClientRef.current?.sendChunk(pcmBytes);
      } catch (err: any) {
        setError(err?.message || 'Live chunk capture failed');
      }
    }
  }, [getOrCreateRecorder, setError]);

  const startLive = useCallback(async () => {
    setError(null);

    try {
      if (Platform.OS === 'web') {
        throw new Error('Live recording is not supported on web in this build.');
      }

      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Microphone permission is required for live transcription');
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      const client = new LocalLiveTranscriptionClient(
        {
          onPartial: (entry: TranscriptEntry) => addOrUpdate(entry),
          onFinal: (entry: TranscriptEntry) => addOrUpdate(entry),
          onPayload: (payload: LivePayload) => setLatestPayload(payload),
          onStateChange: (state: ConnectionState) => setConnectionState(state),
          onError: (message: string) => setError(message),
          onOpen: () => setLive(true),
          onClose: () => setLive(false),
        },
        apiBaseUrl
      );

      liveClientRef.current = client;
      client.connect();

      // Give WS handshake a moment before sending chunks.
      setTimeout(() => {
        if (liveClientRef.current?.isOpen()) {
          streamChunkLoop();
        }
      }, 400);
    } catch (err: any) {
      setError(err?.message || 'Failed to start live transcription');
      throw err;
    }
  }, [addOrUpdate, setError, setLive, streamChunkLoop]);

  const stopLive = useCallback(() => {
    chunkLoopRunningRef.current = false;
    liveClientRef.current?.close();
    liveClientRef.current = null;
    setLive(false);
    setConnectionState('disconnected');
  }, [setLive]);

  return useMemo(
    () => ({
      transcript,
      isLoading,
      error,
      connectionState,
      latestPayload,
      startLive,
      stopLive,
      uploadFile,
    }),
    [connectionState, error, isLoading, latestPayload, startLive, stopLive, transcript, uploadFile]
  );
};
