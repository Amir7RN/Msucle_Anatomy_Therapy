/**
 * TapHint.tsx
 *
 * First-run affordance for the 3D atlas: a floating pill telling the user
 * the model is tappable and that tapping the sore spot is step one.
 *
 * Shows until the user either selects any structure (the action the hint
 * teaches) or dismisses it — both persist to localStorage so the hint never
 * comes back on later visits. Hidden while any feature modal is open.
 */

import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'

const DISMISS_KEY = 'muscleAtlas.tapHint.dismissed.v1'

function readDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

function persistDismissed(): void {
  try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
}

export function TapHint() {
  const selectedId     = useAtlasStore((s) => s.selectedId)
  const modalOpenCount = useAtlasStore((s) => s.modalOpenCount)
  const [dismissed, setDismissed] = useState(readDismissed)

  // The user did the thing the hint teaches — retire it permanently.
  useEffect(() => {
    if (selectedId && !dismissed) {
      persistDismissed()
      setDismissed(true)
    }
  }, [selectedId, dismissed])

  if (dismissed || selectedId || modalOpenCount > 0) return null

  return (
    <div className="pointer-events-none absolute top-4 inset-x-0 z-20 flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-cyan-500/40 bg-slate-900/90 px-4 py-2 shadow-[0_0_28px_rgba(34,211,238,0.22)] backdrop-blur">
        <span className="text-base animate-bounce" aria-hidden>👆</span>
        <span className="text-xs text-slate-100">
          <span className="font-semibold text-cyan-300">Start here:</span>{' '}
          tap the body part that hurts — I&apos;ll guide you from there.
        </span>
        <button
          onClick={() => { persistDismissed(); setDismissed(true) }}
          title="Dismiss"
          className="ml-1 rounded-full p-0.5 text-slate-400 hover:bg-slate-700 hover:text-white"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
