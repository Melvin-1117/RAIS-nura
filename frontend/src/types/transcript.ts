export type SpeakerLabel = 'A' | 'B' | 'Unknown';

export type TranscriptEntry = {
  id: string;
  speaker: SpeakerLabel;
  text: string;
  startTime: number;
  endTime: number;
  isFinal: boolean;
  confidence: number;
};

export type AssemblyAIUtterance = {
  speaker?: string;
  text?: string;
  start?: number;
  end?: number;
  confidence?: number;
};

export type AssemblyAITranscriptResponse = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  error?: string;
  utterances?: AssemblyAIUtterance[];
};

export type AssemblyAIPartialMessage = {
  message_type: 'PartialTranscript';
  text: string;
  audio_start: number;
  audio_end: number;
  confidence?: number;
};

export type AssemblyAIFinalMessage = {
  message_type: 'FinalTranscript';
  text: string;
  audio_start: number;
  audio_end: number;
  confidence?: number;
  words?: Array<{ confidence?: number }>;
};

export type AssemblyAISessionBeginsMessage = {
  message_type: 'SessionBegins';
  session_id: string;
  expires_at: number;
};

export type AssemblyAIErrorMessage = {
  message_type: 'Error';
  error: string;
};

export type AssemblyAILiveMessage =
  | AssemblyAIPartialMessage
  | AssemblyAIFinalMessage
  | AssemblyAISessionBeginsMessage
  | AssemblyAIErrorMessage;
