/**
 * guideProgress.ts
 *
 * Tiny shared store for the first-run guided coach-marks that walk a new user
 * through the pain-source flow: tap the body → pick a source → read its
 * pattern → back to sources → explore exercises.
 *
 * Each step is retired once the user either performs it or dismisses its hint,
 * and the retired set is persisted so the guide never nags on later visits.
 * Both the on-canvas coach (GuideCoach) and the in-panel hint (MetadataPanel)
 * read/write the same set via useSyncExternalStore.
 */

export type GuideStep = 'tap' | 'sources' | 'back' | 'explore'

const KEY = 'muscleAtlas.guide.seen.v1'

function read(): Set<GuideStep> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as GuideStep[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

let seen: Set<GuideStep> = read()
const subs = new Set<() => void>()

function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify([...seen])) } catch { /* ignore */ }
}

export function getGuideSeen(): Set<GuideStep> {
  return seen
}

export function markGuideSeen(step: GuideStep): void {
  if (seen.has(step)) return
  seen = new Set(seen)          // new reference so useSyncExternalStore re-renders
  seen.add(step)
  persist()
  for (const cb of subs) { try { cb() } catch { /* ignore */ } }
}

export function subscribeGuide(cb: () => void): () => void {
  subs.add(cb)
  return () => { subs.delete(cb) }
}

/** Wipe progress — handy for a "replay the tour" affordance / testing. */
export function resetGuide(): void {
  seen = new Set()
  persist()
  for (const cb of subs) { try { cb() } catch { /* ignore */ } }
}
