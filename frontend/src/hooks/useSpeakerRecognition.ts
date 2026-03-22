import { useEffect, useMemo, useState } from 'react';

import { ensureEmbeddingModelLoaded, extractEmbedding } from '../services/embeddingService';
import { matchSpeaker } from '../services/speakerMatcher';
import { useSpeakerProfileStore } from '../store/speakerProfileStore';
import { MatchResult, SpeakerProfile } from '../types/profiles';

const MIN_ENROLLMENT_SAMPLES = 3;

export function useSpeakerRecognition() {
  const profiles = useSpeakerProfileStore((state) => state.profiles);
  const matchThreshold = useSpeakerProfileStore((state) => state.matchThreshold);
  const addProfile = useSpeakerProfileStore((state) => state.addProfile);
  const removeProfile = useSpeakerProfileStore((state) => state.removeProfile);

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    ensureEmbeddingModelLoaded()
      .then(() => {
        if (mounted) {
          setIsReady(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setIsReady(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const identifySpeaker = async (
    audioFloat32: Float32Array,
    sampleRate: number
  ): Promise<MatchResult> => {
    const embedding = await extractEmbedding(audioFloat32, sampleRate);
    return matchSpeaker(embedding, profiles, matchThreshold);
  };

  const enrollSpeaker = async (
    name: string,
    audioSamples: Float32Array[],
    sampleRate: number
  ): Promise<SpeakerProfile> => {
    if (audioSamples.length < MIN_ENROLLMENT_SAMPLES) {
      throw new Error('Minimum 3 enrollment samples are required per speaker.');
    }

    const embeddings: number[][] = [];
    for (const sample of audioSamples) {
      const embedding = await extractEmbedding(sample, sampleRate);
      embeddings.push(embedding);
    }

    return addProfile(name.trim(), embeddings);
  };

  return useMemo(
    () => ({
      identifySpeaker,
      enrollSpeaker,
      profiles,
      removeProfile,
      isReady,
    }),
    [profiles, removeProfile, isReady]
  );
}
