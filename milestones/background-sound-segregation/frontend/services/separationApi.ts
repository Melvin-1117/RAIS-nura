import axios from 'axios';
import { Platform } from 'react-native';

import { resolveReachableApiBaseUrl } from './api';
import {
  SeparationJobResponse,
  SeparationResult,
  SeparationStatusResponse,
} from '../types/separation';

const DEFAULT_SEPARATION_PORT = '8010';

const deriveSeparationBaseUrl = (apiBaseUrl: string): string => {
  try {
    const parsed = new URL(apiBaseUrl);
    if (!parsed.port || parsed.port === '8003') {
      parsed.port = DEFAULT_SEPARATION_PORT;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return apiBaseUrl;
  }
};

const resolveReachableSeparationBaseUrl = async (apiBaseUrl: string): Promise<string> => {
  const candidate = deriveSeparationBaseUrl(apiBaseUrl);
  return resolveReachableApiBaseUrl(candidate);
};

export const createSeparationJob = async (
  fileUri: string,
  fileName: string,
  mimeType: string,
  apiBaseUrl: string
): Promise<{ baseUrl: string; jobId: string }> => {
  const baseUrl = await resolveReachableSeparationBaseUrl(apiBaseUrl);

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
      name: fileName,
      type: mimeType,
    } as any);
  }

  const api = axios.create({ baseURL: baseUrl, timeout: 180000 });
  const response = await api.post<SeparationJobResponse>('/api/separation/jobs', formData);
  return { baseUrl, jobId: response.data.job_id };
};

export const getSeparationJobStatus = async (
  baseUrl: string,
  jobId: string
): Promise<SeparationStatusResponse> => {
  const api = axios.create({ baseURL: baseUrl, timeout: 30000 });
  const response = await api.get<SeparationStatusResponse>(`/api/separation/jobs/${jobId}`);
  return response.data;
};

export const waitForSeparationResult = async (
  fileUri: string,
  fileName: string,
  mimeType: string,
  apiBaseUrl: string,
  onProgress?: (status: SeparationStatusResponse) => void
): Promise<SeparationResult> => {
  const { baseUrl, jobId } = await createSeparationJob(fileUri, fileName, mimeType, apiBaseUrl);

  const maxPolls = 240;
  const intervalMs = 1000;

  for (let i = 0; i < maxPolls; i += 1) {
    const status = await getSeparationJobStatus(baseUrl, jobId);
    onProgress?.(status);

    if (status.status === 'failed') {
      throw new Error(status.error || 'M4 separation job failed');
    }

    if (status.status === 'completed' && status.result) {
      return status.result;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('M4 separation timed out. Please retry with a shorter audio file.');
};
