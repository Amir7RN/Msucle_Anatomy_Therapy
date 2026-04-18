import React, { useCallback, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Lights } from './Lights'
import { CameraController } from './CameraController'
import { HumanModel } from './HumanModel'
import { BodySurface } from './BodySurface'
import { PainOverlay } from './PainOverlay'
import { useAtlasStore } from '../../store/atlasStore'
import { DEFAULT_CAMERA_POSITION } from '../../lib/cameraUtils'
import { useAnatomyModelProbe } from '../../hooks/useAnatomyModel'

// ── Status badge ──────────────────────────────────────────────────────────────

function ModelStatusBadge() {
  const status = useAtlasStore((s) => s.modelStatus)

  const labels: Record<string, string> = {
    loading:     '⏳ Loading anatomy model…',
    loaded:      '✓ BodyParts3D real anatomy loaded (52 muscles)',
    placeholder: '⚠ Model not found — place human-muscular-system.glb in public/models/',
    error:       '⚠ Model load error — check console',
  }

  const colors: Record<string, string> = {
    loading:     'bg-slate-800/90 text-slate-300',
    loaded:      'bg-emerald-900/90 text-emerald-300',
    placeholder: 'bg-amber-900/90 text-amber-300',
    error:       'bg-red-900/90 text-red-300',
  }

  return (
    <div
      className={`absolute bottom-3 left-3 px-2 py-1 rounded text-xs font-mono pointer-events-none z-10 ${colors[status] ?? colors.loading}`}
    >
      {labels[status] ?? 'Initialising…'}
    </div>
  )
}

// ── Hover tooltip ─────────────────────────────────────────────────────────────

function HoverTooltip() {
  const hoveredId  = useAtlasStore((s) => s.hoveredId)
  const sceneIndex = useAtlasStore((s) => s.sceneIndex)

  if (!hoveredId) return null
  const meta = sceneIndex.metadataById.get(hoveredId)
  if (!meta) return null

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-slate-900/95 text-slate-100 text-xs px-3 py-1.5 rounded-md shadow-lg pointer-events-none z-10 border border-slate-700 whitespace-nowrap">
      <span className="font-medium">{meta.displayName}</span>
      <span className="ml-2 text-slate-400 capitalize">
        {meta.layer} · {meta.region.replace(/_/g, ' ')}
      </span>
    </div>
  )
}

// ── Crosshair / interaction hint ──────────────────────────────────────────────

function InteractionHint() {
  const selectedId = useAtlasStore((s) => s.selectedId)
  const hoveredId  = useAtlasStore((s) => s.hoveredId)

  if (selectedId || hoveredId) return null

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 text-slate-300 text-xs font-mono pointer-events-none z-10 bg-slate-900/70 px-2 py-1 rounded border border-slate-700/60">
      Drag to rotate · Scroll to zoom · Click a muscle
    </div>
  )
}

// ── Screenshot button ─────────────────────────────────────────────────────────

function ScreenshotButton({ glRef }: { glRef: React.MutableRefObject<THREE.WebGLRenderer | null> }) {
  const handleScreenshot = useCallback(() => {
    const gl = glRef.current
    if (!gl) return

    // R3F renders to the canvas; grab it directly
    const canvas = gl.domElement
    const link    = document.createElement('a')
    link.download = `muscle-atlas-${Date.now()}.png`
    link.href     = canvas.toDataURL('image/png')
    link.click()
  }, [glRef])

  return (
    <button
      onClick={handleScreenshot}
      title="Export screenshot (PNG)"
      className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2 py-1 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-slate-100 text-xs rounded border border-slate-600/60 transition-colors shadow-sm"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      Screenshot
    </button>
  )
}

// ── Main canvas ───────────────────────────────────────────────────────────────

export function ViewerCanvas() {
  const setSelected     = useAtlasStore((s) => s.setSelected)
  const { modelExists, modelPath } = useAnatomyModelProbe()

  // Ref to the WebGL renderer — needed for screenshot
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)

  return (
    /*
      Clinical light background — matches anatomy atlas / medical textbook style.
      Bright off-white reveals muscle form and color without competing with tone.
    */
    <div className="relative w-full h-full" style={{ background: '#1c1a18' }}>
      <Canvas
        camera={{
          position: DEFAULT_CAMERA_POSITION.toArray() as [number, number, number],
          fov: 36,
          near: 0.01,
          far: 100,
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          // 1.25 exposure compensates for reduced ambient on dark background
          toneMappingExposure: 1.25,
          outputColorSpace: THREE.SRGBColorSpace,
          preserveDrawingBuffer: true,
        }}
        shadows="soft"
        onCreated={({ gl }) => { rendererRef.current = gl }}
        onPointerMissed={() => setSelected(null)}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Dark warm charcoal background — matches professional écorché viewers */}
        <color attach="background" args={['#1c1a18']} />

        {/*
          Subtle fog on dark background — prevents harsh clipping at far plane
          and gives a very slight atmospheric depth to the figure.
        */}
        <fog attach="fog" args={['#1c1a18', 18, 38]} />

        <Lights />
        <CameraController />

        {/* Subtle floor grid — spatial orientation cue, dark lines on dark bg */}
        <gridHelper
          args={[5, 24, '#2e2a26', '#2e2a26']}
          position={[0, -0.925, 0]}
        />

        {/* Base body surface — renders under muscles, provides canvas for pain overlay */}
        <BodySurface />

        <HumanModel modelExists={modelExists} modelPath={modelPath} />

        {/* Pain referral overlay — renders on top when a muscle is selected */}
        <PainOverlay />
      </Canvas>

      <ModelStatusBadge />
      <HoverTooltip />
      <InteractionHint />
      <ScreenshotButton glRef={rendererRef} />
    </div>
  )
}
