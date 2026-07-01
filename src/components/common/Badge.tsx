import type { Difficulty } from '../../types';

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  easy:   'bg-emerald-100 dark:bg-emerald-900/35 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-700/40',
  medium: 'bg-amber-100  dark:bg-amber-900/35  text-amber-700  dark:text-amber-400  border border-amber-200/60  dark:border-amber-700/40',
  hard:   'bg-rose-100   dark:bg-rose-900/35   text-rose-700   dark:text-rose-400   border border-rose-200/60   dark:border-rose-700/40',
};

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy:   '✦ Easy',
  medium: '◈ Medium',
  hard:   '⬡ Hard',
};

interface DifficultyBadgeProps {
  difficulty: Difficulty;
}

export function DifficultyBadge({ difficulty }: DifficultyBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-black px-2.5 py-0.5 rounded-full tracking-wide ${DIFFICULTY_STYLES[difficulty]}`}
    >
      {DIFFICULTY_LABELS[difficulty]}
    </span>
  );
}

interface StatusBadgeProps {
  progress: number;
  isOverdue: boolean;
}

export function StatusBadge({ progress, isOverdue }: StatusBadgeProps) {
  if (isOverdue) {
    return (
      <span className="inline-flex items-center text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/35 text-rose-700 dark:text-rose-400 border border-rose-200/50 dark:border-rose-700/40">
        ⚡ Overdue
      </span>
    );
  }
  if (progress === 100) {
    return (
      <span className="inline-flex items-center text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/35 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-700/40">
        ✓ Done
      </span>
    );
  }
  if (progress > 0) {
    return (
      <span className="inline-flex items-center text-[10px] font-black px-2.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/35 text-violet-700 dark:text-violet-400 border border-violet-200/50 dark:border-violet-700/40">
        ↗ In Progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[10px] font-black px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
      · Not Started
    </span>
  );
}
