import React, { useEffect, useState } from 'react'
import { AppHeader }    from './components/layout/AppHeader'
import { LeftSidebar }  from './components/layout/LeftSidebar'
import { RightPanel }   from './components/layout/RightPanel'
import { ViewerCanvas } from './components/viewer/ViewerCanvas'
import { MovementScreen } from './components/movement/MovementScreen'
import { MuscleTwinView } from './components/movement/MuscleTwinView'
import { ProfileSetup } from './components/profile/ProfileSetup'
import { useAtlasStore } from './store/atlasStore'
import type { CameraPresetKey } from './lib/cameraUtils'
import { Activity, MessageCircle, Box, Info, X, Sparkles, Scan } from 'lucide-react'
import { MoveMateLanding } from './components/landing/MoveMateLanding'
import { GymApp } from './components/gym/GymApp'
import { FullBodyAssessmentView } from './components/assessment/FullBodyAssessmentView'
import { RemoteAssessmentCall } from './components/assessment/RemoteAssessmentCall'
import { PersonalProgramView } from './components/insights/PersonalProgramView'
import { SymmetryReport } from './components/insights/SymmetryReport'

/**
 * Root application component.
 * Layout: header (full-width) + three-column body (sidebar | canvas | panel).
 */
export default function App() {
  const params = new URLSearchParams(window.location.search)
  const [showAtlas] = useState(() => params.has('atlas'))
  const [showGym]   = useState(() => params.has('gym'))
  const appUrl = `${import.meta.env.BASE_URL}?atlas=1`
  const diagnosticUrl = `${import.meta.env.BASE_URL}?atlas=1&diagnostic=1`
  const gymUrl = `${import.meta.env.BASE_URL}?gym=1`

  // MoveMate Train — the separate gym-training platform.
  if (showGym) return <GymApp />

  if (!showAtlas) {
    return <MoveMateLanding atlasUrl={appUrl} diagnosticUrl={diagnosticUrl} gymUrl={gymUrl} />
  }

  return <AtlasApp />
}

function AtlasApp() {
  const darkMode = useAtlasStore((s) => s.darkMode)

  // Sync dark-mode class on <html>
  useEffect(() => {
    const root = document.documentElement
    if (darkMode) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [darkMode])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('diagnostic')) {
      const state = useAtlasStore.getState()
      if (!state.diagnosticMode) state.toggleDiagnosticMode()
      state.setTriageOpen(true)
    }
  }, [])

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

  // ── Mobile panel state ──────────────────────────────────────────────────────
  // 'none' = canvas only, 'chat' = AI Diagnosis overlay, 'details' = muscle details
  const [mobilePanel, setMobilePanel] = useState<'none' | 'chat' | 'details'>('none')
  // Modal state for mobile bottom-nav tabs - separate from the AppHeader's
  // own copies so the bottom-nav buttons work on mobile where the header
  // buttons are off-screen.
  const [mobileBatteryOpen, setMobileBatteryOpen] = useState(false)
  const [mobileProgramOpen, setMobileProgramOpen] = useState(false)
  const [mobileSymOpen,     setMobileSymOpen]     = useState(false)

  // If the URL carries a ?call=<roomId>, this device is the CLIENT joining a
  // practitioner's remote assessment — open the call straight away.
  const [joinRoom] = useState(() => new URLSearchParams(window.location.search).get('call'))
  const [clientCallOpen, setClientCallOpen] = useState(() => !!joinRoom)

  // Stop TTS when the chat panel is closed on mobile
  useEffect(() => {
    if (mobilePanel !== 'chat') {
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    }
  }, [mobilePanel])

  return (
    <div className="flex flex-col w-full h-full bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      {/* Top header */}
      <AppHeader />

      {/* Main body */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">

        {/* Left sidebar wrapper. h-full + min-h-0 propagate the height anchor down to the inner structures clamp. */}
        <div className={[
          'flex-shrink-0 flex flex-col h-full min-h-0',
          // Desktop: always visible as a side column
          // Mobile: hidden by default; shown as absolute overlay when chat panel is open
          mobilePanel === 'chat'
            ? 'absolute inset-0 z-40 md:relative md:inset-auto md:z-auto'
            : 'hidden md:flex',
        ].join(' ')}>
          {/* Mobile close button (only shown inside the overlay) */}
          <div className="flex md:hidden items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 flex-shrink-0">
            <span className="text-xs font-semibold text-cyan-400">AI Diagnosis</span>
            <button onClick={() => setMobilePanel('none')} className="text-slate-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <LeftSidebar />
        </div>

        {/* Centre — 3D canvas (always in DOM, always behind overlays) */}
        <main className="flex-1 min-w-0 relative">
          <ViewerCanvas />
          <DiagnosticModeToggle />
          {/* Feature launching moved to the LeftSidebar FeatureRail — the
              canvas stays clean for the model itself. Mobile keeps the
              bottom-nav tabs. */}
        </main>

        {/* Right panel — always shown on desktop; shown as full overlay on mobile when mobilePanel='details' */}
        <div className={[
          'flex-shrink-0 flex flex-col',
          mobilePanel === 'details'
            ? 'absolute inset-0 z-40 md:relative md:inset-auto md:z-auto'
            : 'hidden md:flex',
        ].join(' ')}>
          {/* Mobile close button */}
          <div className="flex md:hidden items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-700 flex-shrink-0">
            <span className="text-xs font-semibold text-slate-300">Structure Details</span>
            <button onClick={() => setMobilePanel('none')} className="text-slate-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <RightPanel />
        </div>
      </div>

      {/* Status bar — desktop only (too small for mobile) */}
      <div className="hidden md:block">
        <StatusBar />
      </div>

      {/* ── Mobile bottom navigation bar ─────────────────────────────────────── */}
      <nav className="flex md:hidden items-stretch border-t border-slate-700 bg-slate-900 flex-shrink-0">
        <MobileNavTab
          icon={<MessageCircle size={18} />}
          label="AI Chat"
          active={mobilePanel === 'chat'}
          onClick={() => setMobilePanel(mobilePanel === 'chat' ? 'none' : 'chat')}
        />
        <MobileNavTab
          icon={<Box size={18} />}
          label="3D"
          active={mobilePanel === 'none'}
          onClick={() => setMobilePanel('none')}
        />
        <MobileNavTab
          icon={<Activity size={18} />}
          label="Assess"
          active={false}
          onClick={() => { setMobilePanel('none'); setMobileBatteryOpen(true) }}
        />
        <MobileNavTab
          icon={<Sparkles size={18} />}
          label="Program"
          active={false}
          onClick={() => { setMobilePanel('none'); setMobileProgramOpen(true) }}
        />
        <MobileNavTab
          icon={<Scan size={18} />}
          label="Symm"
          active={false}
          onClick={() => { setMobilePanel('none'); setMobileSymOpen(true) }}
        />
        <MobileNavTab
          icon={<Info size={18} />}
          label="Info"
          active={mobilePanel === 'details'}
          onClick={() => setMobilePanel(mobilePanel === 'details' ? 'none' : 'details')}
        />
      </nav>

      {/* Modals reachable from the mobile bottom-nav tabs above. Mounted on
          the AtlasApp directly so they overlay even on screens where the
          AppHeader's own copies are hidden. */}
      <FullBodyAssessmentView open={mobileBatteryOpen} onClose={() => setMobileBatteryOpen(false)} />
      <PersonalProgramView open={mobileProgramOpen} onClose={() => setMobileProgramOpen(false)} />
      <SymmetryReport open={mobileSymOpen} onClose={() => setMobileSymOpen(false)} />

      {/* Client side of a practitioner-guided remote assessment (joined via link) */}
      {joinRoom && (
        <RemoteAssessmentCall
          open={clientCallOpen}
          role="client"
          roomId={joinRoom}
          onClose={() => setClientCallOpen(false)}
        />
      )}

      {/* Phone-camera Movement Assessment */}
      <MovementScreenMount />

      {/* Live 3-D Muscle-Activation Twin */}
      <MuscleTwinMount />

      {/* Personal profile + body scan (personalization hub) */}
      <ProfileMount />
    </div>
  )
}

// ── Mobile nav tab ────────────────────────────────────────────────────────────
function MobileNavTab({
  icon, label, active, onClick,
}: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
        active
          ? 'text-cyan-400 bg-slate-800'
          : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {icon}
      {label}
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
      className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 shadow-lg ring-1 ring-cyan-500/40 hover:bg-slate-700"
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

// ── Live Muscle Twin launcher + mount ────────────────────────────────────────

function MuscleTwinLauncher() {
  const twinOpen   = useAtlasStore((s) => s.twinOpen)
  const toggleTwin = useAtlasStore((s) => s.toggleTwin)
  return (
    <button
      onClick={toggleTwin}
      title="Open the Live Muscle Twin"
      className="absolute right-4 top-16 z-20 flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 shadow-lg ring-1 ring-cyan-500/40 hover:bg-slate-700"
    >
      <Sparkles size={14} />
      {twinOpen ? 'Twin open' : 'Muscle Twin'}
    </button>
  )
}

function MuscleTwinMount() {
  const twinOpen    = useAtlasStore((s) => s.twinOpen)
  const setTwinOpen = useAtlasStore((s) => s.setTwinOpen)
  return <MuscleTwinView open={twinOpen} onClose={() => setTwinOpen(false)} />
}

// ── Personal profile + body-scan mount ───────────────────────────────────────

function ProfileMount() {
  const profileOpen    = useAtlasStore((s) => s.profileOpen)
  const setProfileOpen = useAtlasStore((s) => s.setProfileOpen)
  return <ProfileSetup open={profileOpen} onClose={() => setProfileOpen(false)} />
}

// ── Diagnostic mode toggle (floating button over canvas) ─────────────────────

function DiagnosticModeToggle() {
  const diagnosticMode       = useAtlasStore((s) => s.diagnosticMode)
  const toggleDiagnosticMode = useAtlasStore((s) => s.toggleDiagnosticMode)
  const modalOpenCount       = useAtlasStore((s) => s.modalOpenCount)
  if (modalOpenCount > 0) return null
  return (
    <button
      onClick={toggleDiagnosticMode}
      className={[
        // Desktop: top-left  |  Mobile: bottom-left above bottom nav
        'absolute z-10 rounded-md px-3 py-1.5 text-xs font-semibold shadow-lg transition-colors',
        'left-3 top-3 md:left-4 md:top-4',
        diagnosticMode
          ? 'bg-orange-500 text-white hover:bg-orange-400'
          : 'bg-slate-800 text-slate-100 hover:bg-slate-700',
      ].join(' ')}
      title="Toggle Area-to-Muscle diagnostic mode"
    >
      {diagnosticMode ? '⬤ Diagnostic ON' : 'Diagnostic Mode'}
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
