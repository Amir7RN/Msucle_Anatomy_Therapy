/**
 * RemoteAssessmentCall.tsx
 *
 * Practitioner-guided REMOTE assessment — a live video call with a real-time
 * pose overlay, modelled on how Sword Health / Hinge Health run virtual visits.
 *
 *   • HOST (you, on your PC): click "Remote Assessment (Live Call)", get a
 *     shareable link, and once your friend joins you see THEIR camera with a
 *     MediaPipe skeleton drawn on top, live left/right ankle angles, and a
 *     two-way voice channel so you can direct them ("step left… turn… walk
 *     back"). A Record button captures the ankle time-series and produces the
 *     same excursion summary + CSV as the self-guided test.
 *
 *   • CLIENT (your friend): just opens the link you send — NOTHING to install.
 *     Their browser asks for camera permission, shows a small self-view, and
 *     streams to you. They follow your spoken guidance.
 *
 * Transport: peer-to-peer WebRTC; signaling over Supabase Realtime (see
 * lib/call/signaling.ts) so there's no extra server. Pose detection runs on the
 * HOST side over the received video — the client's device does no heavy work.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X, Copy, Check, Mic, MicOff, Video, SwitchCamera, Circle, Square,
  Download, Wifi, WifiOff, Footprints, Camera, FileText, Image as ImageIcon,
} from 'lucide-react'
import { ensureDetector, detectVideoFrame, disposeDetector } from '../../lib/movement/poseDetector'
import { LM, jointAngleDeg } from '../../lib/movement/landmarks'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import {
  measureGaitFrame, summariseGait, fillInstantaneousSpeed, buildGaitCsv,
  GaitStepMachine, GaitGapFiller, ANKLE_DEPTH_TRUST_CAP, downloadText,
  type GaitSample, type GaitSummary, type GapFillResult,
} from '../../lib/movement/gait'
import { saveGaitSession } from '../../lib/movement/gaitHistory'
import { createLandmarkFilter, type LandmarkFilter } from '../../lib/movement/signalFilter'
import { BaselineCollector, baselineKey } from '../../lib/movement/calibration'
import { measurementConfidence, confidenceBand } from '../../lib/movement/constraints'
import { depthReliability } from '../../lib/movement/anatomicalFrame'
import { createSignaling, getIceServers, turnConfigured, loadTurnConfig, saveTurnConfig, probeIce, randomId, type Signaling, type SignalMsg, type IceProbe } from '../../lib/call/signaling'
import { buildAssessmentPdf, chartDataUrl, downloadDataUrl, type StaticCapture } from '../../lib/call/report'

// Edge guide lines (fraction of frame width) shown over the host's view so the
// practitioner can see where the client should stand to start/finish.
const LINE_L = 0.18
const LINE_R = 0.82

type Role = 'host' | 'client'
type ConnState = 'idle' | 'waiting' | 'connecting' | 'connected' | 'failed' | 'closed'

interface Props {
  open:    boolean
  role:    Role
  roomId:  string
  onClose: () => void
  /** 'full' (default) shows every primary joint — the standalone "Remote
   *  Assessment" sidebar card's use case. 'lowerLimb' shows ankle only and
   *  draws just the lower-limb skeleton — the Movement Assessment chooser's
   *  "Remote Assessment (Live Call)" option, whose own copy ("watch their
   *  live pose & ankle angles") promises exactly this and previously didn't
   *  actually deliver it (both entry points rendered the same full view). */
  focus?:  'full' | 'lowerLimb'
}

/** Build the link a host shares with a client to join this room. */
export function buildCallLink(roomId: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, '/')
  return `${base}?atlas=1&call=${roomId}`
}

// Skeleton edges drawn over the remote video (host side) — 'full' focus.
const EDGES: Array<[number, number, string]> = [
  [LM.L_SHOULDER, LM.R_SHOULDER, '#fb923c'],
  [LM.L_SHOULDER, LM.L_HIP, '#fb923c'], [LM.R_SHOULDER, LM.R_HIP, '#fb923c'],
  [LM.L_HIP, LM.R_HIP, '#fb923c'],
  [LM.L_SHOULDER, LM.L_ELBOW, '#22d3ee'], [LM.L_ELBOW, LM.L_WRIST, '#a5f3fc'],
  [LM.R_SHOULDER, LM.R_ELBOW, '#f472b6'], [LM.R_ELBOW, LM.R_WRIST, '#fbcfe8'],
  [LM.L_HIP, LM.L_KNEE, '#a3e635'], [LM.L_KNEE, LM.L_ANKLE, '#d9f99d'], [LM.L_ANKLE, LM.L_FOOT_IDX, '#d9f99d'],
  [LM.R_HIP, LM.R_KNEE, '#fde047'], [LM.R_KNEE, LM.R_ANKLE, '#fef08a'], [LM.R_ANKLE, LM.R_FOOT_IDX, '#fef08a'],
]
const JOINTS = [
  LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP,
  LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE, LM.L_ELBOW, LM.R_ELBOW,
]

// Lower-limb-only subset — 'lowerLimb' focus. Keeps the pelvis line for
// orientation context but drops shoulders/arms entirely so the overlay
// visually matches what it's actually measuring.
const LOWER_LIMB_EDGES: Array<[number, number, string]> = [
  [LM.L_HIP, LM.R_HIP, '#fb923c'],
  [LM.L_HIP, LM.L_KNEE, '#a3e635'], [LM.L_KNEE, LM.L_ANKLE, '#d9f99d'], [LM.L_ANKLE, LM.L_FOOT_IDX, '#d9f99d'],
  [LM.R_HIP, LM.R_KNEE, '#fde047'], [LM.R_KNEE, LM.R_ANKLE, '#fef08a'], [LM.R_ANKLE, LM.R_FOOT_IDX, '#fef08a'],
]
const LOWER_LIMB_JOINTS = [LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE]

function drawSkeleton(
  ctx: CanvasRenderingContext2D, lms: LandmarkSet, w: number, h: number,
  edges: Array<[number, number, string]>, joints: number[],
) {
  ctx.lineCap = 'round'
  for (const [a, b, color] of edges) {
    const pa = lms[a], pb = lms[b]
    if (!pa || !pb) continue
    if ((pa.visibility ?? 0) < 0.3 || (pb.visibility ?? 0) < 0.3) continue
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(4, w * 0.008)
    ctx.beginPath(); ctx.moveTo(pa.x * w, pa.y * h); ctx.lineTo(pb.x * w, pb.y * h); ctx.stroke()
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, w * 0.005)
    ctx.beginPath(); ctx.moveTo(pa.x * w, pa.y * h); ctx.lineTo(pb.x * w, pb.y * h); ctx.stroke()
  }
  for (const j of joints) {
    const p = lms[j]
    if (!p || (p.visibility ?? 0) < 0.3) continue
    ctx.fillStyle = '#e2e8f0'
    ctx.beginPath(); ctx.arc(p.x * w, p.y * h, Math.max(3, w * 0.006), 0, Math.PI * 2); ctx.fill()
  }
}

/** Vertical start/finish guide lines + labels on the host overlay. */
function drawGuideLines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  for (const fx of [LINE_L, LINE_R]) {
    const x = fx * w
    ctx.strokeStyle = 'rgba(34,211,238,0.85)'
    ctx.lineWidth = Math.max(2, w * 0.004)
    ctx.setLineDash([w * 0.02, w * 0.015])
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
    ctx.setLineDash([])
    // label tag near the bottom
    ctx.fillStyle = 'rgba(34,211,238,0.9)'
    const fontPx = Math.max(14, w * 0.018)
    ctx.font = `bold ${fontPx}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('START', x, h - fontPx)
    ctx.textAlign = 'left'
  }
}

// Synthetic catalog keys for the shared BaselineCollector (lib/movement/calibration) —
// this call has no ROM catalog entry, so we mint our own stable key names.
const KEY_ANKLE_L = baselineKey('gaitAnkle', 'L')
const KEY_ANKLE_R = baselineKey('gaitAnkle', 'R')
const KEY_SHANK_L = baselineKey('gaitShank', 'L')
const KEY_SHANK_R = baselineKey('gaitShank', 'R')

const BASELINE_WINDOW_MS = 300     // typical convergence — the first frame already reads ~0
const BASELINE_HARD_CAP_MS = 2000  // give up waiting on a channel that's occluded at press-time
const BASELINE_MIN_SAMPLES = 3

/** raw − offset, WITHOUT clamping to zero — dorsi/plantarflexion is a signed
 *  delta from neutral in both directions. (calibration.ts's own `applyBaseline`
 *  clamps to >=0, which is correct for its ROM-excursion use case but would
 *  silently clip every plantarflexion reading to 0 here — not reused.) */
function zeroSigned(v: number | null, off: Record<string, number> | null, key: string): number | null {
  if (v == null || off == null) return v
  const o = off[key]
  return o == null ? v : v - o
}

/** What's actually displayed/burned-in for one channel this frame: gap-filled
 *  always, additionally zeroed to the recording's neutral baseline once one
 *  exists. Kept in one place so the live panel, the burned-in overlay, and
 *  "Capture static posture" can never disagree about the same instant. */
interface ChannelReading extends GapFillResult {
  display: number | null
}

interface LastReading {
  m:  ReturnType<typeof measureGaitFrame> | null
  la: ChannelReading; ra: ChannelReading; ls: ChannelReading; rs: ChannelReading
}

/** Small "L −8°" / "R 6°" labels burned in next to each ankle — on the live
 *  overlay AND the recorded composite canvas, so the saved clip is
 *  self-documenting. Solid text for a genuine reading, dim "~"-prefixed for a
 *  gap-filled (interpolated) one, "—" for a genuine tracking-lost null. */
function drawAnkleLabels(ctx: CanvasRenderingContext2D, lms: LandmarkSet, w: number, h: number, reading: LastReading) {
  const fontPx = Math.max(12, w * 0.016)
  ctx.font = `bold ${fontPx}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'left'
  const label = (v: number | null, interpolated: boolean) =>
    v == null ? '—' : `${interpolated ? '~' : ''}${v > 0 ? '+' : ''}${Math.round(v)}°`
  const draw = (idx: number, text: string, color: string, dim: boolean, dx: number) => {
    const p = lms[idx]
    if (!p) return
    const x = p.x * w + dx, y = p.y * h
    ctx.globalAlpha = dim ? 0.55 : 0.95
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(2, w * 0.003)
    ctx.strokeText(text, x, y)
    ctx.fillStyle = color
    ctx.fillText(text, x, y)
    ctx.globalAlpha = 1
  }
  draw(LM.L_ANKLE, label(reading.la.display, reading.la.interpolated), '#fb923c', reading.la.interpolated, -fontPx * 2.6)
  draw(LM.R_ANKLE, label(reading.ra.display, reading.ra.interpolated), '#22d3ee', reading.ra.interpolated, fontPx * 0.5)
}

// ── Full-body live joint readout ─────────────────────────────────────────────
// The remote assessment used to surface only the ankle pair (gait focus).
// The evaluator now gets EVERY primary joint, live: flexion at elbows, hips
// and knees, shoulder elevation, plus the ankle pair — each side, in degrees.

export interface JointReadout {
  /** joint key → { l, r } degrees, null when the landmarks were occluded. */
  [joint: string]: { l: number | null; r: number | null }
}

/** Tracking-confidence band for the ankle-row badge (see ConfidenceDot). */
type ConfBand = 'strong' | 'fair' | 'weak'

const JOINT_ROWS: Array<{ key: string; label: string }> = [
  { key: 'shoulder', label: 'Shoulder elev.' },
  { key: 'elbow',    label: 'Elbow flex.' },
  { key: 'hip',      label: 'Hip flex.' },
  { key: 'knee',     label: 'Knee flex.' },
  { key: 'ankle',    label: 'Ankle' },
]

/** One joint angle if all three landmarks are visible enough, else null. */
function angleOrNull(lms: LandmarkSet, a: number, b: number, c: number, min = 0.35): number | null {
  const pa = lms[a], pb = lms[b], pc = lms[c]
  if (!pa || !pb || !pc) return null
  if ((pa.visibility ?? 0) < min || (pb.visibility ?? 0) < min || (pc.visibility ?? 0) < min) return null
  return jointAngleDeg(pa, pb, pc)
}

/** All primary joints for one frame (flexion convention: 0° = straight). */
function measureAllJoints(lms: LandmarkSet, ankles: { l: number | null; r: number | null }): JointReadout {
  const flex = (v: number | null) => (v === null ? null : Math.round(180 - v))
  const raw  = (v: number | null) => (v === null ? null : Math.round(v))
  return {
    shoulder: {
      l: raw(angleOrNull(lms, LM.L_HIP, LM.L_SHOULDER, LM.L_ELBOW)),
      r: raw(angleOrNull(lms, LM.R_HIP, LM.R_SHOULDER, LM.R_ELBOW)),
    },
    elbow: {
      l: flex(angleOrNull(lms, LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST)),
      r: flex(angleOrNull(lms, LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST)),
    },
    hip: {
      l: flex(angleOrNull(lms, LM.L_SHOULDER, LM.L_HIP, LM.L_KNEE)),
      r: flex(angleOrNull(lms, LM.R_SHOULDER, LM.R_HIP, LM.R_KNEE)),
    },
    knee: {
      l: flex(angleOrNull(lms, LM.L_HIP, LM.L_KNEE, LM.L_ANKLE)),
      r: flex(angleOrNull(lms, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE)),
    },
    ankle: {
      l: ankles.l === null ? null : Math.round(ankles.l),
      r: ankles.r === null ? null : Math.round(ankles.r),
    },
  }
}

export function RemoteAssessmentCall({ open, role, roomId, onClose, focus = 'full' }: Props) {
  const lowerLimbOnly = focus === 'lowerLimb'
  const skeletonEdges = lowerLimbOnly ? LOWER_LIMB_EDGES : EDGES
  const skeletonJoints = lowerLimbOnly ? LOWER_LIMB_JOINTS : JOINTS
  const jointRows = lowerLimbOnly ? JOINT_ROWS.filter((r) => r.key === 'ankle') : JOINT_ROWS
  const [conn, setConn]   = useState<ConnState>('idle')
  const [copied, setCopied] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [error, setError] = useState<string | null>(null)
  const [hasRemote, setHasRemote] = useState(false)
  // Host live readout — every primary joint, both sides.
  const [liveJoints, setLiveJoints] = useState<JointReadout | null>(null)
  const lastJointPushRef = useRef(0)
  // Per-side tracking-confidence badge for the ankle row specifically (fused
  // from visibility + depth reliability + gap-fill stability — see the
  // detection loop below).
  const [ankleConfidence, setAnkleConfidence] = useState<{ l: ConfBand; r: ConfBand } | null>(null)
  const [recording, setRecording] = useState(false)
  const [summary, setSummary] = useState<GaitSummary | null>(null)
  const [staticCaps, setStaticCaps] = useState<Array<StaticCapture & { joints?: JointReadout }>>([])
  const [stepCount, setStepCount] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoExt, setVideoExt] = useState<'mp4' | 'webm'>('mp4')
  const [recSecs, setRecSecs] = useState(0)
  const [attempt, setAttempt] = useState(0)   // bump to re-run the connection
  // Runtime TURN setup (host) — paste free Metered creds without rebuilding.
  const [showTurn, setShowTurn] = useState(false)
  const [turnDomain, setTurnDomain] = useState(() => loadTurnConfig().meteredDomain ?? '')
  const [turnKey, setTurnKey] = useState(() => loadTurnConfig().meteredApiKey ?? '')
  const [turnReady, setTurnReady] = useState(() => turnConfigured())
  const [probe, setProbe] = useState<IceProbe | null>(null)
  const [probing, setProbing] = useState(false)

  const selfId = useMemo(() => randomId(8), [])
  const link = useMemo(() => buildCallLink(roomId), [roomId])

  // Refs
  const sigRef        = useRef<Signaling | null>(null)
  const pcRef         = useRef<RTCPeerConnection | null>(null)
  const localStream   = useRef<MediaStream | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)   // client self-view / host (none)
  const remoteVideoRef= useRef<HTMLVideoElement | null>(null)   // host: client's stream
  const remoteAudioRef= useRef<HTMLAudioElement | null>(null)   // client: hears host's voice
  const overlayRef    = useRef<HTMLCanvasElement | null>(null)
  const pendingIce    = useRef<RTCIceCandidateInit[]>([])
  const madeOffer     = useRef(false)
  const startedRef    = useRef(false)
  const rafRef        = useRef<number | null>(null)

  // Recording buffers (host).
  const recRef        = useRef(false)
  const recStart      = useRef(0)
  const rawSamples    = useRef<Array<{ t: number; la: number | null; ra: number | null; ls: number | null; rs: number | null }>>([])
  const stepMachine   = useRef(new GaitStepMachine())
  const prevHipX      = useRef<number | null>(null)
  const hipVelEma     = useRef(0)
  const walkDir       = useRef(1)
  const lastSamples   = useRef<GaitSample[]>([])
  const lastReading   = useRef<LastReading | null>(null)
  // One-Euro landmark smoothing (previously skipped by this call entirely —
  // every other camera flow in the app applies this via CameraView.tsx).
  const filterRef     = useRef<LandmarkFilter | null>(null)
  // Per-channel short-gap interpolation (§ ankle/shank drift + missed frames).
  const gapFillers    = useRef({ la: new GaitGapFiller(), ra: new GaitGapFiller(), ls: new GaitGapFiller(), rs: new GaitGapFiller() })
  // Live "zero on record" baseline — captured from the first ~300ms after
  // "Start recording" is pressed, reused for both the live readout and the
  // final CSV/summary (see startRecording/stopRecording below).
  const baselineCollector    = useRef(new BaselineCollector())
  const baselineOffsets      = useRef<Record<string, number> | null>(null)
  const baselineCollecting   = useRef(false)
  const baselineWindowStart  = useRef(0)
  const remoteStream  = useRef<MediaStream | null>(null)
  const mediaRec      = useRef<MediaRecorder | null>(null)
  const recChunks     = useRef<Blob[]>([])
  const recTimer      = useRef<number | null>(null)
  const myIce         = useRef<RTCIceServer[]>([])   // this peer's resolved ICE servers
  const recCanvas     = useRef<HTMLCanvasElement | null>(null)  // video+overlay composite

  useEffect(() => { recRef.current = recording }, [recording])

  // ── Set up the call when opened ─────────────────────────────────────────────
  useEffect(() => {
    if (!open || startedRef.current) return
    startedRef.current = true
    let cancelled = false

    const addIce = async (cand: RTCIceCandidateInit) => {
      const pc = pcRef.current
      if (!pc) return
      if (pc.remoteDescription && pc.remoteDescription.type) {
        try { await pc.addIceCandidate(cand) } catch (e) { console.warn('[call] addIce', e) }
      } else {
        pendingIce.current.push(cand)
      }
    }
    const flushIce = async () => {
      const pc = pcRef.current
      if (!pc) return
      const q = pendingIce.current; pendingIce.current = []
      for (const c of q) { try { await pc.addIceCandidate(c) } catch { /* */ } }
    }

    const makeOffer = async () => {
      const pc = pcRef.current
      if (!pc || madeOffer.current) return
      madeOffer.current = true
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        sigRef.current?.send('offer', offer)
        setConn('connecting')
      } catch (e) { console.error('[call] offer', e) }
    }

    const onMessage = async (m: SignalMsg) => {
      const pc = pcRef.current
      if (!pc) return
      try {
        if (m.kind === 'host-ready' && role === 'client') {
          // Adopt the host's TURN relay too, so a restrictive client network
          // can still gather relay candidates (one-sided TURN isn't always
          // enough). Merge host servers into ours before gathering.
          const hostIce = Array.isArray(m.data) ? (m.data as RTCIceServer[]) : []
          if (hostIce.length) {
            try { pc.setConfiguration({ iceServers: [...myIce.current, ...hostIce], iceCandidatePoolSize: 10 }) }
            catch (e) { console.warn('[call] setConfiguration', e) }
          }
          await makeOffer()
        } else if (m.kind === 'client-ready' && role === 'host') {
          sigRef.current?.send('host-ready', myIce.current)   // share TURN + (re)announce
        } else if (m.kind === 'offer' && role === 'host') {
          await pc.setRemoteDescription(m.data as RTCSessionDescriptionInit)
          await flushIce()
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          sigRef.current?.send('answer', answer)
          setConn('connecting')
        } else if (m.kind === 'answer' && role === 'client') {
          await pc.setRemoteDescription(m.data as RTCSessionDescriptionInit)
          await flushIce()
        } else if (m.kind === 'ice') {
          await addIce(m.data as RTCIceCandidateInit)
        } else if (m.kind === 'bye') {
          setConn('closed')
        }
      } catch (e) { console.error('[call] onMessage', e) }
    }

    async function setup() {
      setConn('waiting')
      setHasRemote(false)
      // 1) Peer connection (await TURN credential resolution first)
      const servers = await getIceServers()
      myIce.current = servers
      if (cancelled) return
      const pc = new RTCPeerConnection({ iceServers: servers, iceCandidatePoolSize: 10 })
      pcRef.current = pc
      pc.onicecandidate = (e) => { if (e.candidate) sigRef.current?.send('ice', e.candidate.toJSON()) }
      pc.ontrack = (e) => {
        const [stream] = e.streams
        if (!stream) return
        if (role === 'host' && remoteVideoRef.current) {
          // Host watches the client's video (audio of the video element plays
          // the client's mic).
          remoteStream.current = stream
          remoteVideoRef.current.srcObject = stream
          remoteVideoRef.current.play().catch(() => { /* */ })
        } else if (role === 'client' && remoteAudioRef.current) {
          // Client only needs to HEAR the host's guidance.
          remoteAudioRef.current.srcObject = stream
          remoteAudioRef.current.play().catch(() => { /* */ })
        }
        setHasRemote(true)
      }
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState
        if (st === 'connected') setConn('connected')
        else if (st === 'failed') {
          setConn('failed')
          setError(turnConfigured()
            ? 'Connection failed despite a TURN relay. Make sure the client allowed camera access, then press Retry.'
            : 'Connection failed. Across different networks WebRTC needs a TURN relay — add free TURN credentials (see notes) and press Retry. (Same-network calls work without it.)')
        }
        else if (st === 'disconnected') setConn('waiting')
      }

      // 2) Local media
      try {
        if (role === 'client') {
          const s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true },
          })
          localStream.current = s
          if (localVideoRef.current) { localVideoRef.current.srcObject = s; localVideoRef.current.play().catch(() => {}) }
          s.getTracks().forEach((t) => pc.addTrack(t, s))
        } else {
          // Host: audio only for talk-back (best effort).
          try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
            localStream.current = s
            s.getTracks().forEach((t) => pc.addTrack(t, s))
          } catch { /* host can still receive + we proceed without mic */ }
        }
      } catch (e) {
        const err = e as Error
        setError(err.name === 'NotAllowedError' ? 'Camera/mic permission denied.' : `Media error: ${err.message || err.name}`)
        return
      }
      if (cancelled) return

      // 3) Signaling
      const sig = createSignaling(roomId, selfId, onMessage)
      sigRef.current = sig
      try { await sig.ready } catch (e) { setError('Could not reach the realtime server. Check your Supabase config.'); return }
      if (cancelled) return

      // 4) Announce presence — kicks off the offer/answer handshake. The host
      //    shares its resolved ICE servers so the client can use the same TURN.
      if (role === 'host') sig.send('host-ready', myIce.current)
      else sig.send('client-ready')
    }

    void setup()

    return () => {
      cancelled = true
      try { sigRef.current?.send('bye') } catch { /* */ }
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null }
      try { mediaRec.current?.stop() } catch { /* */ }
      mediaRec.current = null
      sigRef.current?.close()
      pcRef.current?.getSenders().forEach((s) => { try { s.track?.stop() } catch {} })
      try { pcRef.current?.close() } catch { /* */ }
      localStream.current?.getTracks().forEach((t) => t.stop())
      pcRef.current = null
      sigRef.current = null
      startedRef.current = false
      madeOffer.current = false
      pendingIce.current = []
      disposeDetector()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attempt])

  // ── Host: run pose detection on the received video ──────────────────────────
  useEffect(() => {
    if (role !== 'host' || !hasRemote) return
    let cancelled = false
    let detector: Awaited<ReturnType<typeof ensureDetector>> | null = null

    // Fresh smoothing / gap-fill / baseline state for this connection.
    filterRef.current = createLandmarkFilter()
    gapFillers.current = { la: new GaitGapFiller(), ra: new GaitGapFiller(), ls: new GaitGapFiller(), rs: new GaitGapFiller() }
    baselineCollector.current.reset()
    baselineOffsets.current = null
    baselineCollecting.current = false

    ;(async () => {
      try { detector = await ensureDetector() } catch (e) { console.error('[call] detector', e); return }
      const loop = () => {
        if (cancelled) return
        const v = remoteVideoRef.current
        const c = overlayRef.current
        if (v && c && v.readyState >= 2 && v.videoWidth) {
          if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight }
          try {
            const nowMs = performance.now()
            const raw = detectVideoFrame(detector!, v, nowMs)
            // One-Euro smoothing + teleport rejection — the same filter every
            // other camera flow in the app runs (CameraView.tsx); previously
            // skipped entirely here.
            const lms = raw ? filterRef.current!.push(raw, nowMs) : null
            const ctx = c.getContext('2d')!
            ctx.clearRect(0, 0, c.width, c.height)
            drawGuideLines(ctx, c.width, c.height)

            // Gap-fill runs every frame, unconditionally, so each channel's
            // hold/velocity state stays continuous whether or not a pose was
            // detected and whether or not recording is active.
            const m = lms ? measureGaitFrame(lms) : null
            const gf = gapFillers.current
            const la = gf.la.push(m?.leftAnkle ?? null, nowMs)
            const ra = gf.ra.push(m?.rightAnkle ?? null, nowMs)
            const ls = gf.ls.push(m?.leftShank ?? null, nowMs)
            const rs = gf.rs.push(m?.rightShank ?? null, nowMs)

            if (recRef.current) {
              // Feed the baseline collector from GENUINE (non-interpolated)
              // samples only, so a held/extrapolated guess never pollutes the
              // neutral-standing median.
              if (!la.interpolated && la.value != null) baselineCollector.current.addSample(KEY_ANKLE_L, la.value)
              if (!ra.interpolated && ra.value != null) baselineCollector.current.addSample(KEY_ANKLE_R, ra.value)
              if (!ls.interpolated && ls.value != null) baselineCollector.current.addSample(KEY_SHANK_L, ls.value)
              if (!rs.interpolated && rs.value != null) baselineCollector.current.addSample(KEY_SHANK_R, rs.value)
              if (baselineCollecting.current) {
                // Recompute the running median every frame — the very first
                // frame's own reading becomes its own baseline (so the
                // display reads ~0 immediately), refining over a short window.
                baselineOffsets.current = baselineCollector.current.finalize().offsets
                const elapsed = nowMs - baselineWindowStart.current
                const settled = elapsed >= BASELINE_WINDOW_MS && baselineCollector.current.ready(BASELINE_MIN_SAMPLES)
                if (settled || elapsed >= BASELINE_HARD_CAP_MS) baselineCollecting.current = false
              }
            }

            const off = recRef.current ? baselineOffsets.current : null
            const reading: LastReading = {
              m,
              la: { ...la, display: zeroSigned(la.value, off, KEY_ANKLE_L) },
              ra: { ...ra, display: zeroSigned(ra.value, off, KEY_ANKLE_R) },
              ls: { ...ls, display: zeroSigned(ls.value, off, KEY_SHANK_L) },
              rs: { ...rs, display: zeroSigned(rs.value, off, KEY_SHANK_R) },
            }
            lastReading.current = reading

            if (lms && m) {
              drawSkeleton(ctx, lms, c.width, c.height, skeletonEdges, skeletonJoints)
              drawAnkleLabels(ctx, lms, c.width, c.height, reading)
              // Full-body readout, throttled to ~8 Hz so ten live numbers
              // don't re-render the dashboard on every camera frame.
              if (nowMs - lastJointPushRef.current > 120) {
                lastJointPushRef.current = nowMs
                setLiveJoints(measureAllJoints(lms, { l: reading.la.display, r: reading.ra.display }))
                const laDr = Math.min(ANKLE_DEPTH_TRUST_CAP, depthReliability(lms, LM.L_KNEE, LM.L_ANKLE, LM.L_FOOT_IDX))
                const raDr = Math.min(ANKLE_DEPTH_TRUST_CAP, depthReliability(lms, LM.R_KNEE, LM.R_ANKLE, LM.R_FOOT_IDX))
                setAnkleConfidence({
                  l: confidenceBand(measurementConfidence({ visibility: m.leftVis, depthReliability: laDr, stability: la.interpolated ? 0.3 : 0.85 })),
                  r: confidenceBand(measurementConfidence({ visibility: m.rightVis, depthReliability: raDr, stability: ra.interpolated ? 0.3 : 0.85 })),
                })
              }
              if (recRef.current) recordFrame(reading, nowMs)
            }
            // Composite (raw video + guide lines + skeleton) onto an offscreen
            // canvas — this is what we screenshot and record, so the saved
            // image/video has the pose overlay BURNED IN.
            const rc = recCanvas.current ?? (recCanvas.current = document.createElement('canvas'))
            if (rc.width !== c.width || rc.height !== c.height) { rc.width = c.width; rc.height = c.height }
            const rctx = rc.getContext('2d')!
            rctx.drawImage(v, 0, 0, rc.width, rc.height)
            drawGuideLines(rctx, rc.width, rc.height)
            if (lms) { drawSkeleton(rctx, lms, rc.width, rc.height, skeletonEdges, skeletonJoints); drawAnkleLabels(rctx, lms, rc.width, rc.height, reading) }
          } catch (e) { /* per-frame */ }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      loop()
    })()

    return () => { cancelled = true; if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, hasRemote, focus])

  // ── Recording (host) ────────────────────────────────────────────────────────
  function recordFrame(reading: LastReading, nowMs: number) {
    const m = reading.m
    if (!m) return
    const t = (nowMs - recStart.current) / 1000
    // Gap-filled (not yet zeroed) values — the neutral baseline is applied
    // once, retroactively, to the whole buffer in stopRecording() below.
    rawSamples.current.push({ t, la: reading.la.value, ra: reading.ra.value, ls: reading.ls.value, rs: reading.rs.value })
    // Walking direction from hip horizontal velocity (un-mirrored remote view).
    const hx = m.hipX
    if (prevHipX.current != null) hipVelEma.current = 0.3 * (hx - prevHipX.current) + 0.7 * hipVelEma.current
    prevHipX.current = hx
    if (Math.abs(hipVelEma.current) > 0.0015) walkDir.current = hipVelEma.current > 0 ? 1 : -1
    const struck = stepMachine.current.push(m.leftAnkleX, m.rightAnkleX, m.hipX, walkDir.current, t, m.legLen, m.stepLenM)
    if (struck) setStepCount(stepMachine.current.count())
  }

  /** Static posture capture — snapshot the FULL joint readout AND a screenshot
   *  of the person with the pose overlay burned in. Reads the same `display`
   *  values as the live panel and the burned-in overlay, so a capture taken
   *  mid-recording can never show a different number than what's on screen. */
  function capturePosture() {
    const r = lastReading.current
    if (!r) return
    let image: string | undefined
    try { image = recCanvas.current?.toDataURL('image/png') } catch { /* */ }
    setStaticCaps((prev) => [
      { ts: Date.now(), leftAnkle: r.la.display, rightAnkle: r.ra.display, leftShank: r.ls.display, rightShank: r.rs.display, image, joints: liveJoints ?? undefined },
      ...prev,
    ].slice(0, 12))
  }

  function pickMime(): string {
    // Prefer MP4 (H.264/AAC) so the downloaded clip is a universally-playable
    // .mp4. Recent Chrome/Edge/Safari support MP4 in MediaRecorder; browsers that
    // don't fall back to WebM (and the download is named accordingly).
    const opts = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ]
    for (const o of opts) { if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(o)) return o }
    return ''
  }

  function startRecording() {
    rawSamples.current = []
    stepMachine.current = new GaitStepMachine()
    prevHipX.current = null; hipVelEma.current = 0; walkDir.current = 1
    recStart.current = performance.now()
    // Zero the live ankle/shank readout to THIS instant's pose — every value
    // shown/recorded from here on is a delta from true neutral (the detection
    // loop above feeds this collector and refreshes baselineOffsets live).
    baselineCollector.current.reset()
    baselineOffsets.current = null
    baselineCollecting.current = true
    baselineWindowStart.current = performance.now()
    setSummary(null); setStepCount(0); setRecSecs(0)
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null) }
    // Record the COMPOSITE canvas (video + pose overlay burned in) plus the
    // client's audio, so the saved clip shows the skeleton on top of the video.
    const rc = recCanvas.current
    let stream: MediaStream | null = null
    if (rc && typeof rc.captureStream === 'function') {
      stream = rc.captureStream(30)
      const audio = remoteStream.current?.getAudioTracks?.() ?? []
      audio.forEach((t) => stream!.addTrack(t))
    } else {
      stream = remoteStream.current   // fallback: raw video without overlay
    }
    if (stream && typeof MediaRecorder !== 'undefined') {
      try {
        recChunks.current = []
        const mime = pickMime()
        const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
        mr.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.current.push(e.data) }
        mr.onstop = () => {
          const type = recChunks.current[0]?.type || mime || 'video/webm'
          const blob = new Blob(recChunks.current, { type })
          setVideoExt(type.includes('mp4') ? 'mp4' : 'webm')
          setVideoUrl(URL.createObjectURL(blob))
        }
        mr.start(250)
        mediaRec.current = mr
      } catch (e) { console.warn('[call] MediaRecorder', e) }
    }
    recTimer.current = window.setInterval(() => setRecSecs((s) => s + 1), 1000)
    setRecording(true)
  }

  function stopRecording() {
    setRecording(false)
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null }
    try { mediaRec.current?.stop() } catch { /* */ }
    mediaRec.current = null
    baselineCollecting.current = false
    const raw = rawSamples.current
    if (raw.length < 5) { setSummary(null); baselineOffsets.current = null; return }
    // Same neutral baseline captured live at "Start recording" (see the
    // detection loop above) — applied once, retroactively, to every stored
    // sample (including the handful collected before it finished converging)
    // so the exported CSV/summary exactly matches what was shown live, with
    // no discontinuity partway through.
    const off = baselineOffsets.current
    const samples: GaitSample[] = raw.map((s) => ({
      t: s.t, leg: 'out',
      leftAnkle:  zeroSigned(s.la, off, KEY_ANKLE_L),
      rightAnkle: zeroSigned(s.ra, off, KEY_ANKLE_R),
      leftShank:  zeroSigned(s.ls, off, KEY_SHANK_L),
      rightShank: zeroSigned(s.rs, off, KEY_SHANK_R),
      speed: null,
    }))
    const stepLen = stepMachine.current.medianStepLength()
    fillInstantaneousSpeed(samples, stepLen)
    const sum = summariseGait(samples, stepMachine.current.count(), stepLen)
    lastSamples.current = samples
    setSummary(sum)
    baselineOffsets.current = null
    try { saveGaitSession(sum, samples) } catch { /* */ }
  }

  // ── Report exports ──────────────────────────────────────────────────────────
  function exportPdf() {
    buildAssessmentPdf({
      date: new Date(),
      statics: staticCaps,
      summary,
      samples: lastSamples.current,
    })
  }
  function exportPng() {
    if (!summary || lastSamples.current.length < 2) return
    downloadDataUrl(`ankle-chart-${Date.now()}.png`, chartDataUrl(lastSamples.current, summary))
  }
  function saveTurn() {
    saveTurnConfig({ meteredDomain: turnDomain, meteredApiKey: turnKey })
    setTurnReady(turnConfigured())
    setError(null)
    setAttempt((a) => a + 1)   // reconnect using the new relay
  }
  async function runProbe() {
    setProbing(true); setProbe(null)
    saveTurnConfig({ meteredDomain: turnDomain, meteredApiKey: turnKey })  // test what's typed
    setTurnReady(turnConfigured())
    try { setProbe(await probeIce()) } finally { setProbing(false) }
  }

  const toggleMic = useCallback(() => {
    const s = localStream.current
    if (!s) return
    const on = !micOn
    s.getAudioTracks().forEach((t) => { t.enabled = on })
    setMicOn(on)
  }, [micOn])

  const flipCamera = useCallback(async () => {
    if (role !== 'client') return
    const next = facing === 'user' ? 'environment' : 'user'
    setFacing(next)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: next } }, audio: false })
      const newTrack = s.getVideoTracks()[0]
      const sender = pcRef.current?.getSenders().find((x) => x.track?.kind === 'video')
      if (sender && newTrack) await sender.replaceTrack(newTrack)
      // swap into self-view + stop old video track
      const old = localStream.current
      old?.getVideoTracks().forEach((t) => t.stop())
      if (old) { old.removeTrack(old.getVideoTracks()[0]); old.addTrack(newTrack) }
      if (localVideoRef.current) localVideoRef.current.srcObject = localStream.current
    } catch (e) { console.warn('[call] flip', e) }
  }, [facing, role])

  if (!open) return null

  const statusPill = (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
      conn === 'connected' ? 'bg-emerald-500/20 text-emerald-300'
      : conn === 'failed' ? 'bg-red-500/20 text-red-300'
      : 'bg-amber-500/20 text-amber-200'
    }`}>
      {conn === 'connected' ? <Wifi size={11} /> : <WifiOff size={11} />}
      {conn === 'connected' ? 'Connected' : conn === 'failed' ? 'Failed' : conn === 'connecting' ? 'Connecting…' : 'Waiting…'}
    </span>
  )

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-black text-white">
      <header className="flex items-center justify-between border-b border-slate-800 bg-black/80 px-4 py-2">
        <div className="flex items-center gap-2">
          <Video size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold tracking-wide">
            Remote Assessment {lowerLimbOnly ? '· Lower limb' : ''} {role === 'host' ? '· Practitioner' : '· You'}
          </span>
          {statusPill}
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-800"><X size={16} /></button>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {/* ── HOST view: video (left) + evaluator dashboard (right) ──────────── */}
        {role === 'host' && (
          <>
            <div className="relative h-full flex-1 min-w-0">
              <video ref={remoteVideoRef} className="h-full w-full object-contain bg-black" playsInline />
              <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />

              {!hasRemote && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                  <div className="text-lg font-semibold text-cyan-200">Waiting for your client to join…</div>
                  <div className="text-xs text-slate-400 max-w-md">
                    Send them this link. They open it in any browser, allow their camera, and put the
                    phone on the floor in profile. You'll see their pose here and can guide them by voice.
                  </div>
                  <div className="flex w-full max-w-lg items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2">
                    <input readOnly value={link} className="min-w-0 flex-1 bg-transparent px-2 text-xs text-slate-200 outline-none" />
                    <button
                      onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                      className="flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-400"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                </div>
              )}

              {recording && (
                <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC {recSecs}s
                </div>
              )}
            </div>

            {/* Evaluator dashboard */}
            <aside className="flex w-80 flex-shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-800 bg-slate-950 p-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Evaluator dashboard</div>
                {lowerLimbOnly && (
                  <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300">
                    Lower-limb focus
                  </span>
                )}
              </div>

              {/* Live joint readout — every joint in 'full' focus, ankle only
                  in 'lowerLimb' focus (see the Props.focus doc comment). */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {lowerLimbOnly ? 'Live ankle tracking' : 'Live joints'}
                  </span>
                  <span className="flex items-center gap-1 text-[9px] text-slate-500">
                    <span className={`h-1.5 w-1.5 rounded-full ${liveJoints ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`} />
                    {liveJoints ? 'tracking' : 'no pose'}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="grid grid-cols-[1fr_3rem_3rem] gap-1 text-[9px] uppercase tracking-wider text-slate-500">
                    <span /> <span className="text-right text-orange-300/80">Left</span> <span className="text-right text-cyan-300/80">Right</span>
                  </div>
                  {jointRows.map(({ key, label }) => {
                    const j = liveJoints?.[key]
                    const conf = key === 'ankle' ? ankleConfidence : null
                    return (
                      <div key={key} className="grid grid-cols-[1fr_3rem_3rem] items-center gap-1 rounded bg-slate-950/50 px-1.5 py-1 text-[11px]">
                        <span className="truncate text-slate-300">{label}</span>
                        <span className="flex items-center justify-end gap-1 text-right font-semibold tabular-nums text-orange-300">
                          {conf && <ConfidenceDot band={conf.l} />}{j?.l == null ? '—' : `${j.l}°`}
                        </span>
                        <span className="flex items-center justify-end gap-1 text-right font-semibold tabular-nums text-cyan-300">
                          {conf && <ConfidenceDot band={conf.r} />}{j?.r == null ? '—' : `${j.r}°`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Steps" value={String(stepCount)} tone="slate" />
                <Metric
                  label={lowerLimbOnly ? 'Ankles tracked' : 'Joints tracked'}
                  value={liveJoints ? String(jointRows.reduce((n, { key }) => {
                    const j = liveJoints[key]
                    return n + (j?.l != null ? 1 : 0) + (j?.r != null ? 1 : 0)
                  }, 0)) : '—'}
                  tone="cyan"
                />
              </div>
              <div className="text-[10px] text-slate-500">
                {lowerLimbOnly
                  ? 'Ankle angle is depth-corrected shank↔foot and zeroes to neutral the instant you press "Start recording walk" — the dot shows live tracking confidence.'
                  : 'Angles are flexion from straight (shoulder = elevation). Ankle is depth-corrected shank↔foot and zeroes to neutral the instant you press "Start recording walk" — the dot shows live tracking confidence.'}
              </div>

              {/* Tools */}
              <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tools</div>
                <button
                  onClick={capturePosture}
                  disabled={!hasRemote}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-40"
                >
                  <Camera size={13} /> Capture static posture
                </button>
                {!recording ? (
                  <button
                    onClick={startRecording}
                    disabled={!hasRemote}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-400 disabled:opacity-40"
                  >
                    <Circle size={13} /> Start recording walk
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500"
                  >
                    <Square size={13} /> Stop &amp; analyse
                  </button>
                )}
                <button
                  onClick={toggleMic}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold ${micOn ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-red-600 text-white'}`}
                >
                  {micOn ? <Mic size={13} /> : <MicOff size={13} />} {micOn ? 'Mic on' : 'Muted'}
                </button>
              </div>

              {/* Static captures */}
              {staticCaps.length > 0 && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Static captures</div>
                  <div className="mt-1 space-y-1">
                    {staticCaps.map((s) => (
                      <div key={s.ts} className="flex items-center gap-2 text-[11px]">
                        {s.image && (
                          <a href={s.image} download={`posture-${s.ts}.png`} title="Download screenshot">
                            <img src={s.image} alt="capture" className="h-10 w-16 rounded object-cover ring-1 ring-slate-700 hover:ring-cyan-400" />
                          </a>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-slate-500">{new Date(s.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                          <div className="tabular-nums">
                            <span className="text-orange-300">L {s.leftAnkle == null ? '—' : `${Math.round(s.leftAnkle)}°`}</span>{'  '}
                            <span className="text-cyan-300">R {s.rightAnkle == null ? '—' : `${Math.round(s.rightAnkle)}°`}</span>
                          </div>
                          {s.joints && (
                            <div className="mt-0.5 truncate text-[9px] text-slate-500">
                              {JOINT_ROWS.filter(({ key }) => key !== 'ankle').map(({ key, label }) => {
                                const j = s.joints![key]
                                if (!j || (j.l == null && j.r == null)) return null
                                return `${label.replace(/\.$/, '')} ${j.l ?? '—'}/${j.r ?? '—'}°`
                              }).filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dynamic result */}
              {summary && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                    <Footprints size={12} /> Walk result
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-1.5">
                    <Stat label="Ankle excursion" l={summary.left.excursion} r={summary.right.excursion} />
                    <Stat label="Peak dorsiflex" l={summary.left.max} r={summary.right.max} />
                    <Stat label="Peak plantarflex" l={summary.left.min} r={summary.right.min} />
                  </div>
                  <div className="mt-1.5 text-[11px] text-slate-400">
                    {summary.steps} steps · {summary.cadenceSpm}/min{summary.speedMps != null ? ` · ${summary.speedMps} m/s` : ''}
                    {summary.symmetryPct != null ? ` · ${summary.symmetryPct}% sym` : ''}
                  </div>
                </div>
              )}

              {videoUrl && (
                <a
                  href={videoUrl}
                  download={`remote-walk-${Date.now()}.${videoExt}`}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                >
                  <Download size={13} /> Download recorded video
                </a>
              )}

              {/* Cross-network relay (TURN) — runtime setup, no rebuild needed */}
              <div className={`rounded-lg border p-2.5 ${turnReady ? 'border-slate-800 bg-slate-900/60' : 'border-amber-500/40 bg-amber-500/5'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Cross-network relay (TURN)</span>
                  <span className={`text-[10px] font-semibold ${turnReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {turnReady ? 'Ready' : 'Not set'}
                  </span>
                </div>
                {!showTurn ? (
                  <button onClick={() => setShowTurn(true)} className="mt-1.5 w-full rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700">
                    {turnReady ? 'Edit TURN credentials' : 'Set up free TURN (different networks)'}
                  </button>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[10px] leading-relaxed text-slate-400">
                      Free at dashboard.metered.ca — copy your app subdomain + API key. Only you (host) need this; saved in this browser.
                    </p>
                    <input value={turnDomain} onChange={(e) => setTurnDomain(e.target.value)} placeholder="yourapp.metered.live"
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-500" />
                    <input value={turnKey} onChange={(e) => setTurnKey(e.target.value)} placeholder="API key"
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-500" />
                    <div className="flex gap-2">
                      <button onClick={saveTurn} className="flex-1 rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-400">Save &amp; reconnect</button>
                      <button onClick={runProbe} disabled={probing} className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-600 disabled:opacity-50">
                        {probing ? 'Testing…' : 'Test relay'}
                      </button>
                      <button onClick={() => setShowTurn(false)} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">Close</button>
                    </div>
                    {probe && (
                      <div className={`rounded border p-2 text-[10px] leading-relaxed ${probe.relay ? 'border-emerald-600/50 bg-emerald-950/40 text-emerald-200' : 'border-red-600/50 bg-red-950/40 text-red-200'}`}>
                        {probe.relay ? (
                          <span><b>✓ TURN relay works.</b> Cross-network calls should connect now — press “Save &amp; reconnect”.</span>
                        ) : probe.fetchTried && !probe.fetchOk ? (
                          <span><b>✗ Credential fetch failed</b> (HTTP {probe.fetchStatus ?? '—'}). Check the subdomain is the full <code>yourapp.metered.live</code> and the API key is the TURN key.</span>
                        ) : probe.fetchTried && probe.turnServerCount === 0 ? (
                          <span><b>✗ No TURN servers returned.</b> The key/subdomain look wrong — re-copy them from the Metered dashboard.</span>
                        ) : (
                          <span><b>✗ No relay candidate.</b> Credentials loaded ({probe.turnServerCount} TURN servers) but the relay was unreachable — a firewall may be blocking it, or the key is invalid. Candidates seen: {probe.candidateTypes.join(', ') || 'none'}.</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Report exports */}
              <div className="mt-auto space-y-2 border-t border-slate-800 pt-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Report</div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={exportPdf} className="flex items-center justify-center gap-1 rounded-md bg-violet-500 px-2 py-2 text-[11px] font-semibold text-white hover:bg-violet-400">
                    <FileText size={12} /> PDF
                  </button>
                  <button onClick={exportPng} disabled={!summary} className="flex items-center justify-center gap-1 rounded-md bg-slate-800 px-2 py-2 text-[11px] font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-40">
                    <ImageIcon size={12} /> PNG
                  </button>
                  <button
                    onClick={() => { if (summary && lastSamples.current.length) downloadText(`remote-ankle-${Date.now()}.csv`, buildGaitCsv(lastSamples.current, summary)) }}
                    disabled={!summary}
                    className="flex items-center justify-center gap-1 rounded-md bg-slate-800 px-2 py-2 text-[11px] font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-40"
                  >
                    <Download size={12} /> CSV
                  </button>
                </div>
              </div>
            </aside>
          </>
        )}

        {/* ── CLIENT view ───────────────────────────────────────────────────── */}
        {role === 'client' && (
          <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 p-6">
            {/* Plays the host's voice guidance. */}
            <audio ref={remoteAudioRef} autoPlay />
            <video ref={localVideoRef} className="max-h-[70%] w-auto rounded-lg bg-black object-contain" style={{ transform: 'scaleX(-1)' }} playsInline muted />
            <div className="text-center">
              <div className="text-sm font-semibold text-cyan-200">
                {conn === 'connected' ? 'Connected — follow your coach' : 'Connecting to your coach…'}
              </div>
              <div className="mt-1 text-xs text-slate-400 max-w-sm">
                Place your phone on the floor against a wall so it sees you from the side, then stand back.
                Your coach will guide you by voice.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleMic} className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold ${micOn ? 'bg-slate-800 text-slate-100' : 'bg-red-600 text-white'}`}>
                {micOn ? <Mic size={14} /> : <MicOff size={14} />} {micOn ? 'Mic on' : 'Muted'}
              </button>
              <button onClick={flipCamera} className="flex items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-100">
                <SwitchCamera size={14} /> Flip camera
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 rounded border border-red-700 bg-red-950/80 p-2 text-xs text-red-200">
            <span className="flex-1">{error}</span>
            {conn === 'failed' && (
              <button
                onClick={() => { setError(null); setAttempt((a) => a + 1) }}
                className="flex-shrink-0 rounded bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-500"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Small strong/fair/weak dot — live tracking-confidence badge (ankle row). */
function ConfidenceDot({ band }: { band: ConfBand }) {
  const color = band === 'strong' ? 'bg-emerald-400' : band === 'fair' ? 'bg-amber-400' : 'bg-red-400'
  return <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${color}`} title={`${band} tracking confidence`} />
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'orange' | 'cyan' | 'slate' }) {
  const color = tone === 'orange' ? 'text-orange-200' : tone === 'cyan' ? 'text-cyan-200' : 'text-slate-100'
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2 text-center">
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}

function Stat({ label, l, r }: { label: string; l: number | null; r: number | null }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 flex gap-2">
        <span className="text-orange-300">L <b className="tabular-nums">{l == null ? '—' : `${l}°`}</b></span>
        <span className="text-cyan-300">R <b className="tabular-nums">{r == null ? '—' : `${r}°`}</b></span>
      </div>
    </div>
  )
}
