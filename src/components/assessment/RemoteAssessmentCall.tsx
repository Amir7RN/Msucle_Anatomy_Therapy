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
  Download, Wifi, WifiOff, Footprints,
} from 'lucide-react'
import { ensureDetector, detectVideoFrame, disposeDetector } from '../../lib/movement/poseDetector'
import { LM } from '../../lib/movement/landmarks'
import type { LandmarkSet } from '../../lib/movement/landmarks'
import {
  measureGaitFrame, summariseGait, fillInstantaneousSpeed, buildGaitCsv,
  GaitStepMachine, downloadText, type GaitSample, type GaitSummary,
} from '../../lib/movement/gait'
import { saveGaitSession } from '../../lib/movement/gaitHistory'
import { createSignaling, iceServers, randomId, type Signaling, type SignalMsg } from '../../lib/call/signaling'

type Role = 'host' | 'client'
type ConnState = 'idle' | 'waiting' | 'connecting' | 'connected' | 'failed' | 'closed'

interface Props {
  open:    boolean
  role:    Role
  roomId:  string
  onClose: () => void
}

/** Build the link a host shares with a client to join this room. */
export function buildCallLink(roomId: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, '/')
  return `${base}?atlas=1&call=${roomId}`
}

// Skeleton edges drawn over the remote video (host side).
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

function drawSkeleton(ctx: CanvasRenderingContext2D, lms: LandmarkSet, w: number, h: number) {
  ctx.lineCap = 'round'
  for (const [a, b, color] of EDGES) {
    const pa = lms[a], pb = lms[b]
    if (!pa || !pb) continue
    if ((pa.visibility ?? 0) < 0.3 || (pb.visibility ?? 0) < 0.3) continue
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(4, w * 0.008)
    ctx.beginPath(); ctx.moveTo(pa.x * w, pa.y * h); ctx.lineTo(pb.x * w, pb.y * h); ctx.stroke()
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, w * 0.005)
    ctx.beginPath(); ctx.moveTo(pa.x * w, pa.y * h); ctx.lineTo(pb.x * w, pb.y * h); ctx.stroke()
  }
  for (const j of JOINTS) {
    const p = lms[j]
    if (!p || (p.visibility ?? 0) < 0.3) continue
    ctx.fillStyle = '#e2e8f0'
    ctx.beginPath(); ctx.arc(p.x * w, p.y * h, Math.max(3, w * 0.006), 0, Math.PI * 2); ctx.fill()
  }
}

const median = (a: number[]) => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}

export function RemoteAssessmentCall({ open, role, roomId, onClose }: Props) {
  const [conn, setConn]   = useState<ConnState>('idle')
  const [copied, setCopied] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [error, setError] = useState<string | null>(null)
  const [hasRemote, setHasRemote] = useState(false)
  // Host live readout.
  const [liveL, setLiveL] = useState<number | null>(null)
  const [liveR, setLiveR] = useState<number | null>(null)
  const [recording, setRecording] = useState(false)
  const [summary, setSummary] = useState<GaitSummary | null>(null)

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
          await makeOffer()
        } else if (m.kind === 'client-ready' && role === 'host') {
          sigRef.current?.send('host-ready')   // (re)announce so a late client offers
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
      // 1) Peer connection
      const pc = new RTCPeerConnection({ iceServers: iceServers() })
      pcRef.current = pc
      pc.onicecandidate = (e) => { if (e.candidate) sigRef.current?.send('ice', e.candidate.toJSON()) }
      pc.ontrack = (e) => {
        const [stream] = e.streams
        if (!stream) return
        if (role === 'host' && remoteVideoRef.current) {
          // Host watches the client's video (audio of the video element plays
          // the client's mic).
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
        else if (st === 'failed') { setConn('failed'); setError('Connection failed. If you are on different networks a TURN server may be required.') }
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

      // 4) Announce presence — kicks off the offer/answer handshake.
      sig.send(role === 'host' ? 'host-ready' : 'client-ready')
    }

    void setup()

    return () => {
      cancelled = true
      try { sigRef.current?.send('bye') } catch { /* */ }
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
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
  }, [open])

  // ── Host: run pose detection on the received video ──────────────────────────
  useEffect(() => {
    if (role !== 'host' || !hasRemote) return
    let cancelled = false
    let detector: Awaited<ReturnType<typeof ensureDetector>> | null = null

    ;(async () => {
      try { detector = await ensureDetector() } catch (e) { console.error('[call] detector', e); return }
      const loop = () => {
        if (cancelled) return
        const v = remoteVideoRef.current
        const c = overlayRef.current
        if (v && c && v.readyState >= 2 && v.videoWidth) {
          if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight }
          try {
            const lms = detectVideoFrame(detector!, v, performance.now())
            const ctx = c.getContext('2d')!
            ctx.clearRect(0, 0, c.width, c.height)
            if (lms) {
              drawSkeleton(ctx, lms, c.width, c.height)
              const m = measureGaitFrame(lms)
              setLiveL(m.leftAnkle != null ? Math.round(m.leftAnkle) : null)
              setLiveR(m.rightAnkle != null ? Math.round(m.rightAnkle) : null)
              if (recRef.current) recordFrame(lms, m)
            }
          } catch (e) { /* per-frame */ }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      loop()
    })()

    return () => { cancelled = true; if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, hasRemote])

  // ── Recording (host) ────────────────────────────────────────────────────────
  function recordFrame(lms: LandmarkSet, m: ReturnType<typeof measureGaitFrame>) {
    const t = (performance.now() - recStart.current) / 1000
    rawSamples.current.push({ t, la: m.leftAnkle, ra: m.rightAnkle, ls: m.leftShank, rs: m.rightShank })
    // Walking direction from hip horizontal velocity (un-mirrored remote view).
    const hx = m.hipX
    if (prevHipX.current != null) hipVelEma.current = 0.3 * (hx - prevHipX.current) + 0.7 * hipVelEma.current
    prevHipX.current = hx
    if (Math.abs(hipVelEma.current) > 0.0015) walkDir.current = hipVelEma.current > 0 ? 1 : -1
    stepMachine.current.push(m.leftAnkleX, m.rightAnkleX, m.hipX, walkDir.current, t, m.legLen, m.stepLenM)
  }

  function startRecording() {
    rawSamples.current = []
    stepMachine.current = new GaitStepMachine()
    prevHipX.current = null; hipVelEma.current = 0; walkDir.current = 1
    recStart.current = performance.now()
    setSummary(null)
    setRecording(true)
  }

  function stopRecording() {
    setRecording(false)
    const raw = rawSamples.current
    if (raw.length < 5) { setSummary(null); return }
    // Neutral baseline = median of the first ~1.2 s per foot, so angles are
    // reported relative to standing neutral (+ dorsi / − plantar).
    const early = raw.filter((s) => s.t <= 1.2)
    const baseLA = median(early.map((s) => s.la).filter((v): v is number => v != null))
    const baseRA = median(early.map((s) => s.ra).filter((v): v is number => v != null))
    const baseLS = median(early.map((s) => s.ls).filter((v): v is number => v != null))
    const baseRS = median(early.map((s) => s.rs).filter((v): v is number => v != null))
    const samples: GaitSample[] = raw.map((s) => ({
      t: s.t, leg: 'out',
      leftAnkle:  s.la != null ? s.la - baseLA : null,
      rightAnkle: s.ra != null ? s.ra - baseRA : null,
      leftShank:  s.ls != null ? s.ls - baseLS : null,
      rightShank: s.rs != null ? s.rs - baseRS : null,
      speed: null,
    }))
    const stepLen = stepMachine.current.medianStepLength()
    fillInstantaneousSpeed(samples, stepLen)
    const sum = summariseGait(samples, stepMachine.current.count(), stepLen)
    lastSamples.current = samples
    setSummary(sum)
    try { saveGaitSession(sum, samples) } catch { /* */ }
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
            Remote Assessment {role === 'host' ? '· Practitioner' : '· You'}
          </span>
          {statusPill}
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-800"><X size={16} /></button>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {/* ── HOST view ─────────────────────────────────────────────────────── */}
        {role === 'host' && (
          <div className="relative h-full w-full">
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

            {/* Live readout + controls */}
            {hasRemote && (
              <>
                <div className="absolute left-3 top-3 rounded-lg bg-black/70 px-4 py-3 backdrop-blur">
                  <div className="text-[10px] uppercase tracking-wider text-cyan-400">Live ankle angle</div>
                  <div className="mt-1 flex gap-5">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-orange-300">Left</span>
                      <span className="text-2xl font-bold tabular-nums text-orange-200">{liveL == null ? '—' : `${liveL}°`}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-cyan-300">Right</span>
                      <span className="text-2xl font-bold tabular-nums text-cyan-200">{liveR == null ? '—' : `${liveR}°`}</span>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">raw shank↔foot angle (image plane)</div>
                </div>

                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2">
                  <button
                    onClick={toggleMic}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold ${micOn ? 'bg-slate-800 text-slate-100' : 'bg-red-600 text-white'}`}
                  >
                    {micOn ? <Mic size={14} /> : <MicOff size={14} />} {micOn ? 'Mic on' : 'Muted'}
                  </button>
                  {!recording ? (
                    <button onClick={startRecording} className="flex items-center gap-1.5 rounded-full bg-cyan-500 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-400">
                      <Circle size={14} /> Record walk
                    </button>
                  ) : (
                    <button onClick={stopRecording} className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500">
                      <Square size={14} /> Stop & analyse
                    </button>
                  )}
                </div>

                {recording && (
                  <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC
                  </div>
                )}
              </>
            )}

            {summary && !recording && (
              <div className="absolute bottom-20 left-1/2 w-[min(560px,92vw)] -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Footprints size={15} className="text-cyan-400" /> Walk captured
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <Stat label="Excursion" l={summary.left.excursion} r={summary.right.excursion} />
                  <Stat label="Peak dorsiflex" l={summary.left.max} r={summary.right.max} />
                  <Stat label="Peak plantarflex" l={summary.left.min} r={summary.right.min} />
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  {summary.steps} steps · {summary.cadenceSpm}/min{summary.speedMps != null ? ` · ${summary.speedMps} m/s (est.)` : ''}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      if (lastSamples.current.length) downloadText(`remote-ankle-${Date.now()}.csv`, buildGaitCsv(lastSamples.current, summary))
                    }}
                    className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-700"
                  >
                    <Download size={12} /> CSV
                  </button>
                  <button onClick={() => setSummary(null)} className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-400">Done</button>
                </div>
              </div>
            )}
          </div>
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
          <div className="absolute bottom-4 left-4 right-4 rounded border border-red-700 bg-red-950/80 p-2 text-xs text-red-200">
            {error}
          </div>
        )}
      </div>
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
