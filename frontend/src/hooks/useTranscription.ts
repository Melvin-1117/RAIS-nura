import {
  AudioModule,
  AudioQuality,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useMemo, useRef } from 'react';

import { AssemblyAILiveClient, transcribeFileWithDiarization } from '../services/assemblyai';
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

export const useTranscription = () => {
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

  const liveClientRef = useRef<AssemblyAILiveClient | null>(null);
  const chunkLoopRunningRef = useRef(false);
  const recorderRef = useRef(new AudioModule.AudioRecorder(recordingOptions));

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
      const recorder = recorderRef.current;

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
        if (energy < 0.008) {
          continue;
        }

        liveClientRef.current?.sendChunk(bytes);
      } catch (err: any) {
        setError(err?.message || 'Live chunk capture failed');
      }
    }
  }, [setError]);

  const startLive = useCallback(async () => {
    setError(null);

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Microphone permission is required for live transcription');
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      const client = new AssemblyAILiveClient({
        onPartial: (entry: TranscriptEntry) => addOrUpdate(entry),
        onFinal: (entry: TranscriptEntry) => addOrUpdate(entry),
        onError: (message: string) => setError(message),
        onOpen: () => setLive(true),
        onClose: () => setLive(false),
      });

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
  }, [setLive]);

  return useMemo(
    () => ({
      transcript,
      isLoading,
      error,
      startLive,
      stopLive,
      uploadFile,
    }),
    [error, isLoading, startLive, stopLive, transcript, uploadFile]
  );
};
