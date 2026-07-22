/**
 * ReplayableVideo.tsx
 *
 * A muted video that autoplays once, pauses on its final frame, and then shows
 * a "Replay" button so the viewer can watch it again on demand (instead of the
 * old loop-forever behaviour). Meant to sit inside a `relative` container that
 * clips it — the replay overlay fills that container.
 */

import { useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'

export function ReplayableVideo({ src, className = '' }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [ended, setEnded] = useState(false)

  const replay = () => {
    const v = ref.current
    if (!v) return
    v.currentTime = 0
    setEnded(false)
    void v.play()
  }

  return (
    <>
      <video
        ref={ref}
        src={src}
        className={className}
        autoPlay
        muted
        playsInline
        onEnded={() => setEnded(true)}
      />
      {ended && (
        <button
          onClick={replay}
          className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/45 backdrop-blur-[1px] transition hover:bg-slate-950/55"
          aria-label="Replay video"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg">
            <RotateCcw className="h-4 w-4" /> Replay
          </span>
        </button>
      )}
    </>
  )
}
