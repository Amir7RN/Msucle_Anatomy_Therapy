import React from 'react'
import { clsx } from '../../lib/clsx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?:    ButtonSize
  active?:  boolean
  icon?:    React.ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'bg-primary-500 hover:bg-primary-600 text-white border-transparent',
  secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 dark:border-slate-600',
  ghost:     'bg-transparent hover:bg-slate-100 text-slate-600 border-transparent dark:hover:bg-slate-700 dark:text-slate-300',
  danger:    'bg-red-500 hover:bg-red-600 text-white border-transparent',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-xs px-2 py-1 h-7',
  md: 'text-sm px-3 py-1.5 h-8',
  lg: 'text-sm px-4 py-2  h-9',
}

export function Button({
  variant = 'secondary',
  size    = 'md',
  active  = false,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center gap-1.5 font-medium rounded border transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        active && 'ring-2 ring-primary-500 ring-offset-0',
        className,
      )}
      disabled={disabled}
      {...rest}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  )
}
