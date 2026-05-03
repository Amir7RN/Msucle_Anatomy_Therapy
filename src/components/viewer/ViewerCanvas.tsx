import React, { useCallback, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Lights } from './Lights'
import { CameraController } from './CameraController'
import { HumanModel } from './HumanModel'
import { HumanAtlas } from './HumanAtlas'
import { MuscleOverlay } from './MuscleOverlay'
import { BodySurface } from './BodySurface'
import { PainOverlay } from './PainOverlay'
import { SchematicMarkers } from '../schematic/SchematicMarkers'
import { SchematicOverlay } from '../schematic/SchematicOverlay'
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
    <div className="hidden md:block absolute top-3 left-1/2 -translate-x-1/2 text-slate-300 text-xs font-mono pointer-events-none z-10 bg-slate-900/70 px-2 py-1 rounded border border-slate-700/60">
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
      className="flex absolute top-3 right-3 z-10 items-center gap-1.5 px-2 py-1 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-slate-100 text-xs rounded border border-slate-600/60 transition-colors shadow-sm"
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
  const useMeshyModel   = useAtlasStore((s) => s.useMeshyModel)
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

        {useMeshyModel ? (
          <>
            {/* Meshy charcoal body underneath */}
            <HumanAtlas />
            {/* The legacy 52 muscles, calibrated onto the new body */}
            <MuscleOverlay />
            {/* Pain referral zone overlay (selection-driven) */}
            <PainOverlay />
          </>
        ) : (
          <>
            {/* Legacy: 52-mesh BodyParts3D pipeline */}
            <BodySurface />
            <HumanModel modelExists={modelExists} modelPath={modelPath} />
            <PainOverlay />
          </>
        )}

        {/* Robot-Schematic markers — projects muscle world-pos to screen each frame */}
        <SchematicMarkers />
      </Canvas>

      {/* HTML/SVG schematic overlay — leader lines + label cards */}
      <SchematicOverlay />

      <ModelStatusBadge />
      <HoverTooltip />
      <InteractionHint />
      <ScreenshotButton glRef={rendererRef} />
      <ModelSwitchToggle />
      {/* CalibrationPanel hidden — muscle scaling is locked to baked values */}
    </div>
  )
}

// ── Muscle-overlay calibration sliders ───────────────────────────────────────

function CalibrationPanel() {
  const sx       = useAtlasStore((s) => s.muscleOverlayScaleX)
  const sy       = useAtlasStore((s) => s.muscleOverlayScaleY)
  const sz       = useAtlasStore((s) => s.muscleOverlayScaleZ)
  const ox       = useAtlasStore((s) => s.muscleOverlayOffsetX)
  const oy       = useAtlasStore((s) => s.muscleOverlayOffsetY)
  const oz       = useAtlasStore((s) => s.muscleOverlayOffsetZ)
  const armT     = useAtlasStore((s) => s.armTransform)
  const legT     = useAtlasStore((s) => s.legTransform)
  const setSX    = useAtlasStore((s) => s.setMuscleOverlayScaleX)
  const setSY    = useAtlasStore((s) => s.setMuscleOverlayScaleY)
  const setSZ    = useAtlasStore((s) => s.setMuscleOverlayScaleZ)
  const setOX    = useAtlasStore((s) => s.setMuscleOverlayOffsetX)
  const setOY    = useAtlasStore((s) => s.setMuscleOverlayOffsetY)
  const setOZ    = useAtlasStore((s) => s.setMuscleOverlayOffsetZ)
  const setArmT  = useAtlasStore((s) => s.setArmTransform)
  const setLegT  = useAtlasStore((s) => s.setLegTransform)
  const reset    = useAtlasStore((s) => s.resetMuscleOverlay)

  return (
    <div className="absolute left-3 bottom-12 z-10 w-72 rounded-md border border-slate-700 bg-slate-900/90 p-3 text-slate-200 text-[11px] shadow-lg space-y-2 backdrop-blur max-h-[82vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="font-semibold tracking-wide">Muscle Overlay Calibration</span>
        <button onClick={reset} className="text-[10px] text-slate-400 hover:text-white">reset</button>
      </div>

      <div className="text-[10px] uppercase tracking-wider text-slate-500 pt-1">Global Scale</div>
      <Slider label="Width X"  value={sx} min={0.5} max={2.5} step={0.005} onChange={setSX} format={(v) => v.toFixed(3)} />
      <Slider label="Height Y" value={sy} min={0.5} max={2.5} step={0.005} onChange={setSY} format={(v) => v.toFixed(3)} />
      <Slider label="Depth Z"  value={sz} min={0.5} max={2.5} step={0.005} onChange={setSZ} format={(v) => v.toFixed(3)} />

      <div className="text-[10px] uppercase tracking-wider text-slate-500 pt-1">Global Offset</div>
      <Slider label="X" value={ox} min={-0.5} max={0.5} step={0.002} onChange={setOX} format={(v) => v.toFixed(3)} />
      <Slider label="Y" value={oy} min={-0.5} max={0.5} step={0.002} onChange={setOY} format={(v) => v.toFixed(3)} />
      <Slider label="Z" value={oz} min={-0.3} max={0.3} step={0.002} onChange={setOZ} format={(v) => v.toFixed(3)} />

      <LimbControls title="Arms (mirrored L/R)"  transform={armT} onPatch={setArmT} rotRange={30}  offRange={0.30} />
      <LimbControls title="Legs (mirrored L/R)"  transform={legT} onPatch={setLegT} rotRange={20}  offRange={0.30} />
    </div>
  )
}

// ── Per-limb 9-DOF section ───────────────────────────────────────────────────

interface LimbControlsProps {
  title:     string
  transform: import('../../store/atlasStore').LimbTransform
  onPatch:   (patch: Partial<import('../../store/atlasStore').LimbTransform>) => void
  rotRange:  number
  offRange:  number
}

function LimbControls({ title, transform: t, onPatch, rotRange, offRange }: LimbControlsProps) {
  return (
    <>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 pt-1">{title}</div>
      <div className="text-[9px] text-slate-500">Translate</div>
      <Slider label="X (out)" value={t.offsetX} min={-offRange} max={offRange} step={0.002} onChange={(v) => onPatch({ offsetX: v })} format={(v) => v.toFixed(3)} />
      <Slider label="Y (up)"  value={t.offsetY} min={-offRange} max={offRange} step={0.002} onChange={(v) => onPatch({ offsetY: v })} format={(v) => v.toFixed(3)} />
      <Slider label="Z (fwd)" value={t.offsetZ} min={-offRange} max={offRange} step={0.002} onChange={(v) => onPatch({ offsetZ: v })} format={(v) => v.toFixed(3)} />
      <div className="text-[9px] text-slate-500">Rotate</div>
      <Slider label="X tilt"  value={t.rotXDeg} min={-rotRange} max={rotRange} step={0.5}   onChange={(v) => onPatch({ rotXDeg: v })} format={(v) => v.toFixed(1) + '°'} />
      <Slider label="Y swing" value={t.rotYDeg} min={-rotRange} max={rotRange} step={0.5}   onChange={(v) => onPatch({ rotYDeg: v })} format={(v) => v.toFixed(1) + '°'} />
      <Slider label="Z open"  value={t.rotZDeg} min={-rotRange} max={rotRange} step={0.5}   onChange={(v) => onPatch({ rotZDeg: v })} format={(v) => v.toFixed(1) + '°'} />
      <div className="text-[9px] text-slate-500">Scale</div>
      <Slider label="W (X)"   value={t.scaleX}  min={0.6} max={1.6} step={0.005} onChange={(v) => onPatch({ scaleX: v })} format={(v) => v.toFixed(3)} />
      <Slider label="L (Y)"   value={t.scaleY}  min={0.6} max={1.6} step={0.005} onChange={(v) => onPatch({ scaleY: v })} format={(v) => v.toFixed(3)} />
      <Slider label="D (Z)"   value={t.scaleZ}  min={0.6} max={1.6} step={0.005} onChange={(v) => onPatch({ scaleZ: v })} format={(v) => v.toFixed(3)} />
    </>
  )
}

interface SliderProps {
  label:    string
  value:    number
  min:      number
  max:      number
  step:     number
  onChange: (v: number) => void
  format:   (v: number) => string
}

function Slider({ label, value, min, max, step, onChange, format }: SliderProps) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-14 text-slate-400">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-orange-500"
      />
      <span className="w-12 text-right tabular-nums text-slate-300">{format(value)}</span>
    </label>
  )
}

function ModelSwitchToggle() {
  const useMeshyModel    = useAtlasStore((s) => s.useMeshyModel)
  const showMuscleDebug  = useAtlasStore((s) => s.showMuscleDebug)
  const toggleMeshyModel = useAtlasStore((s) => s.toggleMeshyModel)
  const toggleMuscleDebug = useAtlasStore((s) => s.toggleMuscleDebug)
  return (
    <div className="absolute bottom-3 right-3 z-10 hidden md:flex gap-2">
      <button
        onClick={toggleMeshyModel}
        className="px-2 py-1 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-[11px] rounded border border-slate-600/60 shadow-sm"
        title="Toggle between Meshy single-mesh atlas and the legacy 52-mesh model"
      >
        {useMeshyModel ? 'Atlas: Meshy' : 'Atlas: Legacy 52-mesh'}
      </button>
      {useMeshyModel && (
        <button
          onClick={toggleMuscleDebug}
          className={`px-2 py-1 text-[11px] rounded border shadow-sm ${
            showMuscleDebug
              ? 'bg-cyan-700/80 text-white border-cyan-500'
              : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-600/60'
          }`}
          title="Show calibration spheres at every muscle center"
        >
          Calibration Dots
        </button>
      )}
    </div>
  )
}
