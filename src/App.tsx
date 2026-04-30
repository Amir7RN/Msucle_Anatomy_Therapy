import React, { useEffect } from 'react'
import { AppHeader }    from './components/layout/AppHeader'
import { LeftSidebar }  from './components/layout/LeftSidebar'
import { RightPanel }   from './components/layout/RightPanel'
import { ViewerCanvas } from './components/viewer/ViewerCanvas'
import { MovementScreen } from './components/movement/MovementScreen'
import { useAtlasStore } from './store/atlasStore'
import type { CameraPresetKey } from './lib/cameraUtils'
import { MessageCircle, Activity } from 'lucide-react'

/**
 * Root application component.
 * Layout: header (full-width) + three-column body (sidebar | canvas | panel).
 */
export default function App() {
  const darkMode = useAtlasStore((s) => s.darkMode)

  // Sync dark-mode class on <html>
  useEffect(() => {
    const root = document.documentElement
    if (darkMode) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [darkMode])

  // ── URL hash sync for selected muscle ──────────────────────────────────────
  const selectedId  = useAtlasStore((s) => s.selectedId)
  const sceneIndex  = useAtlasStore((s) => s.sceneIndex)
  const setSelected = useAtlasStore((s) => s.setSelected)

  // Write hash when selection changes
  useEffect(() => {
    if (selectedId) {
      window.history.replaceState(null, '', `#${selectedId}`)
    } else {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [selectedId])

  // Read hash on initial load — select the structure if it exists
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id && sceneIndex.metadataById.has(id)) {
      setSelected(id)
    }
  // Only run once after the index is first populated
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIndex.allIds.length])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const resetView       = useAtlasStore((s) => s.resetView)
  const showAll         = useAtlasStore((s) => s.showAll)
  const hideSelected    = useAtlasStore((s) => s.hideSelected)
  const isolateSelected = useAtlasStore((s) => s.isolateSelected)
  const exitIsolate     = useAtlasStore((s) => s.exitIsolate)
  const isolateMode     = useAtlasStore((s) => s.isolateMode)
  const toggleDarkMode  = useAtlasStore((s) => s.toggleDarkMode)
  const toggleGhostMode = useAtlasStore((s) => s.toggleGhostMode)
  const flyToPreset     = useAtlasStore((s) => s.flyToPreset)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't trigger when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case 'r': case 'R': resetView();        break
        case 'a': case 'A': showAll();          break
        case 'h': case 'H': hideSelected();     break
        case 'g': case 'G': toggleGhostMode();  break
        case 'd': case 'D': toggleDarkMode();   break
        case 'i': case 'I':
          isolateMode ? exitIsolate() : isolateSelected()
          break
        case 'Escape':
          exitIsolate()
          setSelected(null)
          break

        // Camera presets
        case '1': flyToPreset('front' as CameraPresetKey);  break
        case '2': flyToPreset('back'  as CameraPresetKey);  break
        case '3': flyToPreset('left'  as CameraPresetKey);  break
        case '4': flyToPreset('right' as CameraPresetKey);  break
        case '5': flyToPreset('top'   as CameraPresetKey);  break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    isolateMode,
    resetView, showAll, hideSelected, isolateSelected, exitIsolate,
    toggleDarkMode, toggleGhostMode, flyToPreset, setSelected,
  ])

  return (
    <div className="flex flex-col w-full h-full bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      {/* Top header */}
      <AppHeader />

      {/* Main 3-column body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <LeftSidebar />

        {/* Centre — 3D canvas */}
        <main className="flex-1 min-w-0 relative">
          <ViewerCanvas />
          <DiagnosticModeToggle />
          <TriageLauncher />
          <MovementLauncher />
        </main>

        {/* Right panel */}
        <RightPanel />
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Phone-camera Movement Assessment */}
      <MovementScreenMount />
    </div>
  )
}

// ── Triage chat launcher + mount ────────────────────────────────────────────

function TriageLauncher() {
  const triageOpen   = useAtlasStore((s) => s.triageOpen)
  const toggleTriage = useAtlasStore((s) => s.toggleTriage)
  return (
    <button
      onClick={toggleTriage}
      title="Open AI Symptom Triage"
      className={`absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-lg transition-colors ${
        triageOpen
          ? 'bg-orange-500 text-white hover:bg-orange-400'
          : 'bg-slate-800 text-slate-100 hover:bg-slate-700 ring-1 ring-orange-500/40'
      }`}
    >
      <MessageCircle size={14} />
      {triageOpen ? 'Triage open' : 'AI Triage'}
    </button>
  )
}

// ── Movement Assessment launcher + mount ────────────────────────────────────

function MovementLauncher() {
  const movementOpen   = useAtlasStore((s) => s.movementOpen)
  const toggleMovement = useAtlasStore((s) => s.toggleMovement)
  return (
    <button
      onClick={toggleMovement}
      title="Run a Movement Assessment"
      className="absolute right-4 top-14 z-20 flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 shadow-lg ring-1 ring-cyan-500/40 hover:bg-slate-700"
    >
      <Activity size={14} />
      {movementOpen ? 'Movement open' : 'Movement Screen'}
    </button>
  )
}

function MovementScreenMount() {
  const movementOpen    = useAtlasStore((s) => s.movementOpen)
  const setMovementOpen = useAtlasStore((s) => s.setMovementOpen)
  return <MovementScreen open={movementOpen} onClose={() => setMovementOpen(false)} />
}

// ── Diagnostic mode toggle (floating button over canvas) ─────────────────────

function DiagnosticModeToggle() {
  const diagnosticMode       = useAtlasStore((s) => s.diagnosticMode)
  const toggleDiagnosticMode = useAtlasStore((s) => s.toggleDiagnosticMode)
  return (
    <button
      onClick={toggleDiagnosticMode}
      className={`absolute left-4 top-4 z-10 rounded-md px-3 py-1.5 text-xs font-semibold shadow-lg transition-colors ${
        diagnosticMode
          ? 'bg-orange-500 text-white hover:bg-orange-400'
          : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
      }`}
      title="Toggle Area-to-Muscle diagnostic mode"
    >
      {diagnosticMode ? 'Diagnostic: ON — click body to analyse' : 'Diagnostic Mode'}
    </button>
  )
}

// ── Status bar ────────────────────────────────────────────────────────────────

function StatusBar() {
  const selectedId  = useAtlasStore((s) => s.selectedId)
  const hoveredId   = useAtlasStore((s) => s.hoveredId)
  const sceneIndex  = useAtlasStore((s) => s.sceneIndex)
  const isolateMode = useAtlasStore((s) => s.isolateMode)
  const hiddenCount = useAtlasStore((s) => s.hiddenIds.size)

  const hoverMeta  = hoveredId  ? sceneIndex.metadataById.get(hoveredId)  : undefined
  const selectMeta = selectedId ? sceneIndex.metadataById.get(selectedId) : undefined
  const totalCount = sceneIndex.allIds.length

  return (
    <footer className="flex items-center justify-between px-4 h-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex-shrink-0">
      <div className="flex items-center gap-4 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
        <span>{totalCount} structures loaded</span>
        {hiddenCount > 0 && <span className="text-amber-400">{hiddenCount} hidden</span>}
        {isolateMode && (
          <span className="text-primary-500">ISOLATE MODE — I or Esc to exit</span>
        )}
      </div>
      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
        {hoverMeta
          ? `Hover: ${hoverMeta.displayName}`
          : selectMeta
          ? `Selected: ${selectMeta.displayName}`
          : 'R=Reset  A=Show All  H=Hide  I=Isolate  G=Ghost  D=Dark  1-5=View'}
      </div>
    </footer>
  )
}
