import { Button } from '../common/Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md mb-4 shadow-xl dark:shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-1">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{message}</p>
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" fullWidth onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
