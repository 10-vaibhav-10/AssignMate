import { create } from 'zustand';
import { todayStr } from '../utils';

const KEY = 'am_streak';

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;           // "YYYY-MM-DD"
  activityLog: Record<string, number>; // date → tasks/sessions completed
}

const EMPTY: StreakData = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: '',
  activityLog: {},
};

function daysBetween(a: string, b: string): number {
  if (!a || !b) return Infinity;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000,
  );
}

function load(): StreakData {
  try {
    return { ...EMPTY, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<StreakData>) };
  } catch {
    return { ...EMPTY };
  }
}

function save(data: StreakData) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

interface StreakStore {
  data: StreakData;
  init(): void;
  recordActivity(): void; // call on task complete or timer session end
}

export const useStreakStore = create<StreakStore>((set, get) => ({
  data: EMPTY,

  init() {
    const raw = load();
    const t = todayStr();
    // If last activity was 2+ days ago, reset streak
    if (raw.lastActiveDate && daysBetween(raw.lastActiveDate, t) > 1) {
      raw.currentStreak = 0;
      // keep longest streak and activityLog
    }
    save(raw);
    set({ data: raw });
  },

  recordActivity() {
    const raw = { ...get().data };
    const t = todayStr();

    // Update activity count for today
    raw.activityLog = { ...raw.activityLog, [t]: (raw.activityLog[t] ?? 0) + 1 };

    // Update streak
    if (raw.lastActiveDate !== t) {
      const gap = daysBetween(raw.lastActiveDate, t);
      if (gap === 1 || !raw.lastActiveDate) {
        raw.currentStreak += 1;
      } else if (gap > 1) {
        raw.currentStreak = 1; // restart
      }
      raw.lastActiveDate = t;
      if (raw.currentStreak > raw.longestStreak) {
        raw.longestStreak = raw.currentStreak;
      }
    }

    save(raw);
    set({ data: raw });
  },
}));
