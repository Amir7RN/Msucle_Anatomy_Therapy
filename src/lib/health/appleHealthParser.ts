/**
 * appleHealthParser.ts
 *
 * Pure parsing core for Apple Health "Export All Health Data" archives.
 *
 * The export zip contains an `export.xml` (usually under `apple_health_export/`,
 * sometimes at the root). That file can be 50 MB - 1 GB+, so we never DOM-parse
 * it whole. Instead the zip entry is streamed as string chunks (see
 * healthParser.worker.ts) into `WorkoutXmlScanner`, which scans incrementally
 * for `<Workout ...>` elements and extracts only the fields we need.
 *
 * Everything in this file is environment-agnostic (no DOM, no worker globals)
 * so it can run on the main thread, in a Web Worker, or under node for tests.
 */

// ── Output types ─────────────────────────────────────────────────────────────

export interface ParsedWorkout {
  /** Raw Apple identifier, e.g. "HKWorkoutActivityTypeTraditionalStrengthTraining". */
  activityType: string
  /** Normalised key with the HK prefix stripped and first letter lower-cased,
   *  e.g. "traditionalStrengthTraining", "running". This is the key the
   *  muscle-load lookup table (Step 4) will be seeded with. */
  activityKey: string
  /** Workout duration in minutes. */
  durationMin: number
  /** Average heart rate in bpm, when the export carries it (watch-recorded
   *  workouts usually do, via a WorkoutStatistics child). Null otherwise. */
  avgHeartRateBpm: number | null
  /** Active energy for the workout in kcal, when present. Null otherwise. */
  totalEnergyBurnedKcal: number | null
  /** ISO-8601 start/end timestamps (original UTC offset preserved). */
  startDate: string
  endDate: string
}

export interface HealthParseResult {
  workouts: ParsedWorkout[]
  /** Number of <Workout> elements that were present but unusable
   *  (missing activity type or dates). */
  skipped: number
  /** Wall-clock parse time in ms (measured in the worker). */
  parseMs: number
}

// Messages exchanged with healthParser.worker.ts
export interface ParserWorkerRequest {
  buffer: ArrayBuffer
}
export type ParserWorkerResponse =
  | { kind: 'progress'; percent: number; workoutsFound: number }
  | { kind: 'done'; result: HealthParseResult }
  | { kind: 'error'; message: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse the attributes of a single XML tag string. */
function readAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([\w:]+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tag))) out[m[1]] = m[2]
  return out
}

/** "HKWorkoutActivityTypeRunning" -> "running";
 *  "HKWorkoutActivityTypeTraditionalStrengthTraining" -> "traditionalStrengthTraining". */
export function normaliseActivityKey(activityType: string): string {
  const stripped = activityType.replace(/^HKWorkoutActivityType/, '')
  if (!stripped) return activityType
  return stripped.charAt(0).toLowerCase() + stripped.slice(1)
}

/** Apple Health dates look like "2026-05-14 07:31:02 -0800".
 *  Normalise to ISO-8601 ("2026-05-14T07:31:02-08:00"). */
export function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2}):?(\d{2})$/)
  if (m) return `${m[1]}T${m[2]}${m[3]}:${m[4]}`
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Duration attribute + unit -> minutes. Falls back to date delta. */
function durationMinutes(attrs: Record<string, string>, startIso: string | null, endIso: string | null): number | null {
  const v = parseFloat(attrs.duration)
  if (Number.isFinite(v)) {
    const unit = (attrs.durationUnit ?? 'min').toLowerCase()
    if (unit === 'min') return v
    if (unit === 'sec' || unit === 's') return v / 60
    if (unit === 'hr' || unit === 'h') return v * 60
    return v // unknown unit — Apple has only ever used min in practice
  }
  if (startIso && endIso) {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
    if (Number.isFinite(ms) && ms > 0) return ms / 60_000
  }
  return null
}

// ── Incremental scanner ──────────────────────────────────────────────────────

const OPEN_TAG = '<Workout '
const CLOSE_TAG = '</Workout>'

/**
 * Feed string chunks with `push()`; call `finish()` after the last chunk.
 * Extracted workouts accumulate on `workouts`.
 *
 * A <Workout> element may contain children (MetadataEntry, WorkoutEvent,
 * WorkoutStatistics, WorkoutRoute) but never a nested <Workout>, so scanning
 * for the literal close tag is safe. Self-closing workouts (older exports)
 * are handled too.
 */
export class WorkoutXmlScanner {
  readonly workouts: ParsedWorkout[] = []
  skipped = 0
  private carry = ''

  push(chunk: string): void {
    const text = this.carry + chunk
    this.carry = ''
    let pos = 0
    for (;;) {
      const start = text.indexOf(OPEN_TAG, pos)
      if (start === -1) {
        // Keep a small tail in case "<Workout " straddles the chunk boundary.
        this.carry = text.slice(Math.max(pos, text.length - OPEN_TAG.length))
        return
      }
      const tagEnd = text.indexOf('>', start)
      if (tagEnd === -1) {
        this.carry = text.slice(start)
        return
      }
      let elemEnd: number
      if (text[tagEnd - 1] === '/') {
        elemEnd = tagEnd + 1
      } else {
        const close = text.indexOf(CLOSE_TAG, tagEnd)
        if (close === -1) {
          this.carry = text.slice(start)
          return
        }
        elemEnd = close + CLOSE_TAG.length
      }
      this.handleElement(text.slice(start, elemEnd))
      pos = elemEnd
    }
  }

  finish(): void {
    this.carry = ''
  }

  private handleElement(elem: string): void {
    const openEnd = elem.indexOf('>')
    const attrs = readAttrs(elem.slice(0, openEnd + 1))

    const activityType = attrs.workoutActivityType
    const startDate = toIsoDate(attrs.startDate)
    const endDate = toIsoDate(attrs.endDate)
    if (!activityType || !startDate || !endDate) {
      this.skipped++
      return
    }

    const durationMin = durationMinutes(attrs, startDate, endDate)
    if (durationMin === null || durationMin <= 0) {
      this.skipped++
      return
    }

    // Children: newer exports (iOS 16+) put heart rate and active energy in
    // <WorkoutStatistics> children; older exports have totalEnergyBurned as a
    // Workout attribute. Support both.
    let avgHeartRateBpm: number | null = null
    let statsEnergyKcal: number | null = null
    const statsRe = /<WorkoutStatistics\b[^>]*>/g
    let sm: RegExpExecArray | null
    while ((sm = statsRe.exec(elem))) {
      const s = readAttrs(sm[0])
      if (s.type === 'HKQuantityTypeIdentifierHeartRate') {
        const avg = parseFloat(s.average)
        if (Number.isFinite(avg)) avgHeartRateBpm = avg
      } else if (s.type === 'HKQuantityTypeIdentifierActiveEnergyBurned') {
        const sum = parseFloat(s.sum)
        if (Number.isFinite(sum)) statsEnergyKcal = sum
      }
    }
    const attrEnergy = parseFloat(attrs.totalEnergyBurned)
    const totalEnergyBurnedKcal = Number.isFinite(attrEnergy) ? attrEnergy : statsEnergyKcal

    this.workouts.push({
      activityType,
      activityKey: normaliseActivityKey(activityType),
      durationMin: Math.round(durationMin * 100) / 100,
      avgHeartRateBpm,
      totalEnergyBurnedKcal,
      startDate,
      endDate,
    })
  }
}
