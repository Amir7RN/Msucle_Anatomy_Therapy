/**
 * GuideCoach.tsx
 *
 * On-canvas guided coach-marks for the pain-source flow. The step shown is
 * derived purely from store state, so it tracks the user wherever they are:
 *
 *   tap      → nothing selected, no source list  → "tap the body part that hurts"
 *   sources  → a source list is showing          → "tap a source to see its pattern"
 *   back     → a muscle is isolated              → "tap Back to return to your sources"
 *
 * (The "explore exercises" step lives inside the detail panel — see
 * MetadataPanel — because that content sits in the right column, not the canvas.)
 *
 * Each step retires once performed or dismissed (persisted via guideProgress),
 * so the guide fades away as the user learns the flow but still re-appears for
 * a step they haven't met yet (e.g. the first time they open a source list).
 */

import React, { useEffect, useSyncExternalStore } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import {
  getGuideSeen,
  markGuideSeen,
  subscribeGuide,
  type GuideStep,
} from '../../lib/guideProgress'

export function GuideCoach() {
  const selectedId       = useAtlasStore((s) => s.selectedId)
  const diagnosticResult = useAtlasStore((s) => s.diagnosticResult)
  const isolateMode      = useAtlasStore((s) => s.isolateMode)
  const savedDiagnostic  = useAtlasStore((s) => s.savedDiagnostic)
  const modalOpenCount   = useAtlasStore((s) => s.modalOpenCount)

  const seen = useSyncExternalStore(subscribeGuide, getGuideSeen)

  // Doing a step retires the hint that asked for it (and any earlier one), so
  // the guide advances on the user's actions, not just on dismiss clicks.
  useEffect(() => { if (diagnosticResult) markGuideSeen('tap') }, [diagnosticResult])
  useEffect(() => {
    if (selectedId) { markGuideSeen('tap'); markGuideSeen('sources') }
  }, [selectedId])

  // Never compete with a full-screen modal for attention.
  if (modalOpenCount > 0) return null

  // Resolve the active step from state.
  let step: GuideStep | null = null
  if (!selectedId && !diagnosticResult)      step = 'tap'
  else if (diagnosticResult && !selectedId)  step = 'sources'
  else if (selectedId && isolateMode)        step = 'back'

  if (!step || seen.has(step)) return null

  // The "back" hint points UP at the Back button in the canvas's top-right;
  // the tap/sources hints point DOWN at the body model below them.
  if (step === 'back') {
    const showBackHint = !!savedDiagnostic   // only meaningful when a list can be restored
    if (!showBackHint) return null
    return (
      <div className="pointer-events-none absolute right-3 top-14 z-40 flex justify-end">
        <HintPill
          arrow="up"
          onDismiss={() => markGuideSeen('back')}
          text={
            <>
              Done with this muscle? Tap{' '}
              <span className="font-semibold text-orange-300">Back to pain sources</span>{' '}
              above to compare another.
            </>
          }
        />
      </div>
    )
  }

  const text =
    step === 'tap' ? (
      <>
        <span className="font-semibold text-cyan-300">Start here:</span>{' '}
        tap the body part that hurts — I&apos;ll show what could be causing it.
      </>
    ) : (
      <>
        <span className="font-semibold text-cyan-300">Likely sources of your pain.</span>{' '}
        Tap any label on the model to see its pain pattern &amp; exercises.
      </>
    )

  return (
    <div className="pointer-events-none absolute top-4 inset-x-0 z-40 flex justify-center px-3">
      <HintPill arrow="down" text={text} onDismiss={() => markGuideSeen(step!)} />
    </div>
  )
}

function HintPill({
  text,
  arrow,
  onDismiss,
}: {
  text:      React.ReactNode
  arrow:     'up' | 'down'
  onDismiss: () => void
}) {
  const Arrow = arrow === 'down' ? ArrowDown : ArrowUp
  return (
    <div className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl border border-cyan-500/40 bg-slate-900/92 px-4 py-2 shadow-[0_0_28px_rgba(34,211,238,0.22)] backdrop-blur">
      <Arrow size={16} className="flex-shrink-0 animate-bounce text-cyan-300" />
      <span className="text-xs leading-snug text-slate-100">{text}</span>
      <button
        onClick={onDismiss}
        title="Got it"
        className="ml-1 flex-shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-slate-700 hover:text-white"
      >
        <X size={13} />
      </button>
    </div>
  )
}
