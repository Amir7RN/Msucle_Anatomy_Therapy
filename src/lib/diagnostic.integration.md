# Diagnostic Integration — drop-in patches

All three patches are additive: they do not modify the existing Muscle-to-Pain
flow, `renderOrder` (0 / 5 for arm-priority), or `polygonOffset` (-1/-1,
-2/-2 for arm-priority). The Orange-Fire heatmap (`#CC5500` selected, `#FF8C00`
in the drawer) and all `${import.meta.env.BASE_URL}` asset paths are preserved.

---

## 1. `src/store/atlasStore.ts` — add diagnostic state

Inside `AtlasState`:

```ts
diagnosticMode:   boolean
diagnosticResult: DiagnosticResult | null
diagnosticPulseId: string | null

toggleDiagnosticMode: () => void
setDiagnostic:        (result: DiagnosticResult | null) => void
setDiagnosticPulse:   (id: string | null) => void
```

Import at the top of the file:

```ts
import type { DiagnosticResult } from '../lib/diagnostic'
```

Inside the `create<AtlasState>()` object:

```ts
diagnosticMode:    false,
diagnosticResult:  null,
diagnosticPulseId: null,

toggleDiagnosticMode: () =>
  set((s) => ({
    diagnosticMode:    !s.diagnosticMode,
    diagnosticResult:  null,
    diagnosticPulseId: null,
  })),
setDiagnostic:      (result) => set({ diagnosticResult: result }),
setDiagnosticPulse: (id)     => set({ diagnosticPulseId: id }),
```

---

## 2. `src/components/viewer/HumanModel.tsx` — update the click handler

Replace the existing `handleClick` with:

```ts
import { useDiagnosticClickFromStore } from '../../hooks/useDiagnosticClick'

// inside GLTFScene():
const diagnosticClick = useDiagnosticClickFromStore()

function handleClick(e: ThreeEvent<MouseEvent>) {
  // Area-to-Muscle path — consumes the click when diagnosticMode is ON.
  if (diagnosticClick?.(e)) return

  // ── Existing Muscle-to-Pain path (unchanged) ────────────────────────────
  e.stopPropagation()
  const obj = e.object as THREE.Mesh
  const id  = (obj.userData.structureId as string | undefined)
            ?? resolveId(sceneIndex, obj.name)
  if (id) {
    setSelected(selectedId === id ? null : id)
  }
}
```

No changes to `handlePointerOver`, `handlePointerOut`, the material pass,
the geometry quality pass, the grounding pass, or `ARM_PRIORITY_IDS`.

---

## 3. `src/components/viewer/HumanModel.tsx` — pulse effect on drawer hover

Add inside `GLTFScene` (keeps the base colour / `originalColor` intact —
we only modulate emissive intensity):

```ts
import { useFrame } from '@react-three/fiber'

const diagnosticPulseId = useAtlasStore((s) => (s as any).diagnosticPulseId as string | null)

useFrame(({ clock }) => {
  if (!diagnosticPulseId) return
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    if (obj.userData.structureId !== diagnosticPulseId) return
    const mat = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as THREE.MeshStandardMaterial
    if (!mat?.emissive) return
    // Pulse between 0.35 and 0.85 at ~1.4 Hz.
    mat.emissiveIntensity = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 8.8))
  })
})
```

The `applyMeshState` pass will restore `emissiveIntensity` on its next run
(selection change, hover change, visibility change), so the pulse is
fully contained to the diagnostic-hover window — no state leakage.

---

## 4. Render the drawer

Anywhere in your overlay tree (e.g. alongside `MetadataPanel`):

```tsx
import { DiagnosticDrawer } from './components/panels/DiagnosticDrawer'

const result = useAtlasStore((s) => (s as any).diagnosticResult as DiagnosticResult | null)
const setDiagnostic = useAtlasStore((s) => (s as any).setDiagnostic)

<DiagnosticDrawer result={result} onClose={() => setDiagnostic(null)} />
```

Add a UI toggle that calls `toggleDiagnosticMode()` to enter Area-to-Muscle mode.

---

## Coordinate / identity invariants (Task 3 checklist)

  * `muscle_id` keys in `painDiagnostic.json` are untouched; mesh selection
    goes through `DIAGNOSTIC_TO_MESH_IDS` in `diagnostic.ts`.
  * `renderOrder` (0 / 5) and `polygonOffset` (-1/-1, -2/-2) are owned by
    `applyMeshState`; the diagnostic code never writes them.
  * Heatmap colour stays `#CC5500` (selected) × vertex gradient; the drawer
    uses `#FF8C00` only for the probability bars.
  * All asset paths use `${import.meta.env.BASE_URL}` — `painDiagnostic.json`
    sits in `public/data/` so `vite build` copies it for GitHub Pages.
