interface ProgressBarProps {
  progress: number; // 0–100
  className?: string;
}

export function ProgressBar({ progress, className = '' }: ProgressBarProps) {
  const fill =
    progress === 100
      ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
      : progress > 60
        ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
        : progress > 0
          ? 'bg-gradient-to-r from-violet-400 to-purple-500'
          : 'bg-transparent';

  return (
    <div
      className={`w-full bg-gray-100 dark:bg-gray-800/80 rounded-full h-1.5 overflow-hidden ${className}`}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${fill}`}
        style={{ width: `${Math.max(progress, 0)}%` }}
      />
    </div>
  );
}
