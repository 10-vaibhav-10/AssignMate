import type { Difficulty } from '../types';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
};

export const ESTIMATED_HOURS_OPTIONS = [2, 5, 10, 20] as const;

export const DIFFICULTY_OPTIONS: Difficulty[] = ['easy', 'medium', 'hard'];
