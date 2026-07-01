import { create } from 'zustand';
import type { AppSettings } from '../types';
import { storage } from '../services/storage';

interface SettingsStore {
  settings: AppSettings;
  load(): void;
  update(partial: Partial<AppSettings>): void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  // Auto-load from localStorage so dark mode applies on first render
  settings: storage.getSettings(),

  load() {
    set({ settings: storage.getSettings() });
  },

  update(partial) {
    const updated = { ...get().settings, ...partial };
    storage.saveSettings(updated);
    set({ settings: updated });
  },
}));
