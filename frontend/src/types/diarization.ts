export type Segment = {
  start: number;
  end: number;
  speaker: string;
};

export type Utterance = {
  start: number;
  end: number;
  speaker: string;
  text: string;
};

export type SoundEvent = {
  start: number;
  end: number;
  label: string;
  category: string;
  distance: 'Near' | 'Mid' | 'Far';
  intensity: 'Low' | 'Medium' | 'High';
  confidence: number;
};

export type ProcessingMeta = {
  duration_seconds: number;
  source_sample_rate: number;
  output_sample_rate: number;
  transcript_mode: string;
};

export type DiarizationResponse = {
  total_speakers: number;
  segments: Segment[];
  speaker_labels: string[];
  utterances: Utterance[];
  sounds: SoundEvent[];
  processing: ProcessingMeta;
};
