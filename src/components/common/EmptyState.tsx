import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon = '📋', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-gray-900 dark:text-white font-semibold text-lg mb-1">{title}</h3>
      {description && <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{description}</p>}
      {action}
    </div>
  );
}
