# Provenance

This package is a manually-synced SNAPSHOT of the pose/biomechanics engine in
`src/lib/movement/*` of the `muscle-atlas` (Zeva Health) repository, cut from
the working tree based on commit `e0bee3c15d29c90e8220b15ffc92793b8e105407`
(2026-07-09) plus an unreleased 2026-07-14 fix (depth-corrected ankle angle,
tracking-gap interpolation, and live zero-on-record calibration) applied on
top before export.

It is **not** a live dependency — there is no automated link back to the main
app. If the main app's `gait.ts`/`signalFilter.ts`/`anatomicalFrame.ts`/
`poseDetector.ts`/`landmarks.ts` get further fixes later, someone needs to
manually re-port the relevant changes into this package's `src/`. For an
occasional partner-handoff artifact like this one, that manual step is a
reasonable trade-off against the complexity of wiring up a monorepo/workspace
just for one downstream consumer — revisit if this package gains more
consumers or needs to track upstream fixes more tightly.

Two intentional differences from the main app's copy of `gait.ts`:
- The CSV header and docstring's example device reference were genericized
  (the app's copy names a specific Zeva demo partner; irrelevant here).
- Nothing else — the ankle-angle math, gap-filler, and step machine are
  otherwise identical to the main app's fixed version.

`src/ice.ts` is a new file, not a straight copy — it re-implements the
TURN/Metered.ca credential-resolution logic from the main app's
`src/lib/call/signaling.ts` (`getIceServers`/`resolveTurn`) as an explicit-config,
env/localStorage-free function, since this package can't assume a Vite build
or the main app's runtime-override UI. The main app's Supabase-Realtime-based
signaling transport itself was intentionally NOT ported — see the README's
"Building a live remote call" section for why (the partner has their own
call/signaling infrastructure) and what a self-contained example looks like
instead (`examples/webrtc-call/`).
