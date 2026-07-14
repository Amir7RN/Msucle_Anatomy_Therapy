/**
 * Minimal React usage example — not part of the package build, just a
 * reference for wiring LowerLimbTracker into a React component. Copy the
 * pattern into your own app; adjust styling/layout freely.
 */
import { useEffect, useRef, useState } from 'react'
import { LowerLimbTracker, type LowerLimbFrame } from '@zeva/lower-limb-tracker'

export function LowerLimbTrackerExample() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trackerRef = useRef<LowerLimbTracker | null>(null)
  const [frame, setFrame] = useState<LowerLimbFrame | null>(null)
  const [recording, setRecording] = useState(false)
  const [clipUrl, setClipUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null

    ;(async () => {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
      if (cancelled || !videoRef.current) return
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      const tracker = new LowerLimbTracker(videoRef.current, {
        overlayCanvas: canvasRef.current ?? undefined,
      })
      trackerRef.current = tracker
      tracker.onFrame(setFrame)
      await tracker.start()
    })()

    return () => {
      cancelled = true
      trackerRef.current?.destroy()
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function toggleRecording() {
    const tracker = trackerRef.current
    if (!tracker) return
    if (!recording) {
      if (clipUrl) { URL.revokeObjectURL(clipUrl); setClipUrl(null) }
      tracker.startRecording()   // zeroes to this instant by default
      setRecording(true)
    } else {
      const blob = await tracker.stopRecording()
      setClipUrl(URL.createObjectURL(blob))
      setRecording(false)
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ position: 'relative', aspectRatio: '4/3', background: '#000' }}>
        <video ref={videoRef} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <span style={{ color: '#fb923c' }}>L {frame?.leftAnkleDeg == null ? '—' : `${Math.round(frame.leftAnkleDeg)}°`}</span>
        <span style={{ color: '#22d3ee' }}>R {frame?.rightAnkleDeg == null ? '—' : `${Math.round(frame.rightAnkleDeg)}°`}</span>
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button onClick={() => trackerRef.current?.zero()}>Zero</button>
        <button onClick={toggleRecording}>{recording ? 'Stop & save' : 'Start recording'}</button>
      </div>

      {clipUrl && <a href={clipUrl} download="walk-recording.mp4">Download recorded clip</a>}
    </div>
  )
}
