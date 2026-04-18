import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useAtlasStore } from '../../store/atlasStore'
import {
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
  CAMERA_PRESETS,
  type CameraPresetKey,
} from '../../lib/cameraUtils'

// Shared animation state — one animation runs at a time
interface AnimState {
  active:      boolean
  startPos:    THREE.Vector3
  startTarget: THREE.Vector3
  endPos:      THREE.Vector3
  endTarget:   THREE.Vector3
  progress:    number
  duration:    number   // seconds
}

const RESET_DURATION  = 0.65
const PRESET_DURATION = 0.55

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

/**
 * CameraController
 *
 * Manages OrbitControls + two types of programmatic camera animation:
 *   1. cameraResetTrigger  — smooth return to default position/target
 *   2. cameraPreset        — fly to a named anatomical view (front/back/left/right/top)
 *
 * Both use the same lerp animation loop — whichever fires last wins.
 */
export function CameraController() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const { camera }  = useThree()

  const cameraResetTrigger = useAtlasStore((s) => s.cameraResetTrigger)
  const cameraPreset       = useAtlasStore((s) => s.cameraPreset)
  const clearPreset        = useAtlasStore((s) => s.clearCameraPreset)

  const prevTrigger = useRef(cameraResetTrigger)
  const prevPreset  = useRef<CameraPresetKey | null>(null)

  const anim = useRef<AnimState>({
    active: false,
    startPos:    new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    endPos:      DEFAULT_CAMERA_POSITION.clone(),
    endTarget:   DEFAULT_CAMERA_TARGET.clone(),
    progress: 0,
    duration: RESET_DURATION,
  })

  function startAnim(
    endPos: THREE.Vector3,
    endTarget: THREE.Vector3,
    duration: number,
  ) {
    const a = anim.current
    a.startPos.copy(camera.position)
    a.startTarget.copy(
      controlsRef.current ? controlsRef.current.target : DEFAULT_CAMERA_TARGET,
    )
    a.endPos.copy(endPos)
    a.endTarget.copy(endTarget)
    a.progress = 0
    a.duration = duration
    a.active   = true
  }

  // Reset trigger
  useEffect(() => {
    if (cameraResetTrigger !== prevTrigger.current) {
      prevTrigger.current = cameraResetTrigger
      startAnim(DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET, RESET_DURATION)
    }
  }, [cameraResetTrigger])   // eslint-disable-line react-hooks/exhaustive-deps

  // Named preset trigger
  useEffect(() => {
    if (cameraPreset && cameraPreset !== prevPreset.current) {
      prevPreset.current = cameraPreset
      const preset = CAMERA_PRESETS[cameraPreset]
      if (preset) {
        startAnim(preset.position, preset.target, PRESET_DURATION)
      }
      clearPreset()
    }
  }, [cameraPreset, clearPreset])   // eslint-disable-line react-hooks/exhaustive-deps

  // Animation loop
  useFrame((_, delta) => {
    const a = anim.current
    if (!a.active || !controlsRef.current) return

    a.progress = Math.min(a.progress + delta / a.duration, 1)
    const t = easeInOut(a.progress)

    camera.position.lerpVectors(a.startPos, a.endPos, t)
    controlsRef.current.target.lerpVectors(a.startTarget, a.endTarget, t)
    controlsRef.current.update()

    if (a.progress >= 1) a.active = false
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.07}
      rotateSpeed={0.85}
      zoomSpeed={1.0}
      minDistance={0.4}
      maxDistance={8}
      target={DEFAULT_CAMERA_TARGET}
    />
  )
}
