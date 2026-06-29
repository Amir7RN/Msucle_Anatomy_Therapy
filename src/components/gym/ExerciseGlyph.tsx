/**
 * ExerciseGlyph.tsx — on-brand SVG thumbnail used when an exercise has no video.
 * Pure inline SVG (no external/CDN assets, no licensing). Each glyph is a simple
 * motion mark so cards read at a glance.
 */

import React from 'react'
import type { ExerciseMedia } from '../../lib/gym/exercises'

type Glyph = ExerciseMedia['glyph']

const PATHS: Record<Glyph, React.ReactNode> = {
  press: <><circle cx="32" cy="20" r="6" /><path d="M20 30h24M24 30v14M40 30v14M16 26l8 4M48 26l-8 4" /></>,
  row:   <><circle cx="24" cy="18" r="5" /><path d="M20 26c0 0 2 8 0 16M20 30h22M42 24v12" /></>,
  raise: <><circle cx="32" cy="18" r="5" /><path d="M32 24v16M32 28l-14-6M32 28l14-6" /></>,
  curl:  <><circle cx="32" cy="16" r="5" /><path d="M32 22v10M32 24l-10 4 4 10M32 24l10 4-4 10" /></>,
  squat: <><circle cx="32" cy="16" r="5" /><path d="M32 22v8l-8 8M32 30l8 8M20 46h24" /></>,
  hinge: <><circle cx="22" cy="18" r="5" /><path d="M26 22l16 6M26 22l-2 22M42 28v16" /></>,
  core:  <><path d="M14 36h36" /><circle cx="22" cy="30" r="5" /><path d="M27 32l16 2M43 30v8" /></>,
  pull:  <><circle cx="32" cy="40" r="5" /><path d="M32 34V20M32 22l-12-6M32 22l12-6" /></>,
}

export function ExerciseGlyph({ glyph, className }: { glyph: Glyph; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none"
      stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[glyph]}
    </svg>
  )
}
