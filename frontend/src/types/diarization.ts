export type Segment = {
  start: number;
  end: number;
  speaker: string;
  speaker_display?: string;
  speaker_confidence?: number;
};

export type Utterance = {
  start: number;
  end: number;
  speaker: string;
  speaker_name?: string;
  confidence?: number | null;
  speaker_display?: string;
  speaker_confidence?: number;
  text: string;
};


export type SpeakerMatch = {
  speaker: string;
  display_name: string;
  confidence: number;
  matched: boolean;
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
  separation_confirmed?: boolean;
  speech_energy_ratio?: number;
  background_energy_ratio?: number;
  overall_energy_rms?: number;
  overall_intensity?: 'Low' | 'Medium' | 'High';
};

export type DiarizationResponse = {
  total_speakers: number;
  segments: Segment[];
  speaker_labels: string[];
  speaker_matches?: SpeakerMatch[];
  utterances: Utterance[];
  sounds: SoundEvent[];
  processing: ProcessingMeta;
};
