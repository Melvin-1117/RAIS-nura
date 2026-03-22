import { create } from 'zustand';

import { waitForSeparationResult } from '../services/separationApi';
import { SeparationResult, SeparationStatusResponse } from '../types/separation';

type SeparationStoreState = {
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  stage: string;
  error: string | null;
  result: SeparationResult | null;
  reset: () => void;
  runSeparation: (
    fileUri: string,
    fileName: string,
    mimeType: string,
    apiBaseUrl: string
  ) => Promise<SeparationResult>;
};

const applyStatus = (
  set: (partial: Partial<SeparationStoreState>) => void,
  status: SeparationStatusResponse
) => {
  set({
    status: status.status,
    progress: status.progress,
    stage: status.stage,
    error: status.error || null,
    result: status.result || null,
  });
};

export const useSeparationStore = create<SeparationStoreState>((set) => ({
  status: 'idle',
  progress: 0,
  stage: 'idle',
  error: null,
  result: null,

  reset: () =>
    set({
      status: 'idle',
      progress: 0,
      stage: 'idle',
      error: null,
      result: null,
    }),

  runSeparation: async (fileUri, fileName, mimeType, apiBaseUrl) => {
    set({ status: 'queued', progress: 0, stage: 'queued', error: null, result: null });

    const result = await waitForSeparationResult(
      fileUri,
      fileName,
      mimeType,
      apiBaseUrl,
      (status) => applyStatus(set as any, status)
    );

    set({
      status: 'completed',
      progress: 100,
      stage: 'completed',
      error: null,
      result,
    });

    return result;
  },
}));
