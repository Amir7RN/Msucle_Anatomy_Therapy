/**
 * repCounter.ts
 *
 * Counts successful exercise reps using a simple two-state machine:
 *
 *   • RESTING   — user is not in the target form.
 *   • IN_RANGE  — user is holding the form, having spent >= IN_RANGE_MS in
 *                 the good zone.
 *
 *   A REP is registered when the user transitions IN_RANGE → RESTING.
 *   That is: enter the good zone, hold it, leave back to rest.  This
 *   matches the user's mental model — "stretch out, hold, come back = 1".
 *
 * Default targets:
 *   IN_RANGE_MS = 700 ms   → must hold the good form for ~3/4 second
 *   REST_MS     = 250 ms   → debounce wobble around the boundary
 *   TARGET_REPS = 10
 *
 * Usage:
 *   const tracker = createRepCounter()
 *   each frame: tracker.update(formGood)  →  { count, just_completed }
 */

export interface RepCounterState {
  count:           number
  in_range:        boolean
  last_state_ms:   number   // timestamp of latest transition
  just_completed:  boolean  // true on the single frame the rep is registered
}

export interface RepCounter {
  state:    RepCounterState
  update:   (formGood: boolean) => RepCounterState
  reset:    () => void
  setTarget: (n: number) => void
  target:   () => number
}

const IN_RANGE_MS = 700
const REST_MS     = 250

export function createRepCounter(target = 10): RepCounter {
  let _target = target
  const state: RepCounterState = {
    count:          0,
    in_range:       false,
    last_state_ms:  0,
    just_completed: false,
  }

  function update(formGood: boolean): RepCounterState {
    const now = performance.now()
    state.just_completed = false

    if (formGood && !state.in_range) {
      // Possibly entering the IN_RANGE zone — confirm dwell time.
      if (state.last_state_ms === 0) state.last_state_ms = now
      if (now - state.last_state_ms >= IN_RANGE_MS) {
        state.in_range      = true
        state.last_state_ms = now
      }
    } else if (formGood && state.in_range) {
      // Still in range — hold the timer high to avoid premature transitions.
      state.last_state_ms = now
    } else if (!formGood && state.in_range) {
      // Possibly returning to RESTING — confirm dwell.
      if (now - state.last_state_ms >= REST_MS) {
        // Successful rep!
        state.in_range       = false
        state.count         += 1
        state.just_completed = true
        state.last_state_ms  = now
      }
    } else {
      // !formGood && !in_range — keep the rest timer alive but don't reset.
      state.last_state_ms = now
    }
    return { ...state }
  }

  function reset() {
    state.count          = 0
    state.in_range       = false
    state.last_state_ms  = 0
    state.just_completed = false
  }

  return {
    state,
    update,
    reset,
    setTarget: (n) => { _target = Math.max(1, Math.floor(n)) },
    target:    () => _target,
  }
}
