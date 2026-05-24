/**
 * BodySilhouette.tsx
 *
 * Anatomical body diagram with color-coded body regions, used by the
 * Symmetry Report. Pure SVG — exports cleanly via html2canvas. Each
 * region's color is driven by props so the same component renders the
 * symmetry map AND can be reused later for muscle-activation overlays.
 */

import React from 'react'
import type { SymmetryRegion } from '../../lib/insights/symmetry'

interface Props {
  regionColors?: Partial<Record<SymmetryRegion, string>>
  /** Default fill for regions with no data (or no colour override). */
  baseFill?: string
  /** Outline / silhouette stroke. */
  outline?: string
  width?:  number | string
  height?: number | string
}

const DEFAULT_BASE = '#1e293b'
const DEFAULT_LINE = '#475569'

export function BodySilhouette({
  regionColors = {},
  baseFill = DEFAULT_BASE,
  outline  = DEFAULT_LINE,
  width  = '100%',
  height = '100%',
}: Props) {
  const c = (r: SymmetryRegion): string => regionColors[r] ?? baseFill

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 240 480"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <defs>
        {/* Soft glow filter for hot regions (risk band). */}
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* HEAD */}
      <circle cx="120" cy="36" r="22" fill={baseFill} stroke={outline} strokeWidth="1.5" />

      {/* NECK */}
      <rect x="110" y="56" width="20" height="14" rx="4" fill={c('neck')} stroke={outline} strokeWidth="1" />

      {/* TRUNK */}
      <path
        d="M 86 72 Q 80 78 80 90 L 80 188 Q 80 200 92 204 L 148 204 Q 160 200 160 188 L 160 90 Q 160 78 154 72 Z"
        fill={c('trunk')}
        stroke={outline}
        strokeWidth="1.5"
      />

      {/* LEFT SHOULDER (user's left = viewer's RIGHT on the silhouette) */}
      <circle cx="170" cy="84" r="18" fill={c('left_shoulder')} stroke={outline} strokeWidth="1.5"
              filter={isHot(regionColors.left_shoulder) ? 'url(#glow)' : undefined} />

      {/* RIGHT SHOULDER */}
      <circle cx="70" cy="84" r="18" fill={c('right_shoulder')} stroke={outline} strokeWidth="1.5"
              filter={isHot(regionColors.right_shoulder) ? 'url(#glow)' : undefined} />

      {/* LEFT UPPER ARM */}
      <rect x="166" y="100" width="14" height="60" rx="6" fill={baseFill} stroke={outline} strokeWidth="1" />
      {/* LEFT ELBOW */}
      <circle cx="173" cy="166" r="10" fill={c('left_elbow')} stroke={outline} strokeWidth="1.5"
              filter={isHot(regionColors.left_elbow) ? 'url(#glow)' : undefined} />
      {/* LEFT FOREARM */}
      <rect x="166" y="174" width="14" height="56" rx="6" fill={baseFill} stroke={outline} strokeWidth="1" />
      {/* LEFT HAND */}
      <circle cx="173" cy="238" r="7" fill={baseFill} stroke={outline} strokeWidth="1" />

      {/* RIGHT UPPER ARM */}
      <rect x="60" y="100" width="14" height="60" rx="6" fill={baseFill} stroke={outline} strokeWidth="1" />
      {/* RIGHT ELBOW */}
      <circle cx="67" cy="166" r="10" fill={c('right_elbow')} stroke={outline} strokeWidth="1.5"
              filter={isHot(regionColors.right_elbow) ? 'url(#glow)' : undefined} />
      {/* RIGHT FOREARM */}
      <rect x="60" y="174" width="14" height="56" rx="6" fill={baseFill} stroke={outline} strokeWidth="1" />
      {/* RIGHT HAND */}
      <circle cx="67" cy="238" r="7" fill={baseFill} stroke={outline} strokeWidth="1" />

      {/* PELVIS */}
      <path d="M 80 204 Q 80 214 92 218 L 148 218 Q 160 214 160 204 Z"
            fill={baseFill} stroke={outline} strokeWidth="1.5" />

      {/* LEFT HIP */}
      <circle cx="142" cy="226" r="14" fill={c('left_hip')} stroke={outline} strokeWidth="1.5"
              filter={isHot(regionColors.left_hip) ? 'url(#glow)' : undefined} />
      {/* LEFT THIGH */}
      <rect x="132" y="238" width="20" height="92" rx="8" fill={baseFill} stroke={outline} strokeWidth="1" />
      {/* LEFT KNEE */}
      <circle cx="142" cy="338" r="12" fill={c('left_knee')} stroke={outline} strokeWidth="1.5"
              filter={isHot(regionColors.left_knee) ? 'url(#glow)' : undefined} />
      {/* LEFT SHIN */}
      <rect x="132" y="348" width="20" height="82" rx="8" fill={baseFill} stroke={outline} strokeWidth="1" />
      {/* LEFT ANKLE */}
      <circle cx="142" cy="438" r="9" fill={c('left_ankle')} stroke={outline} strokeWidth="1.5"
              filter={isHot(regionColors.left_ankle) ? 'url(#glow)' : undefined} />
      {/* LEFT FOOT */}
      <ellipse cx="146" cy="456" rx="14" ry="6" fill={baseFill} stroke={outline} strokeWidth="1" />

      {/* RIGHT HIP */}
      <circle cx="98" cy="226" r="14" fill={c('right_hip')} stroke={outline} strokeWidth="1.5"
              filter={isHot(regionColors.right_hip) ? 'url(#glow)' : undefined} />
      {/* RIGHT THIGH */}
      <rect x="88" y="238" width="20" height="92" rx="8" fill={baseFill} stroke={outline} strokeWidth="1" />
      {/* RIGHT KNEE */}
      <circle cx="98" cy="338" r="12" fill={c('right_knee')} stroke={outline} strokeWidth="1.5"
              filter={isHot(regionColors.right_knee) ? 'url(#glow)' : undefined} />
      {/* RIGHT SHIN */}
      <rect x="88" y="348" width="20" height="82" rx="8" fill={baseFill} stroke={outline} strokeWidth="1" />
      {/* RIGHT ANKLE */}
      <circle cx="98" cy="438" r="9" fill={c('right_ankle')} stroke={outline} strokeWidth="1.5"
              filter={isHot(regionColors.right_ankle) ? 'url(#glow)' : undefined} />
      {/* RIGHT FOOT */}
      <ellipse cx="94" cy="456" rx="14" ry="6" fill={baseFill} stroke={outline} strokeWidth="1" />
    </svg>
  )
}

/** True when the region's colour matches one of the "hot" risk colours. */
function isHot(color: string | undefined): boolean {
  if (!color) return false
  return color === '#ef4444' || color === '#fbbf24'
}
