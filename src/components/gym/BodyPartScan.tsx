/**
 * BodyPartScan.tsx — a scan scoped to the muscle group being trained.
 *
 * Instead of a whole-body read, this frames the trained region (upper body /
 * lower body / core), captures when the user is steady, and records a couple of
 * trackable data points over time:
 *   • a development index — a camera-derived size/proportion proxy for that
 *     region (honest: a relative trend marker, not a clinical measurement),
 *   • an optional AI body-fat read for the region (uses the stored key; one call).
 *
 * Uses the same forgiving, never-stuck capture pattern as the fixed full-body
 * scan: specific cues, tolerant stillness, an auto-capture timeout, and an
 * always-available manual button.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, Check, Loader2, Sparkles, TrendingUp } from 'lucide-react'
import { CameraView } from '../movement/CameraView'
import { disposeDetector } from '../../lib/movement/poseDetector'
import { LM, dist2D, visible, type LandmarkSet } from '../../lib/movement/landmarks'
import { useVoiceOutput } from '../../hooks/useVoice'
import { useGymStore } from '../../store/gymStore'
import { muscleGroupById, type MuscleGroupId } from '../../lib/gym/exercises'
import { grabStillBase64 } from '../../lib/profile/bodyVision'
import { getStoredApiKey } from '../../lib/triage/llm'

type Region = 'upper' | 'lower' | 'core'
const REGION_OF: Record<MuscleGroupId, Region> = {
  shoulders: 'upper', chest: 'upper', arms: 'upper', back: 'upper', legs: 'lower', core: 'core',
}
const REGION_LABEL: Record<Region, string> = { upper: 'upper body', lower: 'lower body', core: 'midsection' }

const HOLD_MS = 1600, STILL = 0.02, AUTO_MS = 6000

function midX(a: { x: number }, b: { x: number }) { return (a.x + b.x) / 2 }
function midY(a: { y: number }, b: { y: number }) { return (a.y + b.y) / 2 }

/** Region-specific landmarks we need in frame. */
function regionVisible(lms: LandmarkSet, r: Region): boolean {
  if (r === 'upper') return visible(lms, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_HIP, LM.R_HIP)
  if (r === 'lower') return visible(lms, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE)
  return visible(lms, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP)
}

/** A normalised "development index" proxy for the region (relative trend marker). */
function developmentIndex(lms: LandmarkSet, r: Region): number {
  const sX = midX(lms[LM.L_SHOULDER], lms[LM.R_SHOULDER]), sY = midY(lms[LM.L_SHOULDER], lms[LM.R_SHOULDER])
  const hX = midX(lms[LM.L_HIP], lms[LM.R_HIP]), hY = midY(lms[LM.L_HIP], lms[LM.R_HIP])
  const torso = Math.hypot(sX - hX, sY - hY) || 1
  if (r === 'upper') {
    const shoulder = dist2D(lms[LM.L_SHOULDER], lms[LM.R_SHOULDER])
    return +(shoulder / torso * 100).toFixed(1)            // broader shoulders rel. torso → higher
  }
  if (r === 'lower') {
    const thigh = (dist2D(lms[LM.L_HIP], lms[LM.L_KNEE]) + dist2D(lms[LM.R_HIP], lms[LM.R_KNEE])) / 2
    const hip = dist2D(lms[LM.L_HIP], lms[LM.R_HIP])
    return +((thigh + hip) / torso * 100).toFixed(1)
  }
  const waist = dist2D(lms[LM.L_HIP], lms[LM.R_HIP])
  const shoulder = dist2D(lms[LM.L_SHOULDER], lms[LM.R_SHOULDER]) || 1
  return +(waist / shoulder * 100).toFixed(1)               // lower → more V-taper
}

function motionOf(prev: LandmarkSet | null, cur: LandmarkSet): number {
  if (!prev) return 1
  const ids = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE]
  let s = 0, n = 0
  for (const i of ids) { const a = prev[i], b = cur[i]; if (a && b) { s += Math.hypot(a.x - b.x, a.y - b.y); n++ } }
  return n ? s / n : 1
}

export function BodyPartScan() {
  const groupId  = useGymStore((s) => s.selectedGroup)
  const back     = useGymStore((s) => s.back)
  const logScan  = useGymStore((s) => s.logPartScan)
  const partScans = useGymStore((s) => s.partScans)
  const group = groupId ? muscleGroupById(groupId) : undefined
  const region: Region = groupId ? REGION_OF[groupId] : 'upper'

  const voice = useVoiceOutput()
  const [active, setActive] = useState(false)
  const [ready, setReady]   = useState(false)
  const [inFrame, setInFrame] = useState(false)
  const [progress, setProgress] = useState(0)
  const [hint, setHint] = useState('Center your ' + REGION_LABEL[region] + ' in the frame.')
  const [result, setResult] = useState<{ idx: number; bodyFat?: number } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)

  const prev = useRef<LandmarkSet | null>(null)
  const holdStart = useRef<number | null>(null)
  const visibleStart = useRef<number | null>(null)
  const lastIdx = useRef<number>(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const captured = useRef(false)

  useEffect(() => () => { disposeDetector(); try { window.speechSynthesis?.cancel() } catch { /* ignore */ } }, [])

  const capture = useCallback(() => {
    if (captured.current) return
    captured.current = true
    setProgress(1)
    const idx = lastIdx.current
    setResult({ idx })
    try { voice.speak('Captured. Logged your ' + REGION_LABEL[region] + ' reading.') } catch { /* ignore */ }
    if (groupId) logScan({ group: groupId, at: Date.now(), girthIndex: idx })
  }, [groupId, region, logScan, voice])

  const onLandmarks = useCallback((lms: LandmarkSet) => {
    if (captured.current) return
    const motion = motionOf(prev.current, lms); prev.current = lms
    const vis = regionVisible(lms, region)
    setInFrame(vis)
    const now = performance.now()
    if (!vis) {
      holdStart.current = null; visibleStart.current = null; setProgress(0)
      setHint(`Step back so your whole ${REGION_LABEL[region]} is in view.`)
      return
    }
    lastIdx.current = developmentIndex(lms, region)
    if (visibleStart.current == null) visibleStart.current = now
    if (motion < STILL) {
      if (holdStart.current == null) { holdStart.current = now; setHint('Hold still…') }
      const p = Math.min(1, (now - holdStart.current) / HOLD_MS)
      setProgress(p)
      if (p >= 1) { if (videoRef.current) grabStillBase64(videoRef.current); capture() }
    } else {
      if (motion > 0.05) { holdStart.current = null; setProgress(0) }
      setHint('Almost — hold steady.')
    }
    if (visibleStart.current != null && now - visibleStart.current > AUTO_MS) capture()
  }, [region, capture])

  const aiRead = useCallback(async () => {
    const key = getStoredApiKey()
    if (!key || !videoRef.current) return
    const still = grabStillBase64(videoRef.current)
    if (!still) return
    setAiBusy(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 60,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: still } },
            { type: 'text', text: `Rough fitness estimate only. From this photo, estimate the body-fat % visible around the ${REGION_LABEL[region]}. Reply ONLY JSON: {"bodyFatPct": <number>}` },
          ] }],
        }),
      })
      if (res.ok) {
        const data = await res.json() as { content?: Array<{ type: string; text?: string }> }
        const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
        const m = text.match(/[\d.]+/)
        const bf = m ? parseFloat(m[0]) : NaN
        if (isFinite(bf)) {
          setResult((r) => r ? { ...r, bodyFat: +bf.toFixed(1) } : r)
          if (groupId) logScan({ group: groupId, at: Date.now(), girthIndex: lastIdx.current, bodyFatPct: +bf.toFixed(1) })
        }
      }
    } catch { /* ignore */ } finally { setAiBusy(false) }
  }, [region, groupId, logScan])

  const restart = useCallback(() => {
    captured.current = false; holdStart.current = null; visibleStart.current = null
    setResult(null); setProgress(0); setInFrame(false)
  }, [])

  if (!group) return null
  const prior = partScans.filter((s) => s.group === groupId && s.girthIndex != null)
  const last = prior[0]?.girthIndex

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-stone-950 to-black text-stone-100">
      <header className="flex items-center gap-2 border-b border-amber-500/15 bg-black/50 px-4 py-2.5">
        <button onClick={back} className="rounded-lg p-1.5 text-stone-300 hover:bg-stone-800"><ArrowLeft size={18} /></button>
        <Camera size={16} className={group.accent.text} />
        <div className="text-sm font-bold">Scan · {group.name}</div>
        <span className="ml-2 rounded-full bg-stone-800 px-2 py-0.5 text-[10px] text-stone-400">on-device · private</span>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="relative h-[48vh] shrink-0 bg-black lg:h-auto lg:flex-1">
          {active ? (
            <>
              <CameraView active onLandmarks={onLandmarks} onReady={() => setReady(true)}
                onError={(m) => setHint(m)} onVideoReady={(v) => { videoRef.current = v }} />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-4">
                <div className={['rounded-full px-3 py-1 text-xs font-semibold backdrop-blur', inFrame ? 'bg-emerald-600/80 text-white' : 'bg-orange-700/85 text-orange-100'].join(' ')}>
                  {!ready ? 'Starting camera…' : (hint)}
                </div>
                {/* target frame for the region */}
                <div className={['rounded-2xl border-2 border-dashed transition-colors', inFrame ? 'border-emerald-400/70' : 'border-amber-300/50',
                  region === 'upper' ? 'h-[42%] w-[58%]' : region === 'lower' ? 'h-[55%] w-[46%]' : 'h-[34%] w-[52%]'].join(' ')} />
                <button onClick={capture} className="pointer-events-auto rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-black shadow-lg hover:bg-amber-400">
                  Capture now
                </button>
              </div>
              {progress > 0 && progress < 1 && (
                <div className="pointer-events-none absolute bottom-3 left-3 h-1.5 w-32 overflow-hidden rounded-full bg-stone-700">
                  <div className="h-full bg-amber-400" style={{ width: `${progress * 100}%` }} />
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <div className={['flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br text-white', group.accent.from, group.accent.to].join(' ')}><Camera size={34} /></div>
              <div>
                <div className="text-lg font-bold">Scan your {REGION_LABEL[region]}</div>
                <p className="mt-1 max-w-xs text-xs text-stone-400">Frames your {group.name.toLowerCase()} to log a development index over time. A camera can't measure body fat like a clinic — readings are estimates/trends.</p>
              </div>
              <button onClick={() => setActive(true)} className={['rounded-full bg-gradient-to-r px-6 py-3 text-sm font-bold text-white shadow-lg hover:brightness-110', group.accent.from, group.accent.to].join(' ')}>Start scan</button>
            </div>
          )}
        </div>

        {/* result column */}
        <div className="flex w-full flex-col gap-3 overflow-y-auto p-4 lg:w-[340px] lg:border-l lg:border-amber-500/10">
          {!result ? (
            <div className="rounded-xl bg-stone-900/70 p-3 text-sm text-stone-300 ring-1 ring-stone-700/50">
              I capture automatically when your {REGION_LABEL[region]} is in frame and you hold still — or tap <span className="font-semibold text-amber-300">Capture now</span>.
              {last != null && <div className="mt-2 text-xs text-stone-400">Last {group.name} index: <span className="font-semibold text-stone-200">{last}</span></div>}
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-stone-900/70 p-3 ring-1 ring-stone-700/50">
                <div className="text-[11px] uppercase tracking-wider text-amber-300">{group.name} development index</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums">{result.idx}</span>
                  {last != null && last !== result.idx && (
                    <span className={['flex items-center gap-0.5 text-xs', result.idx > last ? 'text-emerald-400' : 'text-stone-400'].join(' ')}>
                      <TrendingUp size={12} /> {result.idx > last ? '+' : ''}{(result.idx - last).toFixed(1)} vs last
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-stone-500">A camera-derived proportion proxy for this region. Best read as a trend across scans, not an absolute measure.</p>
              </div>

              <div className="rounded-xl bg-stone-900/70 p-3 ring-1 ring-stone-700/50">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300"><Sparkles size={12} /> AI body-fat read</div>
                {result.bodyFat != null ? (
                  <div className="text-2xl font-bold tabular-nums">{result.bodyFat}%<span className="ml-1 text-[11px] font-normal text-stone-500">around {REGION_LABEL[region]} · estimate</span></div>
                ) : (
                  <button onClick={aiRead} disabled={aiBusy}
                    className="flex items-center gap-2 rounded-lg bg-stone-800 px-3 py-2 text-sm font-semibold text-amber-200 ring-1 ring-amber-500/30 hover:bg-stone-700 disabled:opacity-60">
                    {aiBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                    {aiBusy ? 'Reading…' : 'Estimate with AI (1 call)'}
                  </button>
                )}
                {!getStoredApiKey() && <p className="mt-1 text-[10px] text-stone-500">Add your Anthropic key in the Triage chat to enable.</p>}
              </div>

              <div className="mt-auto flex gap-2">
                <button onClick={restart} className="flex-1 rounded-xl bg-stone-800 px-3 py-2.5 text-sm font-semibold hover:bg-stone-700">Rescan</button>
                <button onClick={back} className={['flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r px-3 py-2.5 text-sm font-bold text-white hover:brightness-110', group.accent.from, group.accent.to].join(' ')}>
                  <Check size={16} /> Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
