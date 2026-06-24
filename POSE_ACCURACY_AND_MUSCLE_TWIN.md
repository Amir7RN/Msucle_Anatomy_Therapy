# Pose-estimation accuracy overhaul + Live Muscle Twin

On-device upgrade (MediaPipe heavy stays the model). Structure and existing
flows are preserved; everything below is additive or a surgical in-place
improvement. Video never leaves the browser.

## 1. Why measurements drifted when seated / lying — and the fix

The anatomical frame assumed the user was upright: it used the spine
(mid-hip → mid-shoulder) as "up", and the pelvic frame hard-coded world-up =
(0,1,0). The moment you sit back or lie down, the spine is no longer vertical,
so every sagittal/frontal/transverse projection rotated up to 90° off. There
was also no per-user zeroing, the smoother was a hand-rolled EMA, and a few
analysers used raw 2-D image coordinates that foreshorten off-axis.

New accuracy stack (all in `src/lib/movement/`):

- **`signalFilter.ts`** — true One-Euro filter (Casiez et al., CHI 2012) on the
  image *and* world channels, frame-rate aware, with single-frame teleport/
  outlier rejection and visibility hysteresis. Replaces the EMA in
  `CameraView.tsx`. Calm on holds, snappy on fast reps, no glitch spikes.
- **`bodyOrientation.ts`** — classifies standing / seated / supine / prone /
  side-lying from world coords + gravity, with temporal hysteresis. This is the
  core fix: downstream code now knows the posture.
- **`anatomicalFrame.ts`** (upgraded) — frame now carries a `quality` score;
  added `GRAVITY_UP`, `depthReliability()`, and `adaptiveVertexAngle()` which
  blends the 3-D world-coord angle with the in-plane 2-D angle by how
  trustworthy MediaPipe's depth is for that chain (depth is unreliable when
  lying / far away, so 2-D wins there — same logic the gait module already used).
- **`calibration.ts`** — captures a per-user neutral baseline (zeroes the
  goniometer like a clinician), per-orientation, persisted to localStorage.
- **`constraints.ts`** — clamps angles to the reference ROM, rejects implausible
  jumps (`MeasurementStabilizer`), and fuses frame quality + visibility + depth
  + stability into a single 0..1 confidence.
- **`jointReference.ts`** — loads the three attached JSONs (now in `src/data/`)
  as the single source of truth for ROM bounds, planes, neutral poses, and
  camera-orientation guidance, keyed to the existing movement ids.

Integrations:
- `muscleJointMap.ts` — elbow/knee/ankle now use `adaptiveVertexAngle`;
  `verifyNeutralPose()` is orientation-aware (accepts seated/lying neutral);
  new `readJointMovement()` returns a calibrated, ROM-clamped, confidence-scored
  reading and refuses postures incompatible with a test (e.g. a trunk test while
  lying). The bare `measure()` functions are unchanged for back-compat.
- `movements.ts` — neck-rotation and shoulder-ER analysers now use world
  coordinates (transverse-plane ear-line; gravity-referenced forearm elevation)
  instead of raw image x/y, with a 2-D fallback.
- `directionalCue.ts` — added a `MotionPacer` (rep tempo + concentric/eccentric
  phase) and `pickPacedCue()`: the coach holds cues during fast motion, paces
  tempo ("control the lowering"), and asks the user to reposition instead of
  reading out a low-confidence angle.

## 2. New feature — Live 3-D Muscle Twin (first of its kind)

`src/lib/movement/liveMuscleActivation.ts` + `components/movement/MuscleTwinView.tsx`.

Drives the existing 3-D muscular-system atlas from live pose, continuously, in
any orientation: as you move, the model lights up the muscles working now —
with agonist/antagonist roles, concentric/eccentric/isometric phase, effort
scaled to ROM, and confidence gating. Alongside it: live ROM and a left/right
symmetry meter. Sword/Hinge/Kaia show a stick-figure or a rep counter; none
render an anatomical digital twin from a single camera.

Launch: "Live Muscle Twin" button added to `FeatureLauncher` (and a
`twinOpen` flag + mount wired through `atlasStore` and `App.tsx`).

## 3. Verification note (please run locally)

I could not run `tsc` in this environment: the sandboxed shell sees a stale
snapshot of the repo that never received the editor's writes, so a compile
there would test old code. I verified every changed file against the editor's
source of truth and did a full manual type review, fixing two issues found that
way (a `SymmetryRegion` mismatch and a JSON tuple cast).

Please run `npm run build` (or `npx tsc --noEmit`) locally to confirm, and tell
me anything it flags — happy to fix immediately. New/changed files:

```
src/data/human_joint_rom_reference.json, human_joint_measurements.json, human_joint_neutral_camera.json
src/lib/movement/jointReference.ts, signalFilter.ts, bodyOrientation.ts, calibration.ts,
                 constraints.ts, liveMuscleActivation.ts
src/lib/movement/anatomicalFrame.ts, muscleJointMap.ts, movements.ts, directionalCue.ts   (upgraded)
src/components/movement/CameraView.tsx, MuscleTwinView.tsx
src/components/layout/FeatureLauncher.tsx, src/store/atlasStore.ts, src/App.tsx
```

## Muscle Twin realism pass (latest)

Fixes from video review of the live twin:

- **L/R + direction fixed properly.** Pose is now decomposed into the user's own
  anatomical frame (right / up / anterior) in `poseRig.ts` and rebuilt in the
  model's anatomical frame (derived from mesh geometry) in `MuscleTwinModel.tsx`.
  No more guessed axis signs — left stays left, abduction stays abduction, and
  it holds even if the user is turned/tilted to the camera.
- **Body no longer spins.** The torso root is locked upright; only limbs, neck
  and head articulate.
- **Forearm fixed.** It's gated on wrist visibility (poseRig) and every segment's
  rotation is clamped (`MAX_ANGLE`) + slerped, so the forearm no longer detaches
  or flails.
- **Calm, load-aware activation.** Engine rewritten: dim isometric baseline at
  rest (no flicker), activation rises with movement (ROM deviation + smoothed
  velocity), per-muscle attack/decay envelope, and a load multiplier. The model
  shows activation as COLOUR (tan → amber → deep red).
- **Claude-vision load estimate** (`loadEstimator.ts`) scales activation by the
  weight the camera sees you holding (uses your own Anthropic key; bodyweight if
  none). Re-scan button in the rail.
- **Foot line** (ankle→heel→toe) added to the camera skeleton overlay so the
  ankle angle (shank line vs foot line) is visible, matching gait/assessment.
- **Analytics rebuilt:** four activation **spider plots** (head/neck, trunk,
  upper limb, lower limb) + a per-joint **ROM bar chart** with L/R and normal
  range. Added neck/head activation (SCM, upper trap) so that section has data.
- Larger, clearer camera preview.

New/changed files this pass:

```
src/lib/movement/poseRig.ts, liveMuscleActivation.ts, loadEstimator.ts
src/components/movement/MuscleTwinModel.tsx, MuscleTwinView.tsx, CameraView.tsx
src/components/movement/MuscleActivationRadars.tsx, RomBars.tsx
```

Still verify with a local `npm run build` — the sandbox compiler can't see the
editor's writes in this environment, so I type-reviewed by hand.
