/**
 * Tilt3D.tsx
 *
 * Wraps any block in a card that rotates toward the pointer on a real
 * perspective projection, lifts toward the viewer, and carries a specular
 * sheen that tracks the cursor. This is what makes the landing page read as a
 * 3D stage instead of a flat document.
 *
 * Deliberately cheap: no state, no re-renders. Pointer moves write the
 * transform straight to the node inside one rAF, so a page full of these
 * costs nothing until you actually hover one.
 *
 * Skipped automatically for touch/pen input (no hover to reveal it), for
 * `prefers-reduced-motion`, and whenever `disabled` is set — the drag/resize
 * layout editors pass `disabled` so a tilt never fights a drag.
 */

import { useCallback, useRef } from 'react'

type Tilt3DProps = {
  children: React.ReactNode
  /** Classes for the tilting element itself — put the border radius here. */
  className?: string
  /** Max rotation on each axis, in degrees. */
  max?: number
  /** How far the card lifts toward the viewer at full tilt, in px. */
  lift?: number
  /** Perspective distance in px — smaller is a stronger, wider-angle 3D. */
  perspective?: number
  /** Pointer-tracking sheen across the card's surface. */
  glare?: boolean
  /** Turn the whole effect off (used while a layout editor is dragging). */
  disabled?: boolean
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

export function Tilt3D({
  children,
  className = '',
  max = 7,
  lift = 20,
  perspective = 1100,
  glare = true,
  disabled = false,
}: Tilt3DProps) {
  const ref = useRef<HTMLDivElement>(null)
  const glareRef = useRef<HTMLDivElement>(null)
  const frame = useRef(0)

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || e.pointerType !== 'mouse' || prefersReducedMotion()) return
      const el = ref.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width   // 0 → 1 across
      const py = (e.clientY - rect.top) / rect.height   // 0 → 1 down

      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        const rx = (0.5 - py) * 2 * max
        const ry = (px - 0.5) * 2 * max
        el.style.transition = 'transform 120ms ease-out'
        el.style.transform =
          `perspective(${perspective}px) rotateX(${rx.toFixed(2)}deg) ` +
          `rotateY(${ry.toFixed(2)}deg) translateZ(${lift}px)`

        const g = glareRef.current
        if (g) {
          g.style.opacity = '1'
          g.style.background =
            `radial-gradient(40% 60% at ${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%, ` +
            'rgba(255,255,255,0.85), rgba(255,255,255,0) 72%)'
        }
      })
    },
    [disabled, lift, max, perspective],
  )

  const reset = useCallback(() => {
    cancelAnimationFrame(frame.current)
    const el = ref.current
    if (el) {
      el.style.transition = 'transform 620ms cubic-bezier(0.22, 1, 0.36, 1)'
      el.style.transform = ''
    }
    if (glareRef.current) glareRef.current.style.opacity = '0'
  }, [])

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
      className={`zh-tilt ${className}`}
    >
      {children}
      {glare && <div ref={glareRef} className="zh-tilt-glare" aria-hidden />}
    </div>
  )
}
