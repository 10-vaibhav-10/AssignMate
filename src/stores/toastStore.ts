import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: ToastItem[];
  show(message: string, type?: ToastType, duration?: number): void;
  dismiss(id: string): void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  show(message, type = 'success', duration = 3000) {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Call from anywhere — no hook needed */
export const toast = {
  success: (msg: string)  => useToastStore.getState().show(msg, 'success'),
  error:   (msg: string)  => useToastStore.getState().show(msg, 'error', 4500),
  info:    (msg: string)  => useToastStore.getState().show(msg, 'info'),
  warning: (msg: string)  => useToastStore.getState().show(msg, 'warning'),
};
