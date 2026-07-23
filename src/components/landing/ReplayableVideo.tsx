/**
 * ReplayableVideo.tsx
 *
 * Muted, auto-looping video. Accepts a single `src` or a list of `srcs`:
 *   - one source  → loops that clip forever.
 *   - many sources → plays them back-to-back (stitched), then loops the sequence.
 *
 * Auto-replays with no button. Sits inside a `relative` container that clips it.
 */

import { useEffect, useRef, useState } from 'react'

export function ReplayableVideo({
  src,
  srcs,
  className = '',
}: {
  src?: string
  srcs?: string[]
  className?: string
}) {
  const list = srcs && srcs.length ? srcs : src ? [src] : []
  const ref = useRef<HTMLVideoElement>(null)
  const [idx, setIdx] = useState(0)
  const multi = list.length > 1

  // On advancing to the next clip in a sequence, load + play it.
  useEffect(() => {
    if (!multi) return
    const v = ref.current
    if (!v) return
    v.load()
    void v.play().catch(() => {})
  }, [idx, multi])

  if (list.length === 0) return null

  return (
    <video
      ref={ref}
      src={list[idx]}
      className={className}
      autoPlay
      muted
      loop={!multi}
      playsInline
      onEnded={multi ? () => setIdx((i) => (i + 1) % list.length) : undefined}
    />
  )
}
