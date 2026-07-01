import { type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  isLoading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-indigo-600 to-violet-600 text-white ' +
    'hover:from-indigo-700 hover:to-violet-700 ' +
    'shadow-lg shadow-indigo-300/50 active:scale-[0.97]',
  secondary:
    'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 ' +
    'hover:bg-gray-50 dark:hover:bg-gray-600 active:bg-gray-100 dark:active:bg-gray-500 shadow-sm',
  danger:
    'bg-gradient-to-r from-red-500 to-rose-500 text-white ' +
    'hover:from-red-600 hover:to-rose-600 ' +
    'shadow-lg shadow-red-200/50 active:scale-[0.97]',
  ghost: 'text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100',
};

export function Button({
  variant = 'primary',
  fullWidth = false,
  isLoading = false,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || isLoading}
      className={`
        inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl
        font-semibold text-sm transition-all select-none cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
        ${VARIANTS[variant]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
    >
      {isLoading && (
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {children}
    </button>
  );
}
