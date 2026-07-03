/**
 * MoveMateTrainPromo.tsx
 *
 * ⚠️ PARKED FEATURE — not shown on the published landing page yet.
 *
 * MoveMate Train (the gym-training platform) isn't fully ready to launch, so its
 * promo entry points were removed from the live landing page (ZevahealthHome).
 * Rather than delete that content, it lives here so it can be brought back with a
 * single flag flip.
 *
 * To re-enable on the landing page:
 *   1. In src/ZevahealthHome.tsx set  SHOW_MOVEMATE_TRAIN = true
 *      (the nav link and hero card are already wired behind that flag).
 * The gym platform itself still runs at  ?gym=1  regardless of this flag.
 *
 * Both pieces take the `gymUrl` the landing already computes.
 */

import { ArrowRight } from 'lucide-react'

/** Amber pill in the top nav that links across to MoveMate Train. */
export function MoveMateTrainNavLink({ gymUrl }: { gymUrl: string }) {
  return (
    <a
      href={gymUrl}
      title="MoveMate Train — gym training platform"
      className="hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(251,146,60,0.7)] transition hover:-translate-y-px hover:shadow-[0_14px_36px_-8px_rgba(251,146,60,0.85)] sm:inline-flex"
    >
      💪 MoveMate Train
    </a>
  )
}

/** "New — MoveMate Train · Gym" call-out card under the hero CTAs. */
export function MoveMateTrainHeroCard({ gymUrl }: { gymUrl: string }) {
  return (
    <a
      href={gymUrl}
      className="group mt-5 inline-flex items-center gap-3 rounded-2xl border border-amber-300/70 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow">💪</span>
      <span>
        <span className="block text-sm font-bold text-slate-900">New — MoveMate Train · Gym</span>
        <span className="block text-xs text-slate-500">Train by muscle group — live reps, muscle activation &amp; Apple Watch</span>
      </span>
      <ArrowRight className="ml-1 h-4 w-4 text-amber-500 transition group-hover:translate-x-1" />
    </a>
  )
}
