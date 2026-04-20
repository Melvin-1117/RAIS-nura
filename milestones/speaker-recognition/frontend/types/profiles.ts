// Legacy backend profile shape kept for compatibility with existing API calls.
export interface BackendSpeakerProfile {
  id: string;
  name: string;
  created_at: string;
  sample_duration_seconds: number;
}

export interface SpeakerEmbedding {
  values: number[];
  recordedAt: number;
}

export interface SpeakerProfile {
  id: string;
  name: string;
  embeddings: SpeakerEmbedding[];
  averageEmbedding: number[];
  createdAt: number;
  updatedAt: number;
}

export interface MatchResult {
  profile: SpeakerProfile | null;
  confidence: number;
  isUnknown: boolean;
}
