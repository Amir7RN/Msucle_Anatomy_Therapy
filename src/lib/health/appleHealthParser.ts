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

/** Body/gait metrics harvested from <Record> elements (daily means). */
export type BodyMetricKey =
  | 'bodyMass'                 // kg
  | 'height'                   // cm
  | 'vo2Max'                   // mL/kg/min
  | 'restingHeartRate'         // bpm
  | 'hrvSdnn'                  // ms
  | 'walkingAsymmetryPct'      // %
  | 'walkingDoubleSupportPct'  // %
  | 'walkingSpeed'             // km/h

export interface MetricPoint {
  /** Day, YYYY-MM-DD. */
  d: string
  /** Daily mean value (unit per BodyMetricKey). */
  v: number
}

export interface HealthProfile {
  /** From the export's <Me> element, when present. */
  dateOfBirth: string | null
  biologicalSex: 'male' | 'female' | null
}

export interface HealthParseResult {
  workouts: ParsedWorkout[]
  /** Daily-mean series per harvested metric (empty array when absent). */
  metrics: Record<BodyMetricKey, MetricPoint[]>
  profile: HealthProfile
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

// <Record> types worth harvesting for the insights panel. Values are unit
// converters into the canonical unit documented on BodyMetricKey.
const RECORD_TYPES: Record<string, { key: BodyMetricKey; convert: (v: number, unit: string) => number }> = {
  BodyMass:                      { key: 'bodyMass', convert: (v, u) => (u === 'lb' ? v * 0.45359237 : u === 'g' ? v / 1000 : v) },
  Height:                        { key: 'height', convert: (v, u) => (u === 'in' ? v * 2.54 : u === 'm' ? v * 100 : u === 'ft' ? v * 30.48 : v) },
  VO2Max:                        { key: 'vo2Max', convert: (v) => v },
  RestingHeartRate:              { key: 'restingHeartRate', convert: (v) => v },
  HeartRateVariabilitySDNN:      { key: 'hrvSdnn', convert: (v) => v },
  WalkingAsymmetryPercentage:    { key: 'walkingAsymmetryPct', convert: (v, u) => (u === '%' ? v : v * 100) },
  WalkingDoubleSupportPercentage:{ key: 'walkingDoubleSupportPct', convert: (v, u) => (u === '%' ? v : v * 100) },
  WalkingSpeed:                  { key: 'walkingSpeed', convert: (v, u) => (u === 'm/s' ? v * 3.6 : u === 'mi/hr' ? v * 1.609344 : v) },
}

const RECORD_RE = new RegExp(
  '<Record type="HKQuantityTypeIdentifier(' + Object.keys(RECORD_TYPES).join('|') + ')"[^>]*>',
  'g',
)

export function emptyMetrics(): Record<BodyMetricKey, MetricPoint[]> {
  return {
    bodyMass: [], height: [], vo2Max: [], restingHeartRate: [], hrvSdnn: [],
    walkingAsymmetryPct: [], walkingDoubleSupportPct: [], walkingSpeed: [],
  }
}

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
  profile: HealthProfile = { dateOfBirth: null, biologicalSex: null }
  private carry = ''
  /** Per-metric, per-day accumulators (sum + count -> daily mean). */
  private metricDays: Record<BodyMetricKey, Map<string, { s: number; n: number }>> = {
    bodyMass: new Map(), height: new Map(), vo2Max: new Map(),
    restingHeartRate: new Map(), hrvSdnn: new Map(),
    walkingAsymmetryPct: new Map(), walkingDoubleSupportPct: new Map(),
    walkingSpeed: new Map(),
  }
  private recCarry = ''
  private sawMe = false

  push(chunk: string): void {
    this.scanRecords(chunk)
    this.scanWorkouts(chunk)
  }

  private scanWorkouts(chunk: string): void {
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
    this.recCarry = ''
  }

  /** Daily-mean series per metric, chronologically sorted. */
  metrics(): Record<BodyMetricKey, MetricPoint[]> {
    const out = emptyMetrics()
    for (const key of Object.keys(this.metricDays) as BodyMetricKey[]) {
      const pts: MetricPoint[] = []
      for (const [d, acc] of this.metricDays[key]) {
        pts.push({ d, v: Math.round((acc.s / acc.n) * 100) / 100 })
      }
      pts.sort((a, b) => a.d.localeCompare(b.d))
      out[key] = pts
    }
    return out
  }

  /**
   * Harvest self-closing <Record .../> elements (each sits on its own line in
   * Apple's export) plus the single <Me .../> characteristics element. Uses a
   * newline-framed carry, independent from the workout carry, so a tag split
   * across chunks is completed on the next push.
   */
  private scanRecords(chunk: string): void {
    const text = this.recCarry + chunk
    const lastNl = text.lastIndexOf('\n')
    if (lastNl === -1) {
      // Pathological single-line chunk stream — cap the carry so it can't grow
      // unbounded; Record lines are far shorter than 64k.
      this.recCarry = text.length > 65536 ? text.slice(-65536) : text
      return
    }
    const body = text.slice(0, lastNl)
    this.recCarry = text.slice(lastNl + 1)

    if (!this.sawMe) {
      const me = body.indexOf('<Me ')
      if (me !== -1) {
        const end = body.indexOf('>', me)
        if (end !== -1) {
          const a = readAttrs(body.slice(me, end + 1))
          const dob = a.HKCharacteristicTypeIdentifierDateOfBirth
          if (dob && /^\d{4}-\d{2}-\d{2}/.test(dob)) this.profile.dateOfBirth = dob.slice(0, 10)
          const sex = a.HKCharacteristicTypeIdentifierBiologicalSex
          if (sex === 'HKBiologicalSexMale') this.profile.biologicalSex = 'male'
          else if (sex === 'HKBiologicalSexFemale') this.profile.biologicalSex = 'female'
          this.sawMe = true
        }
      }
    }

    RECORD_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = RECORD_RE.exec(body))) {
      const spec = RECORD_TYPES[m[1]]
      if (!spec) continue
      const a = readAttrs(m[0])
      const v = parseFloat(a.value)
      if (!Number.isFinite(v)) continue
      const date = (a.startDate ?? a.endDate ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      const cv = spec.convert(v, a.unit ?? '')
      if (!Number.isFinite(cv)) continue
      const day = this.metricDays[spec.key]
      const acc = day.get(date)
      if (acc) { acc.s += cv; acc.n++ } else day.set(date, { s: cv, n: 1 })
    }
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
