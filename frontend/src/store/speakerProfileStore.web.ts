import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SpeakerEmbedding, SpeakerProfile } from '../types/profiles';

const inMemoryStorage = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
})();

const webStorage = {
  getItem: (key: string) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return inMemoryStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
    inMemoryStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
      return;
    }
    inMemoryStorage.removeItem(key);
  },
};

const meanEmbedding = (embeddings: number[][]): number[] => {
  if (embeddings.length === 0) {
    return [];
  }

  const dim = embeddings[0].length;
  const sum = new Array<number>(dim).fill(0);

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i += 1) {
      sum[i] += emb[i] ?? 0;
    }
  }

  return sum.map((value) => value / embeddings.length);
};

const createId = (): string => {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  return `spk_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

interface SpeakerProfileStore {
  profiles: SpeakerProfile[];
  matchThreshold: number;
  addProfile: (name: string, enrollmentEmbeddings: number[][]) => SpeakerProfile;
  removeProfile: (id: string) => void;
  updateProfileName: (id: string, name: string) => void;
  addEnrollmentSample: (id: string, embedding: number[]) => void;
  setMatchThreshold: (threshold: number) => void;
}

export const useSpeakerProfileStore = create<SpeakerProfileStore>()(
  persist(
    (set, get) => ({
      profiles: [],
      matchThreshold: 0.75,

      addProfile: (name: string, enrollmentEmbeddings: number[][]): SpeakerProfile => {
        const now = Date.now();
        const embeddings: SpeakerEmbedding[] = enrollmentEmbeddings.map((values) => ({
          values,
          recordedAt: now,
        }));
        const averageEmbedding = meanEmbedding(enrollmentEmbeddings);

        const profile: SpeakerProfile = {
          id: createId(),
          name,
          embeddings,
          averageEmbedding,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({ profiles: [profile, ...state.profiles] }));
        return profile;
      },

      removeProfile: (id: string) => {
        set((state) => ({ profiles: state.profiles.filter((item) => item.id !== id) }));
      },

      updateProfileName: (id: string, name: string) => {
        set((state) => ({
          profiles: state.profiles.map((item) =>
            item.id === id
              ? { ...item, name, updatedAt: Date.now() }
              : item
          ),
        }));
      },

      addEnrollmentSample: (id: string, embedding: number[]) => {
        set((state) => ({
          profiles: state.profiles.map((item) => {
            if (item.id !== id) {
              return item;
            }

            const nextEmbeddings = [
              ...item.embeddings,
              { values: embedding, recordedAt: Date.now() },
            ];
            const averageEmbedding = meanEmbedding(nextEmbeddings.map((entry) => entry.values));

            return {
              ...item,
              embeddings: nextEmbeddings,
              averageEmbedding,
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      setMatchThreshold: (threshold: number) => {
        const normalized = Math.min(0.99, Math.max(0.5, threshold));
        set({ matchThreshold: normalized });
      },
    }),
    {
      name: 'speaker-profile-store-v1',
      storage: createJSONStorage(() => webStorage),
      partialize: (state) => ({
        profiles: state.profiles,
        matchThreshold: state.matchThreshold,
      }),
    }
  )
);
