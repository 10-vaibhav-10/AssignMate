import { Button } from '../common/Button';

interface NotificationOnboardingProps {
  isOpen: boolean;
  isRequesting: boolean;
  onEnable(): void;
  onDismiss(): void;
}

/**
 * One-time prompt shown on first launch, before the OS permission dialog,
 * so the user has context for why we're asking (Google/Apple both recommend
 * this "primer" pattern over cold-calling the system dialog).
 */
export function NotificationOnboarding({
  isOpen,
  isRequesting,
  onEnable,
  onDismiss,
}: NotificationOnboardingProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4"
      onClick={onDismiss}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-3xl p-6 w-full max-w-md mb-4 shadow-xl dark:shadow-black/40 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl shadow-lg shadow-violet-300/50">
          🔔
        </div>
        <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-1.5">
          Never miss a deadline
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 leading-relaxed">
          Turn on reminders and AssignMate will nudge you 3 days out, the day before,
          and on the day itself — for assignments and individual tasks.
        </p>
        <div className="flex flex-col gap-2.5">
          <Button onClick={onEnable} fullWidth isLoading={isRequesting}>
            {isRequesting ? 'Just a moment…' : '🔔 Enable Notifications'}
          </Button>
          <Button variant="ghost" fullWidth onClick={onDismiss} disabled={isRequesting}>
            Maybe later
          </Button>
        </div>
      </div>
    </div>
  );
}
