import { create } from 'zustand';

import { TranscriptEntry } from '../types/transcript';

type TranscriptState = {
  transcript: TranscriptEntry[];
  isLoading: boolean;
  isLive: boolean;
  error: string | null;
  setLoading: (isLoading: boolean) => void;
  setLive: (isLive: boolean) => void;
  setError: (error: string | null) => void;
  resetTranscript: () => void;
  addMany: (entries: TranscriptEntry[]) => void;
  addOrUpdate: (entry: TranscriptEntry) => void;
};

export const useTranscriptStore = create<TranscriptState>((set) => ({
  transcript: [],
  isLoading: false,
  isLive: false,
  error: null,

  setLoading: (isLoading) => set({ isLoading }),
  setLive: (isLive) => set({ isLive }),
  setError: (error) => set({ error }),

  resetTranscript: () => set({ transcript: [], error: null }),

  addMany: (entries) =>
    set((state) => {
      const byId = new Map(state.transcript.map((entry) => [entry.id, entry]));
      for (const entry of entries) {
        byId.set(entry.id, entry);
      }
      return {
        transcript: Array.from(byId.values()).sort((a, b) => a.startTime - b.startTime),
      };
    }),

  addOrUpdate: (entry) =>
    set((state) => {
      const existingIndex = state.transcript.findIndex((item) => item.id === entry.id);
      if (existingIndex === -1) {
        return {
          transcript: [...state.transcript, entry].sort((a, b) => a.startTime - b.startTime),
        };
      }

      const updated = [...state.transcript];
      updated[existingIndex] = {
        ...updated[existingIndex],
        ...entry,
      };
      return { transcript: updated.sort((a, b) => a.startTime - b.startTime) };
    }),
}));
