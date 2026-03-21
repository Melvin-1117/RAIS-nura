export type PickedAudio = {
  uri: string;
  name: string;
  mimeType: string;
};

export type AppSettings = {
  apiBaseUrl: string;
  speakerMatchThreshold: number;
  chunkSizeSeconds: number;
};

export const defaultSettings: AppSettings = {
  apiBaseUrl: 'http://localhost:8002',
  speakerMatchThreshold: 0.85,
  chunkSizeSeconds: 2,
};

export type AppScreen =
  | 'home'
  | 'processing'
  | 'results'
  | 'profiles'
  | 'settings'
  | 'live';
