import axios from 'axios';
import { Platform } from 'react-native';

import { DiarizationResponse } from '../types/diarization';
import { SpeakerProfile } from '../types/profiles';

const LOCALHOST_PREFERRED_PORTS = ['8003', '8002', '8001'];
const LAN_PREFERRED_PORTS = ['8003', '8002', '8001', '8000'];
const LEGACY_API_PORTS = new Set(['', '8000', '8001', '8002']);

const hostCandidates = (apiBaseUrl: string): string[] => {
  try {
    const parsed = new URL(apiBaseUrl);
    const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

    if (!LEGACY_API_PORTS.has(parsed.port)) {
      return [apiBaseUrl];
    }

    const ports = isLocalHost ? LOCALHOST_PREFERRED_PORTS : LAN_PREFERRED_PORTS;

    const candidates = [apiBaseUrl];
    for (const port of ports) {
      const candidate = `${parsed.protocol}//${parsed.hostname}:${port}`;
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }

    return candidates;
  } catch {
    return [apiBaseUrl];
  }
};

const isHealthy = async (apiBaseUrl: string): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${apiBaseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    return response.ok;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn(`Health check timeout for ${apiBaseUrl}`);
    } else {
      console.warn(`Health check failed for ${apiBaseUrl}:`, err.message);
    }
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

export const resolveReachableApiBaseUrl = async (apiBaseUrl: string): Promise<string> => {
  const candidates = hostCandidates(apiBaseUrl);
  for (const candidate of candidates) {
    if (await isHealthy(candidate)) {
      return candidate;
    }
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

export const listSpeakerProfiles = async (apiBaseUrl: string): Promise<SpeakerProfile[]> => {
  const reachableApiBaseUrl = await resolveReachableApiBaseUrl(apiBaseUrl);
  const api = axios.create({ baseURL: reachableApiBaseUrl, timeout: 30000 });
  const response = await api.get<SpeakerProfile[]>('/api/speaker-profiles');
  return response.data;
};

export const registerSpeakerProfile = async (
  apiBaseUrl: string,
  name: string,
  fileUri: string,
  fileName: string,
  mimeType: string
): Promise<SpeakerProfile> => {
  const reachableApiBaseUrl = await resolveReachableApiBaseUrl(apiBaseUrl);
  const formData = new FormData();
  formData.append('name', name);

  if (Platform.OS === 'web') {
    const fileResponse = await fetch(fileUri);
    const blob = await fileResponse.blob();
    const webFile = new File([blob], fileName, {
      type: mimeType || blob.type || 'audio/wav',
    });
    formData.append('file', webFile);
  } else {
    formData.append('file', {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any);
  }

  const api = axios.create({ baseURL: reachableApiBaseUrl, timeout: 120000 });
  const response = await api.post<SpeakerProfile>('/api/speaker-profiles', formData);
  return response.data;
};

export const deleteSpeakerProfile = async (apiBaseUrl: string, profileId: string): Promise<void> => {
  const reachableApiBaseUrl = await resolveReachableApiBaseUrl(apiBaseUrl);
  const api = axios.create({ baseURL: reachableApiBaseUrl, timeout: 30000 });
  await api.delete(`/api/speaker-profiles/${profileId}`);
};
