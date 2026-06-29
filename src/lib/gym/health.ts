/**
 * gym/health.ts  —  Apple Watch / wearable + Apple Health integration
 *
 * The honest constraints (and how we work within them):
 *
 *  • A website cannot read an Apple Watch's live heart rate directly — iOS does
 *    not expose HealthKit to Safari, and Apple Watch does not broadcast HR over
 *    standard Bluetooth to third parties. So "live HR from the watch" in a pure
 *    web app is not possible without a small companion app.
 *
 *  • What DOES work in the browser, today:
 *      1. LIVE heart rate over Web Bluetooth from any standard BLE HR sensor
 *         (chest straps, many fitness bands, Polar/Wahoo/etc.) using the
 *         standardised Heart Rate Service (0x180D). Great for live coaching.
 *      2. IMPORT of the user's Apple Health export (Health app → profile →
 *         "Export All Health Data" → export.zip → export.xml). We parse heart
 *         rate, active energy, body mass, body-fat %, VO₂max and workouts to
 *         personalise training and show history.
 *
 *  • The upgrade path to true live Apple-Watch HR is a tiny companion (a watchOS
 *    app or an iOS Shortcut) that POSTs the live BPM to this app — the live-HR
 *    UI here already accepts any source, so that drops in later.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Live heart rate over Web Bluetooth (standard Heart Rate Service)
// ─────────────────────────────────────────────────────────────────────────────

export interface HeartRateHandle {
  deviceName: string
  disconnect: () => void
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as unknown as { bluetooth?: unknown }).bluetooth
}

/** Parse a Heart Rate Measurement (0x2A37) value into BPM (spec §3.113). */
function parseHeartRate(value: DataView): number {
  const flags = value.getUint8(0)
  const uint16 = (flags & 0x01) !== 0
  return uint16 ? value.getUint16(1, /* littleEndian */ true) : value.getUint8(1)
}

/**
 * Prompt the browser's Bluetooth chooser, connect to a standard HR sensor and
 * stream BPM to `onBpm`. Must be called from a user gesture (a click).
 */
export async function connectHeartRate(
  onBpm: (bpm: number) => void,
  onDisconnect?: () => void,
): Promise<HeartRateHandle> {
  const bt = (navigator as unknown as { bluetooth: {
    requestDevice: (o: unknown) => Promise<BluetoothDeviceLike>
  } }).bluetooth
  if (!bt) throw new Error('Web Bluetooth is not available in this browser. Try Chrome or Edge on desktop/Android.')

  const device = await bt.requestDevice({
    filters: [{ services: ['heart_rate'] }],
    optionalServices: ['battery_service'],
  })

  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService('heart_rate')
  const characteristic = await service.getCharacteristic('heart_rate_measurement')

  const handler = (ev: Event) => {
    const ch = ev.target as unknown as { value?: DataView }
    if (ch.value) onBpm(parseHeartRate(ch.value))
  }
  characteristic.addEventListener('characteristicvaluechanged', handler)
  await characteristic.startNotifications()

  const onGattDisconnect = () => { onDisconnect?.() }
  device.addEventListener('gattserverdisconnected', onGattDisconnect)

  return {
    deviceName: device.name || 'Heart-rate sensor',
    disconnect: () => {
      try { characteristic.removeEventListener('characteristicvaluechanged', handler) } catch { /* ignore */ }
      try { device.removeEventListener('gattserverdisconnected', onGattDisconnect) } catch { /* ignore */ }
      try { device.gatt?.disconnect() } catch { /* ignore */ }
    },
  }
}

// Minimal structural typings so we don't depend on lib.dom Web-Bluetooth types
// (still experimental / not in every TS lib target).
interface BluetoothDeviceLike {
  name?: string
  gatt?: { connect: () => Promise<{
    getPrimaryService: (s: string) => Promise<{
      getCharacteristic: (c: string) => Promise<{
        addEventListener: (t: string, cb: (e: Event) => void) => void
        removeEventListener: (t: string, cb: (e: Event) => void) => void
        startNotifications: () => Promise<unknown>
      }>
    }>
  }>; disconnect?: () => void }
  addEventListener: (t: string, cb: () => void) => void
  removeEventListener: (t: string, cb: () => void) => void
}

// ─────────────────────────────────────────────────────────────────────────────
//  Apple Health export import (export.xml)
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthSummary {
  source:            'apple-health'
  importedAt:        number
  restingHeartRate?: number   // bpm (most recent)
  avgHeartRate?:     number   // bpm (mean of recent samples)
  vo2max?:           number
  bodyMassKg?:       number
  bodyFatPct?:       number
  activeEnergyKcal?: number   // last 7 days total
  steps7d?:          number
  workouts:          HealthWorkout[]
  heartRateSeries:   { t: number; bpm: number }[]   // recent samples for a sparkline
}

export interface HealthWorkout {
  type:        string
  start:       number
  durationMin: number
  energyKcal?: number
}

const num = (s: string | null): number | undefined => {
  if (!s) return undefined
  const n = parseFloat(s)
  return isFinite(n) ? n : undefined
}

/**
 * Parse an Apple Health `export.xml` File into a compact summary. (If a .zip is
 * provided we can't unzip in-browser without an extra library, so we ask for the
 * inner export.xml — see the thrown message.)
 */
export async function parseHealthExport(file: File): Promise<HealthSummary> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer())
  if (head[0] === 0x50 && head[1] === 0x4b) {
    throw new Error('That looks like the export.zip. Please unzip it and choose the export.xml inside (apple_health_export/export.xml).')
  }

  const text = await file.text()
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Could not read that file as Apple Health XML.')

  const summary: HealthSummary = {
    source: 'apple-health', importedAt: Date.now(),
    workouts: [], heartRateSeries: [],
  }

  const toMs = (s: string | null) => (s ? Date.parse(s.replace(/ ([-+]\d{4})$/, '$1')) : NaN)
  const weekAgo = Date.now() - 7 * 864e5

  let hrSum = 0, hrN = 0, energy7 = 0, steps7 = 0
  const records = doc.getElementsByTagName('Record')
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const type = r.getAttribute('type') || ''
    const v = num(r.getAttribute('value'))
    const end = toMs(r.getAttribute('endDate'))
    if (v == null) continue
    switch (type) {
      case 'HKQuantityTypeIdentifierRestingHeartRate': summary.restingHeartRate = Math.round(v); break
      case 'HKQuantityTypeIdentifierHeartRate':
        hrSum += v; hrN++
        if (isFinite(end)) summary.heartRateSeries.push({ t: end, bpm: Math.round(v) })
        break
      case 'HKQuantityTypeIdentifierVO2Max': summary.vo2max = +v.toFixed(1); break
      case 'HKQuantityTypeIdentifierBodyMass': summary.bodyMassKg = +v.toFixed(1); break
      case 'HKQuantityTypeIdentifierBodyFatPercentage': summary.bodyFatPct = +(v * 100).toFixed(1); break
      case 'HKQuantityTypeIdentifierActiveEnergyBurned': if (isFinite(end) && end >= weekAgo) energy7 += v; break
      case 'HKQuantityTypeIdentifierStepCount': if (isFinite(end) && end >= weekAgo) steps7 += v; break
    }
  }
  if (hrN) summary.avgHeartRate = Math.round(hrSum / hrN)
  if (energy7) summary.activeEnergyKcal = Math.round(energy7)
  if (steps7) summary.steps7d = Math.round(steps7)

  // Keep only the most recent ~120 HR samples for a tidy sparkline.
  summary.heartRateSeries.sort((a, b) => a.t - b.t)
  if (summary.heartRateSeries.length > 120) {
    summary.heartRateSeries = summary.heartRateSeries.slice(-120)
  }

  const workouts = doc.getElementsByTagName('Workout')
  for (let i = 0; i < workouts.length && summary.workouts.length < 30; i++) {
    const w = workouts[i]
    const start = toMs(w.getAttribute('startDate'))
    summary.workouts.push({
      type: (w.getAttribute('workoutActivityType') || 'Workout').replace('HKWorkoutActivityType', ''),
      start: isFinite(start) ? start : 0,
      durationMin: Math.round(num(w.getAttribute('duration')) || 0),
      energyKcal: num(w.getAttribute('totalEnergyBurned')),
    })
  }
  summary.workouts.sort((a, b) => b.start - a.start)

  return summary
}

/** Simple heart-rate training zone from a max-HR estimate (Tanaka: 208 − 0.7·age). */
export function heartRateZone(bpm: number, ageYears: number | null): { zone: number; label: string } {
  const maxHr = 208 - 0.7 * (ageYears ?? 30)
  const pct = bpm / maxHr
  if (pct < 0.6)  return { zone: 1, label: 'Warm-up' }
  if (pct < 0.7)  return { zone: 2, label: 'Fat-burn' }
  if (pct < 0.8)  return { zone: 3, label: 'Aerobic' }
  if (pct < 0.9)  return { zone: 4, label: 'Threshold' }
  return { zone: 5, label: 'Max effort' }
}
