import axios from 'axios';
import { Platform } from 'react-native';

import { DiarizationResponse } from '../types/diarization';
import { SpeakerProfile } from '../types/profiles';
import { getDefaultApiBaseUrl, parseUrl } from '../utils/network';

const LOCALHOST_PREFERRED_PORTS = ['8000', '8003', '8002', '8001'];
const LAN_PREFERRED_PORTS = ['8000', '8003', '8002', '8001'];

const hostCandidates = (apiBaseUrl: string): string[] => {
  const candidates: string[] = [];

  // 1. The stored/saved API URL is always the highest-priority candidate.
  if (apiBaseUrl && apiBaseUrl.startsWith('http')) {
    candidates.push(apiBaseUrl);
  }

  // 2. Auto-detect from Metro bundler host (works when --host lan is used).
  const defaultUrl = getDefaultApiBaseUrl();
  if (defaultUrl && !candidates.includes(defaultUrl)) {
    candidates.push(defaultUrl);
  }

  // 3. Try alternate ports on the same host as the stored URL.
  try {
    const parsed = parseUrl(apiBaseUrl);
    const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    const ports = isLocalHost ? LOCALHOST_PREFERRED_PORTS : LAN_PREFERRED_PORTS;

    for (const port of ports) {
      const candidate = `${parsed.protocol}//${parsed.hostname}:${port}`;
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  } catch {
    // Ignore URL parse error
  }

  return candidates;
};

const isHealthy = async (apiBaseUrl: string): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

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
): Promise<DiarizationResponse> => {
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
      uri: fileUri,
      name: fileName || 'sample.wav',
      type: mimeType || 'audio/wav',
    } as any);
  }

  try {
    const response = await fetch(`${reachableApiBaseUrl}/api/diarize`, {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const detail = errJson?.detail || (await response.text().catch(() => ''));
      throw new Error(detail || `Diarization failed (${response.status})`);
    }

    return await response.json();
  } catch (error: any) {
    if (error?.message) {
      throw error;
    }
    throw new Error(
      `Cannot connect to backend at ${reachableApiBaseUrl}. Verify the backend server is running.`
    );
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
      name: fileName || 'sample.wav',
      type: mimeType || 'audio/wav',
    } as any);
  }

  try {
    const response = await fetch(`${reachableApiBaseUrl}/api/speaker-profiles`, {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const detail = errJson?.detail || (await response.text().catch(() => ''));
      throw new Error(detail || `Server error (${response.status})`);
    }

    return await response.json();
  } catch (error: any) {
    if (error?.message) {
      throw error;
    }
    throw new Error(`Cannot connect to backend at ${reachableApiBaseUrl}. Verify network connection.`);
  }
};

export const deleteSpeakerProfile = async (apiBaseUrl: string, profileId: string): Promise<void> => {
  const reachableApiBaseUrl = await resolveReachableApiBaseUrl(apiBaseUrl);
  const api = axios.create({ baseURL: reachableApiBaseUrl, timeout: 30000 });
  await api.delete(`/api/speaker-profiles/${profileId}`);
};
