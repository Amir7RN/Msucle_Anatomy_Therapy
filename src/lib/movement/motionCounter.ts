export type MotionPhase = 'find_start' | 'move_to_target' | 'return_to_start'

export interface MotionCountState {
  count: number
  phase: MotionPhase
  justCompleted: boolean
}

const inRange = (value: number, range: [number, number], margin = 0) =>
  value >= range[0] - margin && value <= range[1] + margin

/** Counts only a complete, visible start → target → start cycle. */
export function createMotionCounter(start: [number, number], target: [number, number]) {
  let count = 0
  let phase: MotionPhase = 'find_start'
  let enteredAt = 0

  function reset() {
    count = 0
    phase = 'find_start'
    enteredAt = 0
  }

  function update(value: number | null, now = performance.now()): MotionCountState {
    let justCompleted = false
    // Missing tracking freezes the state. It never advances or completes.
    if (value === null) return { count, phase, justCompleted }

    const startHit = inRange(value, start, 4)
    const targetHit = inRange(value, target, 4)
    const dwell = (hit: boolean) => {
      if (!hit) { enteredAt = 0; return false }
      if (enteredAt === 0) enteredAt = now
      return now - enteredAt >= 300
    }

    if (phase === 'find_start' && dwell(startHit)) {
      phase = 'move_to_target'; enteredAt = 0
    } else if (phase === 'move_to_target' && dwell(targetHit)) {
      phase = 'return_to_start'; enteredAt = 0
    } else if (phase === 'return_to_start' && dwell(startHit)) {
      count += 1; justCompleted = true; phase = 'move_to_target'; enteredAt = 0
    }
    return { count, phase, justCompleted }
  }

  return { update, reset }
}
