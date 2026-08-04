import { Platform } from 'react-native';

import {
  SeparationResult,
  SeparationStatusResponse,
} from '../types/separation';

// The backend handles sound separation internally inside /api/diarize.
// There is no separate /api/separation/jobs endpoint in this deployment.
// This stub allows the ProcessingScreen to continue to the diarize step.

export const waitForSeparationResult = async (
  _fileUri: string,
  _fileName: string,
  _mimeType: string,
  _apiBaseUrl: string,
  onProgress?: (status: SeparationStatusResponse) => void
): Promise<SeparationResult> => {
  // Signal "running" then immediately "completed" to advance the UI.
  onProgress?.({
    status: 'running',
    progress: 50,
    stage: 'running',
    error: null,
    result: null,
  });

  await new Promise((resolve) => setTimeout(resolve, 300));

  const stubResult: SeparationResult = {
    vocals_url: null,
    background_url: null,
    sounds: [],
    processing: {
      speech_energy_ratio: 0,
      background_energy_ratio: 0,
    },
  };

  onProgress?.({
    status: 'completed',
    progress: 100,
    stage: 'completed',
    error: null,
    result: stubResult,
  });

  return stubResult;
};
