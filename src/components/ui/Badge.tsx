import React from 'react'
import { clsx } from '../../lib/clsx'

type BadgeColor = 'blue' | 'green' | 'amber' | 'slate' | 'red' | 'purple'

const colorClasses: Record<BadgeColor, string> = {
  blue:   'bg-blue-50   text-blue-700   ring-blue-700/10  dark:bg-blue-900/30 dark:text-blue-300',
  green:  'bg-green-50  text-green-700  ring-green-700/10 dark:bg-green-900/30 dark:text-green-300',
  amber:  'bg-amber-50  text-amber-700  ring-amber-700/10 dark:bg-amber-900/30 dark:text-amber-300',
  slate:  'bg-slate-50  text-slate-600  ring-slate-700/10 dark:bg-slate-700 dark:text-slate-300',
  red:    'bg-red-50    text-red-700    ring-red-700/10   dark:bg-red-900/30 dark:text-red-300',
  purple: 'bg-purple-50 text-purple-700 ring-purple-700/10 dark:bg-purple-900/30 dark:text-purple-300',
}

interface BadgeProps {
  children: React.ReactNode
  color?:   BadgeColor
  className?: string
}

export function Badge({ children, color = 'slate', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        colorClasses[color],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Map an anatomical property to a badge colour */
export function systemBadgeColor(system: string): BadgeColor {
  switch (system) {
    case 'muscle':   return 'red'
    case 'skeleton': return 'amber'
    case 'nerve':    return 'purple'
    case 'joint':    return 'blue'
    default:         return 'slate'
  }
}

export function layerBadgeColor(layer: string): BadgeColor {
  switch (layer) {
    case 'superficial':  return 'green'
    case 'intermediate': return 'amber'
    case 'deep':         return 'blue'
    default:             return 'slate'
  }
}
