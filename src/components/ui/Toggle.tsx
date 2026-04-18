import React from 'react'
import { clsx } from '../../lib/clsx'

interface ToggleProps {
  checked:   boolean
  onChange:  (checked: boolean) => void
  label?:    string
  size?:     'sm' | 'md'
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, size = 'md', disabled = false }: ToggleProps) {
  const trackSz = size === 'sm' ? 'w-7 h-4' : 'w-9 h-5'
  const thumbSz = size === 'sm' ? 'w-3 h-3'  : 'w-4 h-4'
  const translateX = size === 'sm' ? 'translate-x-3.5' : 'translate-x-4.5'

  return (
    <label
      className={clsx(
        'inline-flex items-center gap-2 cursor-pointer select-none',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <div
        role="switch"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) onChange(!checked) }}
        onClick={() => { if (!disabled) onChange(!checked) }}
        className={clsx(
          'relative inline-block rounded-full transition-colors duration-200',
          trackSz,
          checked
            ? 'bg-primary-500'
            : 'bg-slate-300 dark:bg-slate-600',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform duration-200',
            thumbSz,
            checked ? translateX : 'translate-x-0',
          )}
        />
      </div>
      {label && (
        <span className="text-xs text-slate-600 dark:text-slate-300">{label}</span>
      )}
    </label>
  )
}
