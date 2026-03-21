import axios from 'axios';
import { Platform } from 'react-native';

import { DiarizationResponse } from '../types/diarization';

const fallbackApiBaseUrl = (apiBaseUrl: string): string | null => {
  try {
    const parsed = new URL(apiBaseUrl);
    const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (!isLocalHost || parsed.port !== '8001') {
      return null;
    }

    parsed.port = '8002';
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
};

const isHealthy = async (apiBaseUrl: string): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(`${apiBaseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      return false;
    }

    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const resolveReachableApiBaseUrl = async (apiBaseUrl: string): Promise<string> => {
  if (await isHealthy(apiBaseUrl)) {
    return apiBaseUrl;
  }

  const fallback = fallbackApiBaseUrl(apiBaseUrl);
  if (fallback && (await isHealthy(fallback))) {
    return fallback;
  }

  throw new Error(
    `Backend is unreachable at ${apiBaseUrl}. Start the backend server and try again.`
  );
};

export const diarizeAudioFile = async (
  fileUri: string,
  fileName: string,
  mimeType: string,
  apiBaseUrl: string
) => {
  const reachableApiBaseUrl = await resolveReachableApiBaseUrl(apiBaseUrl);

  const formData = new FormData();

  if (Platform.OS === 'web') {
    const fileResponse = await fetch(fileUri);
    const blob = await fileResponse.blob();
    const webFile = new File([blob], fileName, {
      type: mimeType || blob.type || 'audio/wav',
    });
    formData.append('file', webFile);
  } else {
    formData.append('file', {
      // React Native file object for multipart upload.
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any);
  }

  const api = axios.create({
    baseURL: reachableApiBaseUrl,
    // Backend can take several minutes when polling cloud transcription.
    timeout: 420000,
  });

  try {
    const response = await api.post<DiarizationResponse>('/api/diarize', formData);
    return response.data;
  } catch (error: any) {
    if (!error?.response) {
      throw new Error(
        `Cannot connect to backend at ${reachableApiBaseUrl}. Verify the backend server is running.`
      );
    }

    throw error;
  }
};
