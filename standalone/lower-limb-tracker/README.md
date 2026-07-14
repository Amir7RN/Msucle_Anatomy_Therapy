# Lower-Limb Tracker

Real-time ankle/shank pose tracking for a single webcam or video feed:
live left/right ankle angle (dorsiflexion/plantarflexion), tracking-gap
interpolation, instant "zero to current pose" calibration, and mp4 recording
with the skeleton + angle overlay burned in. Framework-agnostic — point it at
any `<video>` element already playing (a local webcam, a remote peer's video
element from your own call/WebRTC stack, or a recorded file) and it works.

No WebRTC, no signaling, no backend of any kind is included or required.
Everything runs client-side in the browser.

## Install / setup

**Option A — prebuilt bundle (no build tooling required on your end):**

```html
<script type="module">
  import { LowerLimbTracker } from './lower-limb-tracker.esm.js'
  // ...
</script>
```

Copy `dist/lower-limb-tracker.esm.js` into your own site and reference it
with a relative path or your own static-asset pipeline. This single file has
`@mediapipe/tasks-vision`'s JS wrapper bundled in — the only thing still
fetched externally at runtime is the MediaPipe WASM runtime and the pose
model binary (see "Self-hosting" below), because those are large binary
assets that can't be inlined into a JS bundle.

**Option B — source, if you have your own TypeScript/bundler pipeline:**

```bash
npm install   # installs @mediapipe/tasks-vision
npm run build # emits dist/lower-limb-tracker.esm.js + dist/*.d.ts
```

Then import from source or the built output as you would any package:
```ts
import { LowerLimbTracker } from '@zeva/lower-limb-tracker'
```

See `examples/vanilla/index.html` (zero-build) and `examples/react/Example.tsx`
(React) for complete, runnable reference integrations.

## Browser requirements

- **HTTPS** (or `localhost`) — `getUserMedia` (camera access) is blocked on
  plain HTTP by every modern browser.
- The user must grant **camera permission**. If you're pointing the tracker
  at a remote peer's `<video>` element instead of a local camera, the CAMERA
  PERMISSION PROMPT happens on whichever browser actually calls
  `getUserMedia` (i.e. the remote peer's browser, in your own call code) —
  this package never calls `getUserMedia` itself, it only reads frames from
  the `<video>` element you hand it.
- GPU delegate (fastest) needs WebGPU/WebGL; the tracker automatically falls
  back to a CPU delegate if GPU initialization fails, at a lower frame rate.
- Works in current Chrome, Edge, and Safari. Firefox support for MediaPipe's
  GPU delegate varies by version — CPU fallback still works everywhere.

## Camera placement

The ankle angle is most accurate when the subject is filmed roughly
**side-on** (camera near ground level, subject walking across the frame in
profile), because that's the sagittal plane clinicians goniometer against.
This package **corrects for the subject drifting off that exact angle**
(turning slightly toward/away from the camera, not walking a perfectly
straight line) by blending in MediaPipe's 3-D world-coordinate estimate — see
`src/gait.ts`'s module docstring for the full explanation. That correction
**mitigates, but does not eliminate**, off-axis error: for best results, keep
the subject's full body in frame, reasonably well-lit, and roughly
perpendicular to the camera for the duration of the walk.

## Quick start

```ts
import { LowerLimbTracker } from '@zeva/lower-limb-tracker'

const video = document.querySelector('video')!
const overlay = document.querySelector('canvas')!  // optional, for live skeleton drawing

const tracker = new LowerLimbTracker(video, { overlayCanvas: overlay })

tracker.onFrame((frame) => {
  console.log(frame.leftAnkleDeg, frame.rightAnkleDeg)
})

await tracker.start()

// Later, e.g. on a "Start" button:
tracker.startRecording()   // also zeroes the reading to the current pose

// Later, e.g. on a "Stop" button:
const clip = await tracker.stopRecording()   // Blob, mp4-preferred
const summary = tracker.getSummary()          // excursion / cadence / speed / symmetry
const csv = tracker.exportCsv()
```

## API reference

### `new LowerLimbTracker(video, options?)`

| Option | Type | Default | Notes |
|---|---|---|---|
| `overlayCanvas` | `HTMLCanvasElement` | — | Drawn with a transparent skeleton + live angle labels every frame. Optional — omit for headless (data-only) use. CSS-stack it directly over your `<video>` element for a live view. |
| `modelUrl` | `string` | Google's public CDN heavy-model URL | Override to self-host (recommended for production — see below). |
| `wasmBaseUrl` | `string` | jsDelivr CDN, pinned to the installed `@mediapipe/tasks-vision` version | Override to self-host. Must match your installed package version exactly. |
| `delegate` | `'GPU' \| 'CPU'` | `'GPU'` | Falls back to CPU automatically if GPU init throws, regardless of this setting. |
| `depthTrustCap` | `number` (0..1) | `0.5` | How much the ankle-angle blend trusts MediaPipe's 3-D depth. Higher = more off-axis correction but more susceptible to depth noise during fast motion. |

### Methods

- **`start(): Promise<void>`** — loads the pose model and begins the per-frame tracking loop.
- **`stop(): void`** — pauses the loop (model stays loaded; `start()` resumes).
- **`zero(): void`** — instantly re-baselines every channel to the *current* pose. The very next frame already reads ~0°; the baseline keeps refining for about 300ms (or up to 2s if a foot is briefly occluded at the exact moment you call this) before settling. Safe to call whether or not you're recording.
- **`clearZero(): void`** — reverts to raw (un-zeroed) readings.
- **`startRecording(zeroFirst = true): void`** — begins recording the composite (video + skeleton + angle labels) to a clip, and resets the step-count/summary buffers for a fresh session. Zeroes the baseline by default — pass `false` to keep whatever baseline (or lack of one) is already active.
- **`stopRecording(): Promise<Blob>`** — stops recording and resolves with the clip. `blob.type` tells you whether you got `video/mp4` or the `video/webm` fallback (depends on the browser — see "Recording format" below). Also finalizes `getSummary()`/`exportCsv()` for the window that was recorded.
- **`onFrame(cb): () => void`** — subscribe to every processed frame (runs continuously, whether or not you're recording). Returns an unsubscribe function.
- **`getSummary(): GaitSummary | null`** — excursion/cadence/speed/symmetry for the last `startRecording()`..`stopRecording()` window.
- **`exportCsv(): string | null`** — CSV of the last recording window (summary header + per-frame rows).
- **`destroy(): void`** — releases the pose model and stops the loop. Call when you're done with this tracker instance (e.g. the page/call is closing). Creating a new `LowerLimbTracker` re-downloads/re-initializes the model, so most integrations should create exactly one per active video feed and reuse it.

### `LowerLimbFrame` (the object passed to `onFrame`)

| Field | Type | Meaning |
|---|---|---|
| `timestampMs` | `number` | `performance.now()` at capture. |
| `leftAnkleDeg` / `rightAnkleDeg` | `number \| null` | + dorsiflexion, − plantarflexion. Relative to the last `zero()` once `zeroed` is true; raw degrees (~70-110° at neutral standing) otherwise. `null` when tracking is fully lost (see below). |
| `leftShankDeg` / `rightShankDeg` | `number \| null` | Shank (tibia) inclination from vertical. |
| `leftInterpolated` / `rightInterpolated` | `boolean` | `true` when this frame's ankle value was bridged (gap-filled) rather than freshly measured — see "Interpolation & tracking loss" below. |
| `leftConfidence` / `rightConfidence` | `'strong' \| 'fair' \| 'weak'` | Fused live tracking-confidence badge (visibility × depth reliability × stability). |
| `zeroed` | `boolean` | Whether a `zero()` baseline is currently active and applied to the `*Deg` fields. |
| `landmarks` | `LandmarkSet` | Full 33-point smoothed landmark set, if you want more than the ankle pair (e.g. knee/hip — see `LM` indices exported from `landmarks.ts`). |

## Interpolation & tracking loss

MediaPipe occasionally can't confidently localize a foot for a frame or two
(self-occlusion mid-stride, motion blur, briefly stepping just out of frame).
Rather than showing a blank or wildly jumpy number, each ankle/shank channel:

1. Holds the last known value and extrapolates from its recent angular
   velocity for the first ~150ms of a gap (gait reverses direction right
   around heel-strike/toe-off, so a longer blind extrapolation is more likely
   to be wrong at exactly the moment the real signal is about to turn).
2. Holds flat for the rest of a gap up to 400ms total.
3. Beyond 400ms, reports a genuine `null` — "tracking lost" — rather than
   fabricating data through a real, sustained occlusion.

`leftInterpolated`/`rightInterpolated` tell you which case you're in, so your
UI can (for example) dim the number or show a "~" prefix during a bridged gap,
matching what this package's own overlay-drawing does.

## Recording format

`stopRecording()` prefers MP4 (H.264/AAC) via `MediaRecorder`, which recent
Chrome/Edge/Safari support natively; browsers that don't fall back to WebM
automatically — check `blob.type` and name the saved file accordingly (the
examples do this for you). There is no server-side transcoding step and none
is required.

## Self-hosting the model for production

By default this package loads MediaPipe's WASM runtime from jsDelivr's CDN
and the pose model from Google's public model bucket — fine for a pilot or
demo, but a production embed shouldn't depend on a third-party CDN staying up
or being reachable on every customer's network. To self-host:

1. Download the WASM fileset for your pinned `@mediapipe/tasks-vision`
   version and the `pose_landmarker_heavy` (or `full`/`lite`) `.task` model
   file from MediaPipe's model index.
2. Host both under your own domain/CDN.
3. Pass `wasmBaseUrl`/`modelUrl` pointing at your copies in the
   `LowerLimbTracker` constructor options.

## Performance

The heavy model (the accuracy-optimized default) runs roughly 12–18 fps on a
CPU delegate and closer to 30 fps with GPU. Small angle errors compound in a
goniometric reading, so this package defaults to the heavy model; pass a
lighter `modelUrl` (MediaPipe also ships `full` and `lite` pose_landmarker
variants) if your integration needs higher throughput more than precision.

## Known limitations

- Single person only (`numPoses: 1`) — a second person in frame is ignored,
  not detected as a separate track.
- Extreme off-axis angles (subject nearly face-on to the camera rather than
  side-on) degrade accuracy beyond what the depth-blend correction can
  recover — this isn't a bug, it's the physical limit of a single monocular
  camera.
- No built-in persistence — `getSummary()`/`exportCsv()`/the recorded `Blob`
  are handed to you to store however your own application does (local
  download, your own backend, etc).

## License

- `@mediapipe/tasks-vision` (the pose-detection dependency) is Apache-2.0 —
  confirmed directly from its installed `package.json`, safe to redistribute
  and use commercially.
- **The terms under which this package itself is licensed to you are a
  business decision between the two companies, not something asserted in
  this file** — `package.json`'s `"license": "UNLICENSED"` is a placeholder.
  Replace it with whatever's agreed in your partnership terms.

## Maintenance note

See `SYNC.md` — this package is a manually-synced snapshot of the source
platform's pose engine, not a live dependency. Future fixes made upstream
need to be manually re-ported here.
