/**
 * HumanAtlas.tsx
 *
 * Meshy single-mesh BODY (skin only) — passive backdrop that the 52-mesh
 * MuscleOverlay sits on top of.
 *
 *  Mesh source:    public/models/male-body.glb
 *  Pipeline:       useGLTF → scale + ground → material override
 *
 * Click semantics
 *  • Diagnostic mode (Area-to-Muscle):  clicks on the body resolve to a
 *    BODY_ZONES region via the existing useDiagnosticClickFromStore hook
 *    and pop the Diagnostic Drawer.  Identity preserved.
 *  • Muscle selection mode:  clicks on the body deselect (since the body
 *    is "background skin", not a muscle).  Muscle clicks come from the
 *    MuscleOverlay, which calls e.stopPropagation() before bubbling here,
 *    so this handler only fires for honest body-only hits.
 *
 * Material override
 *  • Charcoal MeshStandardMaterial  (color #2a2a2a, roughness 0.4, metal 0.1,
 *    emissive #111111).  Applied as one shared instance.
 *
 * Render priority
 *  • renderOrder = -2  — behind both BodySurface (-1) and the muscles (0+).
 *  • depthWrite = true — body still occludes things behind it.
 */

import React, { Component, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useAtlasStore } from '../../store/atlasStore'
import { useDiagnosticClickFromStore } from '../../hooks/useDiagnosticClick'
import { MESHY_SCALE, MESHY_GROUND_Y } from '../../lib/muscleMap'

// Free3D "Male Base 88907" — verify license terms before commercial release.
export const MESHY_MODEL_PATH = `${import.meta.env.BASE_URL}models/male-normal.glb`

// ─────────────────────────────────────────────────────────────────────────────
//  Material factory — clinical charcoal, per spec
// ─────────────────────────────────────────────────────────────────────────────

function buildClinicalSkinMaterial(): THREE.MeshStandardMaterial {
  // Ghostly skin shell — opacity 0.15 keeps the body as a faint outline.
  // depthWrite=false ensures the body never z-occludes muscles regardless
  // of camera angle.  renderOrder=2 (set on each mesh) puts the body's
  // alpha compositing AFTER the muscles, so colour blends look correct.
  return new THREE.MeshStandardMaterial({
    color:             '#d9b08c',       // warm light skin tone
    roughness:         0.55,
    metalness:         0.0,
    emissive:          '#3a2618',
    emissiveIntensity: 0.10,
    side:              THREE.FrontSide,
    flatShading:       false,
    transparent:       true,
    opacity:           0.15,            // very subtle ghost — muscles dominate visually
    depthWrite:        false,
    depthTest:         true,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
//  ErrorBoundary
// ─────────────────────────────────────────────────────────────────────────────

interface EBState { hasError: boolean }
class ModelErrorBoundary extends Component<{ children: React.ReactNode; fallback: React.ReactNode }, EBState> {
  constructor(props: any) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  render() { return this.state.hasError ? this.props.fallback : this.props.children }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GLTF loader + body click handler
// ─────────────────────────────────────────────────────────────────────────────

function MeshyScene() {
  const { scene } = useGLTF(MESHY_MODEL_PATH)
  const setSelected     = useAtlasStore((s) => s.setSelected)
  const diagnosticClick = useDiagnosticClickFromStore()

  // ── Material override (one-time per scene) ──────────────────────────────
  useEffect(() => {
    if (!scene) return
    const sharedMat = buildClinicalSkinMaterial()
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      // Discard any GLB-supplied material (Meshy export had none anyway).
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose?.())
      } else {
        (obj.material as THREE.Material | undefined)?.dispose?.()
      }
      obj.material      = sharedMat
      obj.castShadow    = true
      obj.receiveShadow = true
      // Skin renders AFTER muscles so the alpha-blend happens on top.
      // (Without this the body's depth-write would occlude the muscles.)
      obj.renderOrder   = 2
    })
    return () => { sharedMat.dispose() }
  }, [scene])

  function handleClick(e: ThreeEvent<MouseEvent>) {
    // Diagnostic mode (Area-to-Muscle) consumes the click first.
    if (diagnosticClick?.(e)) return
    // Otherwise the body is "background" — clicking empty skin deselects.
    e.stopPropagation()
    setSelected(null)
  }

  return (
    <group scale={MESHY_SCALE} onClick={handleClick}>
      <primitive object={scene} />
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Auto-grounding wrapper — feet sit at MESHY_GROUND_Y once bbox is known
// ─────────────────────────────────────────────────────────────────────────────

function GroundedHumanAtlas() {
  const outerRef = useRef<THREE.Group>(null)
  const [grounded, setGrounded] = useState(false)

  useFrame(() => {
    if (grounded || !outerRef.current) return
    const box = new THREE.Box3().setFromObject(outerRef.current)
    if (box.isEmpty()) return
    const dy = MESHY_GROUND_Y - box.min.y
    outerRef.current.position.y += dy
    setGrounded(true)
  })

  return (
    <group ref={outerRef}>
      <MeshyScene />
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public component
// ─────────────────────────────────────────────────────────────────────────────

function NotFound() {
  return null
}

export function HumanAtlas() {
  return (
    <ModelErrorBoundary fallback={<NotFound />}>
      <React.Suspense fallback={null}>
        <GroundedHumanAtlas />
      </React.Suspense>
    </ModelErrorBoundary>
  )
}

// Eager-load so the suspense fallback period is short on second mount.
useGLTF.preload(MESHY_MODEL_PATH)
