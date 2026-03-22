export type SoundCategory =
  | 'Natural'
  | 'Artificial'
  | 'Human Activity'
  | 'Music'
  | 'Animal';

export const ALL_CATEGORIES: SoundCategory[] = [
  'Natural',
  'Artificial',
  'Human Activity',
  'Music',
  'Animal',
];

export const CATEGORY_COLORS: Record<SoundCategory, string> = {
  Natural:          '#1D9E75',
  Artificial:       '#378ADD',
  'Human Activity': '#BA7517',
  Music:            '#D85A30',
  Animal:           '#639922',
};

export interface SoundEventFrame {
  label: string;
  score: number;
  startSec: number;
  endSec: number;
  category: SoundCategory;
}

export interface SoundSummaryItem {
  label: string;
  meanScore: number;
  category: SoundCategory;
}

export interface CategorizedSoundEvents {
  frames: SoundEventFrame[];
  byCategory: Record<SoundCategory, SoundEventFrame[]>;
  summary: SoundSummaryItem[];
}
