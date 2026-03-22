import { CategorizedSoundEvents } from '../types/soundCategories';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function fetchSoundEvents(
  sessionId: string
): Promise<CategorizedSoundEvents> {
  const res = await fetch(`${BASE_URL}/session/${sessionId}/sound-events`);
  if (!res.ok) {
    throw new Error(`Sound events fetch failed: ${res.status}`);
  }
  return res.json() as Promise<CategorizedSoundEvents>;
}
