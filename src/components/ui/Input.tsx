import React from 'react'
import { clsx } from '../../lib/clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?:  React.ReactNode
  rightIcon?: React.ReactNode
  label?:     string
}

export function Input({ leftIcon, rightIcon, label, className, id, ...rest }: InputProps) {
  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <span className="absolute left-2.5 text-slate-400 pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          id={id}
          className={clsx(
            'w-full rounded border bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200',
            'border-slate-200 dark:border-slate-600',
            'placeholder:text-slate-400 dark:placeholder:text-slate-500',
            'text-sm h-8 px-3',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
            'transition-colors',
            leftIcon  ? 'pl-8' : undefined,
            rightIcon ? 'pr-8' : undefined,
            className,
          )}
          {...rest}
        />
        {rightIcon && (
          <span className="absolute right-2.5 text-slate-400 pointer-events-none">
            {rightIcon}
          </span>
        )}
      </div>
    </div>
  )
}
