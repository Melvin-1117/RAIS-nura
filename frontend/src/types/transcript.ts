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

export type LocalUtterance = {
  speaker?: string;
  text?: string;
  start?: number;
  end?: number;
  confidence?: number;
};

export type LocalTranscriptResponse = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  error?: string;
  utterances?: LocalUtterance[];
};

export type PartialTranscriptMessage = {
  message_type: 'PartialTranscript';
  text: string;
  audio_start: number;
  audio_end: number;
  confidence?: number;
};

export type FinalTranscriptMessage = {
  message_type: 'FinalTranscript';
  text: string;
  audio_start: number;
  audio_end: number;
  confidence?: number;
  words?: Array<{ confidence?: number }>;
};

export type SessionBeginsMessage = {
  message_type: 'SessionBegins';
  session_id: string;
  expires_at: number;
};

export type ErrorMessage = {
  message_type: 'Error';
  error: string;
};

export type LiveTranscriptMessage =
  | PartialTranscriptMessage
  | FinalTranscriptMessage
  | SessionBeginsMessage
  | ErrorMessage;
