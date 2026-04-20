import { extractEmbedding } from './embeddingService';
import { MatchResult, SpeakerProfile } from '../types/profiles';

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!Number.isFinite(denom) || denom <= 1e-10) {
    return 0;
  }

  const score = dot / denom;
  return Math.max(0, Math.min(1, score));
}

export function matchSpeaker(
  embedding: number[],
  profiles: SpeakerProfile[],
  threshold = 0.75
): MatchResult {
  if (profiles.length === 0) {
    return { profile: null, confidence: 0, isUnknown: true };
  }

  let bestProfile: SpeakerProfile | null = null;
  let bestScore = 0;

  for (const profile of profiles) {
    const score = cosineSimilarity(embedding, profile.averageEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestProfile = profile;
    }
  }

  if (bestScore >= threshold && bestProfile) {
    return { profile: bestProfile, confidence: bestScore, isUnknown: false };
  }

  return { profile: null, confidence: bestScore, isUnknown: true };
}

export async function resolveDiarizedSpeakers(
  segments: Record<string, Float32Array>,
  sampleRate: number,
  profiles: SpeakerProfile[],
  threshold: number
): Promise<Record<string, MatchResult>> {
  const entries = Object.entries(segments);
  const resolved: Record<string, MatchResult> = {};

  for (const [speakerId, audio] of entries) {
    const embedding = await extractEmbedding(audio, sampleRate);
    resolved[speakerId] = matchSpeaker(embedding, profiles, threshold);
  }

  return resolved;
}
