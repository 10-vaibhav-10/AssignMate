import { useToastStore } from '../../stores/toastStore';
import type { ToastItem } from '../../stores/toastStore';

const ICONS: Record<string, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warning: '⚠',
};

const STYLES: Record<string, string> = {
  success: 'bg-emerald-600 text-white shadow-emerald-900/30',
  error:   'bg-rose-600   text-white shadow-rose-900/30',
  info:    'bg-violet-600 text-white shadow-violet-900/30',
  warning: 'bg-amber-500  text-white shadow-amber-900/30',
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg ${STYLES[toast.type]} animate-[slideUp_0.25s_ease-out]`}
    >
      <span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[11px] font-black shrink-0">
        {ICONS[toast.type]}
      </span>
      <span className="text-sm font-semibold flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => dismiss(toast.id)}
        className="text-white/60 hover:text-white text-lg leading-none shrink-0 transition-colors"
      >
        ×
      </button>
    </div>
  );
}

/** Drop this once inside App, above the nav, and toasts appear globally */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-50 flex flex-col gap-2 pointer-events-none"
      style={{ bottom: 90, left: '50%', transform: 'translateX(-50%)', width: 'min(calc(100vw - 32px), 420px)' }}
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard toast={t} />
        </div>
      ))}
    </div>
  );
}
