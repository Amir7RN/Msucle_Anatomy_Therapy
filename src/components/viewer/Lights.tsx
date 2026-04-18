import React from 'react'
import { Environment } from '@react-three/drei'

/**
 * Anatomy-studio lighting rig — v5 (écorché / dark-background edition)
 *
 * Designed for a DARK background anatomy viewer that matches professional
 * écorché renders (Sketchfab-style).  The reduced ambient is CRITICAL:
 *
 *   Previous ambient = 1.8 → all surfaces uniformly lit, zero depth
 *   This version     = 0.65 → shadows form between muscle bellies,
 *                              muscle relief becomes clearly visible
 *
 * Rig:
 *  AMBIENT       very low neutral — prevents pure-black on shadowed faces
 *  KEY LIGHT     front upper-left, warm white, strong — primary muscle form
 *  SECONDARY KEY front right, slightly softer — opens key shadows just enough
 *  RIM LIGHT     rear-upper, cool blue-white — critical silhouette separation
 *  LOW BACK RIM  rear-lower, neutral — keeps posterior from going flat
 *  WARM BOUNCE   below figure, warm amber — wet tissue warmth from "table"
 *  COLD FILL     below rear, cool — prevents total shadow uniformity
 *
 * Environment (city preset): provides HDR micro-specular on wet muscle surfaces.
 * intensity=0.4 so it supplements rather than dominates the directional rig.
 */
export function Lights() {
  return (
    <>
      {/*
        AMBIENT — intentionally low.
        0.65 is just enough to prevent absolute-black on shadowed muscle faces.
        This is the single most important change: lower ambient = visible muscle relief.
      */}
      <ambientLight intensity={0.65} color="#fff0e8" />

      {/*
        PRIMARY KEY LIGHT — front upper-left, warm anatomy-lab tone.
        Strong single source reveals muscle belly convexity through shadow gradients.
        Shadow casting enabled for inter-muscle depth cues.
      */}
      <directionalLight
        position={[-2.8, 5.8, 3.2]}
        intensity={4.8}
        color="#fffaf2"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.05}
        shadow-camera-far={25}
        shadow-camera-left={-2.5}
        shadow-camera-right={2.5}
        shadow-camera-top={3.0}
        shadow-camera-bottom={-3.0}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
      />

      {/*
        SECONDARY KEY — front right, neutral.
        Softens key shadows without flattening the form.
        ~30% of primary key — just enough to read anatomy on the key-shadow side.
      */}
      <directionalLight
        position={[3.2, 3.5, 2.8]}
        intensity={1.6}
        color="#f4f0ff"
      />

      {/*
        UPPER RIM LIGHT — rear-upper.
        Essential for muscle silhouette separation on dark background.
        Stronger than previous (2.2 vs 1.2) because we need contrast
        between figure and dark bg.  Cool blue-white = depth perception.
      */}
      <directionalLight
        position={[0.6, 4.2, -5.5]}
        intensity={2.2}
        color="#c8d8ff"
      />

      {/*
        LOW BACK RIM — rear-lower neutral.
        Prevents flat posterior when looking from behind.
        Also reveals Achilles, calves, and hamstrings clearly.
      */}
      <directionalLight
        position={[-0.8, -0.4, -3.5]}
        intensity={0.9}
        color="#dce8f4"
      />

      {/*
        WARM GROUND BOUNCE — below and forward.
        Simulates warm light bouncing off dissection table / floor.
        Gives the lower body a biological warmth.
      */}
      <pointLight
        position={[0, -1.6, 0.9]}
        intensity={1.2}
        color="#ffd8a0"
        distance={5.5}
        decay={2}
      />

      {/*
        COOL UNDERSIDE FILL — below rear.
        Provides subtle separation between legs from behind.
      */}
      <pointLight
        position={[0, -1.2, -0.8]}
        intensity={0.5}
        color="#b0c8e8"
        distance={4.0}
        decay={2}
      />

      {/*
        ENVIRONMENT MAP — city preset, low intensity.
        Provides physically-correct micro-specular on curved wet muscle surfaces.
        Intensity 0.4 supplements rather than dominates the directional rig.
        background=false preserves our dark canvas background.
      */}
      <Environment preset="city" background={false} environmentIntensity={0.4} />
    </>
  )
}
