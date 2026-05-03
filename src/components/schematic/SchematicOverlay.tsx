/**
 * SchematicOverlay.tsx
 *
 * "Robot Schematic" diagnostic display — compact leader lines from each
 * high-probability muscle out to a fixed label column on the SAME side as
 * the user's click.
 *
 * Layout rules (both bugs fixed):
 *   • ALL labels go into ONE column — left if the click was on the left half
 *     of the screen, right if it was on the right half.
 *   • Label boxes are SCREEN-FIXED (not per-frame world-projected) so they
 *     don't fly around as the user rotates.  Only the tip dots on the 3D
 *     model track the camera each frame.
 *   • Leader line: straight from tip dot → nearest vertical rail → anchor.
 *
 * Side-correct interactivity (bug 2 fix):
 *   • Hover/click resolve the mesh ID via pickSideFromClick using the
 *     diagnostic's world-space click point, so right-click → right mesh.
 */

import React, { useMemo } from 'react'
import * as THREE from 'three'
import { useAtlasStore } from '../../store/atlasStore'
import {
  DIAGNOSTIC_TO_MESH_IDS,
  pickSideFromClick,
} from '../../lib/diagnostic'
import { useSchematicStore, type SchematicMarker } from './schematicStore'

// ── Layout constants ─────────────────────────────────────────────────────────
const LABEL_W      = 172   // px  — compact card width
const LABEL_H      = 52    // px  — card height
const LABEL_GAP    = 8     // px  — vertical gap between cards
// Pull cards ~90 px away from the screen edge so they sit in the middle
// band rather than hard against the border.  On wider screens this positions
// them roughly 1/4 of the way in from the right, which keeps leader lines
// reasonably short without crowding the 3D model.
const COL_MARGIN   = 90    // px  — distance from screen edge to column
const LINE_COLOR   = '#FF8C00'
const LINE_HOVER   = '#FFD080'
const ACCENT_PRI   = '#FF8C00'
const ACCENT_REF   = '#B45309'

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveClickVec(clickPoint: [number, number, number] | undefined): THREE.Vector3 | null {
  if (!clickPoint) return null
  return new THREE.Vector3(clickPoint[0], clickPoint[1], clickPoint[2])
}

function resolveCorrectMeshId(
  muscle_id: string,
  clickVec: THREE.Vector3 | null,
): string | null {
  const meshIds = DIAGNOSTIC_TO_MESH_IDS[muscle_id] ?? []
  if (meshIds.length === 0) return null
  if (clickVec) return pickSideFromClick(meshIds, clickVec) ?? meshIds[0]
  return meshIds[0]
}

// ─────────────────────────────────────────────────────────────────────────────

interface PlacedLabel {
  marker:   SchematicMarker
  /** Left edge of the label box. */
  labelX:   number
  /** Top edge of the label box. */
  labelY:   number
  /** Center-Y of the label (anchor for the leader line). */
  labelCY:  number
  /** Horizontal anchor point where the leader connects to the label. */
  anchorX:  number
  side:     'L' | 'R'
}

function SchematicOverlayInner({ className = '' }: { className?: string }) {
  const markersMap       = useSchematicStore((s) => s.markers)
  const diagnosticResult = useAtlasStore((s) => s.diagnosticResult)
  const setHovered       = useAtlasStore((s) => s.setHovered)
  const setSelected      = useAtlasStore((s) => s.setSelected)
  const hoveredId        = useAtlasStore((s) => s.hoveredId)

  const containerRef = React.useRef<HTMLDivElement>(null)
  const [size, setSize] = React.useState({ w: 0, h: 0 })
  React.useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => {
      const r = containerRef.current!.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Sorted markers — highest probability first.
  const markers = useMemo<SchematicMarker[]>(() => {
    return Object.values(markersMap)
      .filter((m) => m.visible)
      .sort((a, b) => b.probability - a.probability)
  }, [markersMap])

  // ── Which column side? ───────────────────────────────────────────────────
  // Use the average screenX of visible markers.  Because SchematicMarkers now
  // projects only the CORRECT-side mesh, all tips cluster on the clicked side.
  const side = useMemo<'L' | 'R'>(() => {
    if (markers.length === 0 || size.w === 0) return 'R'
    const avgX = markers.reduce((s, m) => s + m.screenX, 0) / markers.length
    return avgX >= size.w * 0.5 ? 'R' : 'L'
  }, [markers, size.w])

  // ── Fixed label column layout ────────────────────────────────────────────
  // Labels are placed in a compact vertical stack, centred on the viewport.
  // They DON'T move when the camera rotates — only the tip dots do.
  const placed = useMemo<PlacedLabel[]>(() => {
    if (size.w === 0 || markers.length === 0) return []
    const n        = markers.length
    const totalH   = n * LABEL_H + (n - 1) * LABEL_GAP
    const startY   = Math.max(8, (size.h - totalH) / 2)
    const labelX   = side === 'R'
      ? size.w - COL_MARGIN - LABEL_W
      : COL_MARGIN
    const anchorX  = side === 'R' ? labelX : labelX + LABEL_W

    return markers.map((marker, i) => {
      const labelY  = startY + i * (LABEL_H + LABEL_GAP)
      const labelCY = labelY + LABEL_H / 2
      return { marker, labelX, labelY, labelCY, anchorX, side }
    })
  }, [markers, size, side])

  // Click point in world space (for side-correct mesh resolution).
  const clickVec = useMemo(
    () => resolveClickVec(diagnosticResult?.clickPoint as [number, number, number] | undefined),
    [diagnosticResult],
  )

  // ── Interaction handlers ─────────────────────────────────────────────────
  function handleHover(muscle_id: string | null) {
    if (!muscle_id) { setHovered(null); return }
    const meshId = resolveCorrectMeshId(muscle_id, clickVec)
    setHovered(meshId)
  }

  function handleClick(muscle_id: string) {
    const meshId = resolveCorrectMeshId(muscle_id, clickVec)
    if (meshId) setSelected(meshId)
  }

  function isMuscleHovered(muscle_id: string): boolean {
    if (!hoveredId) return false
    const meshId = resolveCorrectMeshId(muscle_id, clickVec)
    if (meshId) return hoveredId === meshId
    // Fallback: check all sides
    return (DIAGNOSTIC_TO_MESH_IDS[muscle_id] ?? []).includes(hoveredId)
  }

  // ── Mobile: compact bottom list (no SVG) when container is narrow ───────
  const isMobile = size.w > 0 && size.w < 600

  if (isMobile && markers.length > 0) {
    return (
      <div
        ref={containerRef}
        className={`pointer-events-none absolute inset-0 z-20 ${className}`}
      >
        {/* Bottom strip — horizontally scrollable pill list */}
        <div className="pointer-events-auto absolute bottom-0 left-0 right-0 bg-black/75 backdrop-blur-sm pb-2 pt-2">
          <div className="flex gap-2 overflow-x-auto px-3 scrollbar-none">
            {markers.map((marker) => {
              const hovered = isMuscleHovered(marker.muscle_id)
              const accent  = marker.matchType === 'primary' ? ACCENT_PRI : ACCENT_REF
              return (
                <button
                  key={marker.muscle_id}
                  onMouseEnter={() => handleHover(marker.muscle_id)}
                  onMouseLeave={() => handleHover(null)}
                  onClick={() => handleClick(marker.muscle_id)}
                  className={[
                    'flex-shrink-0 flex items-center gap-2 rounded-lg border px-3 py-2',
                    'bg-slate-900/95 text-left transition-all',
                    hovered
                      ? 'border-orange-300/80 shadow-lg shadow-orange-500/30'
                      : 'border-orange-800/60',
                  ].join(' ')}
                >
                  <div className="w-[3px] self-stretch rounded-full" style={{ backgroundColor: accent }} />
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-100 whitespace-nowrap">
                      {marker.common_name}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-500">
                      {marker.matchType} zone
                    </div>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-orange-300 ml-1">
                    {Math.round(marker.probability * 100)}%
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 z-20 ${className}`}
    >
      {/* Blueprint watermark */}
      {placed.length > 0 && (
        <div className="absolute left-1/2 top-5 -translate-x-1/2 select-none text-[9px] font-bold uppercase tracking-[0.4em] text-orange-400/25 pointer-events-none">
          Likely Sources Schematic
        </div>
      )}

      {/* SVG — leader lines + tip dots only */}
      <svg className="absolute inset-0 h-full w-full overflow-visible" width={size.w} height={size.h}>
        <defs>
          <filter id="schematic-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {placed.map(({ marker, anchorX, labelCY }) => {
          const hovered = isMuscleHovered(marker.muscle_id)
          const stroke  = hovered ? LINE_HOVER : LINE_COLOR
          const dash    = marker.matchType === 'referred' ? '5 4' : undefined
          const lw      = hovered ? 2.2 : 1.4

          // Leader: tip → rail → anchor
          // The "rail" is a vertical segment at the column edge (anchorX ± 40px)
          // so lines from different tips converge to the same X before branching
          // to their individual label anchors — avoids the "spider web" look.
          const railX = side === 'R' ? anchorX - 32 : anchorX + 32
          const tipX  = marker.screenX
          const tipY  = marker.screenY

          return (
            <g key={marker.muscle_id} filter="url(#schematic-glow)">
              {/* Tip → rail (horizontal leg) */}
              <line
                x1={tipX}   y1={tipY}
                x2={railX}  y2={tipY}
                stroke={stroke} strokeWidth={lw} strokeDasharray={dash} opacity={0.9}
              />
              {/* Rail → label anchor (vertical + horizontal leg) */}
              <polyline
                points={`${railX},${tipY} ${railX},${labelCY} ${anchorX},${labelCY}`}
                fill="none"
                stroke={stroke} strokeWidth={lw} strokeDasharray={dash} opacity={0.9}
              />
              {/* Tip dot */}
              <circle cx={tipX} cy={tipY} r={hovered ? 6 : 4.5} fill={stroke} opacity={0.95} />
              <circle cx={tipX} cy={tipY} r={hovered ? 10 : 8}
                fill="none" stroke={stroke} strokeWidth={1} opacity={0.35} />
              {/* Anchor dot */}
              <circle cx={anchorX} cy={labelCY} r={3} fill={stroke} opacity={0.9} />
            </g>
          )
        })}
      </svg>

      {/* HTML label cards */}
      {placed.map(({ marker, labelX, labelY, side: cardSide }) => {
        const hovered = isMuscleHovered(marker.muscle_id)
        const accent  = marker.matchType === 'primary' ? ACCENT_PRI : ACCENT_REF
        return (
          <div
            key={marker.muscle_id}
            onMouseEnter={() => handleHover(marker.muscle_id)}
            onMouseLeave={() => handleHover(null)}
            onClick={() => handleClick(marker.muscle_id)}
            className={[
              'pointer-events-auto absolute flex cursor-pointer items-stretch overflow-hidden rounded',
              'border transition-all duration-100',
              hovered
                ? 'border-orange-300/80 shadow-lg shadow-orange-500/30'
                : 'border-orange-800/60 shadow-md shadow-black/40',
              'bg-slate-900/92 backdrop-blur-sm',
            ].join(' ')}
            style={{
              width:         LABEL_W,
              height:        LABEL_H,
              left:          labelX,
              top:           labelY,
              flexDirection: cardSide === 'R' ? 'row' : 'row-reverse',
            }}
          >
            {/* Colour bar */}
            <div className="w-[3px] shrink-0" style={{ backgroundColor: accent }} />
            <div className="flex flex-1 flex-col justify-center px-2.5 py-1.5 min-w-0">
              <div className="flex items-center justify-between gap-1.5">
                <span className="truncate text-[11px] font-semibold leading-tight text-slate-100">
                  {marker.common_name}
                </span>
                <span className="shrink-0 text-[12px] font-bold tabular-nums text-orange-300">
                  {Math.round(marker.probability * 100)}%
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[9px] uppercase tracking-wider">
                <span style={{ color: accent }}>●</span>
                <span className="text-slate-500">{marker.matchType} zone</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const SchematicOverlay = React.memo(SchematicOverlayInner)
