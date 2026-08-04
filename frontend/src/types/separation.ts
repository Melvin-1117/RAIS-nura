import { SoundEvent } from './diarization';

export type SeparationJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type SeparationProcessingMeta = {
  duration_seconds?: number;
  source_sample_rate?: number;
  output_sample_rate?: number;
  speech_energy_ratio: number;
  background_energy_ratio: number;
};

export type SeparationResult = {
  vocals_url: string | null;
  background_url: string | null;
  sounds: SoundEvent[];
  processing: SeparationProcessingMeta;
};

export type SeparationJobResponse = {
  job_id: string;
  status: SeparationJobStatus;
};

export type SeparationStatusResponse = {
  job_id: string;
  status: SeparationJobStatus;
  progress: number;
  stage: string;
  error?: string | null;
  result?: SeparationResult | null;
};
