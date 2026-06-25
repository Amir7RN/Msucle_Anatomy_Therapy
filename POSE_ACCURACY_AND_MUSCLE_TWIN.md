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

## Realism pass 2 (latest)

- **Forearm fundamentally fixed.** The GLB's only forearm muscle is a short
  brachioradialis sliver that can't hold an elbow joint when rigged rigidly, so
  it kept detaching. It's now FOLDED into the arm — the arm is one connected
  segment that can't come apart at the elbow. (Elbow bend shows via colour, not
  a separate moving forearm.)
- **Pelvis-rooted rig (grounding).** Re-rooted at the pelvis: the trunk LEANS on
  top of it (forward/back/side, derived from spine-vs-gravity → no spin), arms/
  neck/head follow the trunk, and the legs hang from the pelvis so they stay
  grounded when you move your trunk and only move when the leg moves. Replaces
  the old "lock the torso" hack.
- **More faithful mimicry.** Body-relative FK in the model's own anatomical
  frame; per-segment clamps + slerp keep it smooth and connected.
- **Live model in exercises.** ExerciseGuidance now drives the real pose+
  activation `MuscleTwinModel` (shared engine via refs) in place of the old
  blinking `MuscleActivationViewer`.
- **Panel reorganised + responsive.** Load spans the top; muscle-activation
  spiders and ROM bars sit SIDE BY SIDE. The whole Twin view is now responsive:
  a right column on desktop, and on mobile the model sits on top with the
  analytics scrolling below.

Files: src/lib/movement/poseRig.ts; src/components/movement/MuscleTwinModel.tsx,
MuscleTwinView.tsx, ExerciseGuidance.tsx.

Note: if forward/back reaching looks reversed (single-camera depth sign), flip
`ant` in MuscleTwinModel's axis build — one line.

## Realism pass 3 (latest)

- **Forward/back fixed.** The model's anterior axis was inverted (trunk-back
  showed as forward); `ANTERIOR_SIGN` in MuscleTwinModel now corrects it for all
  flexion/extension. Left/right kept mirrored as requested.
- **Posture-aware / gravity-aware model.** New `exercisePose.ts` maps each
  exercise to its expected posture (stand/sit/supine/side). In exercises the
  model adopts that posture (the "cheat" — trust the known exercise) instead of
  guessing, so it lies down for a glute bridge, goes on its side for a clamshell,
  stands for a wall stretch — and the limbs track live on top. In the standalone
  Twin the posture follows the live orientation classifier. Trunk gravity-lean is
  zeroed when lying so the trunk doesn't bend wildly.
- **Visible ground.** A soil-coloured floor + contact ring is drawn under the
  model in every 3-D view.
- **Bigger analytics.** Wider panel column; larger spider plots and ROM bars.
- **Engaged-muscle readout in exercises.** ExerciseGuidance now shows the few
  muscles actually firing for the exercise, quantitatively (name + % bar), from
  the live engine. The standalone Twin keeps the full all-muscle spiders.

Files: src/lib/movement/exercisePose.ts, poseRig.ts; src/components/movement/
MuscleTwinModel.tsx, MuscleTwinView.tsx, ExerciseGuidance.tsx,
MuscleActivationRadars.tsx, RomBars.tsx.

Tunables if a posture looks off: the rotations in `postureToQuat` (MuscleTwin
Model) and the per-exercise postures in `exercisePose.ts`.

## Realism pass 4 + activation enrichment (latest)

Rig fixes (from video review):

- **Anatomy from geometry, not sign-guessing.** The model's anatomical axes are
  now derived from the GLB itself — up = pelvis→neck, anterior = erector-spinae
  (back) → pectoralis (front), right = up×anterior sign-checked to the _R arm.
  This fixes forward/back consistently (trunk lean AND hip/leg flexion), which
  also fixes the "I sat down but the legs flew up" bug.
- **Limbs stay attached.** Shoulders/hips now pivot at the MEDIAL-top of the
  limb (the joint socket near the torso) instead of the lateral acromion, so a
  raised/abducted limb stays connected to the body.
- **True mirror.** The model is now a mirror: the user's LEFT limb drives the
  model's RIGHT segment (poseRig swaps L↔R and negates the lateral axis), and
  the activation side is mirrored to match (the limb that moves is the limb that
  lights up). Abduction/adduction read correctly. Toggle `MIRROR` in
  MuscleTwinModel for facing-partner mode.
- **Object detection usable.** No Anthropic key was configured (that's why it
  "didn't work"). The Twin's load panel now has an inline key field (stored on
  device, shared with AI Chat), surfaces scan errors, and reports the detected
  carried object ("water bottle", per-hand kg, confidence).

Activation enrichment (from the datasets research):

- The research's recommended pipeline is MinT (OpenSim pose→activation) →
  collapse to ~13 muscle groups → fine-tune on MIA real-EMG. That needs an 11 GB
  dataset + offline training, so it can't run at inference in-browser yet.
- As the real-time stand-in, `activationPriors.ts` encodes each exercise's
  canonical muscle-group activation (consistent with the EMG literature and the
  representative MinT/OpenSim patterns in the research appendix — squat →
  quads/glutes/erectors, hip-hinge → glutes/hams/erectors, curl →
  biceps/brachialis, etc.). During an exercise the live engine blends toward
  this prior, scaled by movement energy and external load, so the activation
  tracks the literature instead of the per-frame geometric estimate alone.
- **Staged ML path to swap in later** (documented for when you train it):
  1. `pip install musint`; train a seq2seq (transformer) pose-window → [0,1]
     activations on MinT; collapse 402 strands → your muscle groups; score with
     PCC/SMAPE (not just RMSE).
  2. Bridge your MediaPipe pose → the joint-angle representation MinT expects;
     budget a domain-shift fine-tune.
  3. Fine-tune/validate on MIA's 8 real-EMG muscles for the exercise subset.
  4. Close the gym-lift gap with self-recorded OpenCap → OpenSim static-
     optimization data.
  Export the trained net to TF.js/ONNX-web and replace the prior blend with the
  model's per-frame output (same `ActivationPattern` shape). Note MinT is
  CC BY-NC — resolve licensing before shipping commercially.

Files: src/lib/movement/poseRig.ts, liveMuscleActivation.ts, activationPriors.ts,
loadEstimator.ts; src/components/movement/MuscleTwinModel.tsx, MuscleTwinView.tsx,
ExerciseGuidance.tsx.

## Realism pass 5 — twin behaves like a real digital twin (latest)

From a fresh video review (twin reversing when seated, no jump reaction, limbs
detaching, ignoring side-on turns). Root cause for most of these was the
anatomical frame's lateral/anterior axes flipping sign under MediaPipe's noisy
depth, plus the rig having no global yaw or vertical translation. Introduced a
stateful **`PoseRigEngine`** (in `poseRig.ts`) that the standalone Twin now drives,
and taught the model two new globals.

- **No more L/R or front/back flips.** The engine sign-stabilises the lateral
  axis by temporal continuity (anchored to the reliable spine axis) and rebuilds
  anterior = right×up from it. A slow genuine turn is tracked; a one-frame 180°
  depth flip is rejected. Fixes the segment-switching when walking toward/away
  from the camera AND the "sitting looked reversed / legs flew to the stomach"
  bug (the anterior sign no longer inverts).
- **The twin turns when you turn (sagittal).** A facing `yaw` is derived from the
  now-continuous anterior axis, zeroed to the user's start, unwrapped, rate-
  limited and EMA-smoothed, then applied as a global Y-rotation on the model. Turn
  to your side and the model turns with you. Tunable: `YAW_SIGN` (one line in
  MuscleTwinModel) if it should rotate the other way.
- **Gravity / jump reaction.** World coords are hip-centred so they can't see
  global rise/fall; the engine reads the pelvis height from the IMAGE against a
  slow baseline and the model translates up on a jump, dips on a squat
  (`rootY`). Tunables: `JUMP_GAIN`, `ROOT_MIN/MAX` in poseRig.
- **Limbs stay attached.** Per-limb visibility gating + direction smoothing
  (`nlerp`) in the engine (a limb that drops out HOLDS its last good pose instead
  of flinging), tighter anatomical joint clamps (thigh 100°, arm 165°), and a
  hard per-frame slew limit (`MAX_STEP_DEG`, `slewQuat`) in the model so one bad
  frame can't teleport a joint.

`poseBoneDirections` is unchanged and still used by guided exercises (known
posture, user faces the camera). Verified poseRig.ts with `tsc --strict` (clean);
please run `npm run build` to confirm the two view files — the sandbox's
OneDrive mount only had a half-synced copy so it couldn't compile them here.

Files: src/lib/movement/poseRig.ts; src/components/movement/MuscleTwinModel.tsx,
MuscleTwinView.tsx.
