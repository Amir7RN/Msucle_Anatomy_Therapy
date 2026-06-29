import React, { useEffect, useState } from 'react'
import { Activity, LogOut, LogIn, Sparkles, Scan, Crosshair, Home } from 'lucide-react'
import { ActionButtons } from '../controls/ActionButtons'
import { CameraPresetBar } from '../controls/CameraPresetBar'
import { useAtlasStore } from '../../store/atlasStore'
import { useAuth } from '../../lib/auth/authContext'
import { AuthModal } from '../auth/AuthModal'
import { SymmetryReport } from '../insights/SymmetryReport'
import { PersonalProgramView } from '../insights/PersonalProgramView'
import { FullBodyAssessmentView } from '../assessment/FullBodyAssessmentView'

export function AppHeader() {
  const modelStatus = useAtlasStore((s) => s.modelStatus)
  const { user, signOut } = useAuth()
  const [showPresets, setShowPresets] = useState(false)
  const [authOpen,    setAuthOpen]    = useState(false)
  const [signingOut,  setSigningOut]  = useState(false)
  const [symOpen,     setSymOpen]     = useState(false)
  const [progOpen,    setProgOpen]    = useState(false)
  const [batteryOpen, setBatteryOpen] = useState(false)

  // Open modals when the on-canvas FeatureLauncher (or other UI) fires
  // a request via the atlas store.
  const featureModalToOpen    = useAtlasStore((s) => s.featureModalToOpen)
  const setFeatureModalToOpen = useAtlasStore((s) => s.setFeatureModalToOpen)
  useEffect(() => {
    if (!featureModalToOpen) return
    if (featureModalToOpen === 'battery')  setBatteryOpen(true)
    if (featureModalToOpen === 'program')  setProgOpen(true)
    if (featureModalToOpen === 'symmetry') setSymOpen(true)
    setFeatureModalToOpen(null)
  }, [featureModalToOpen, setFeatureModalToOpen])

  async function handleSignOut() {
    setSigningOut(true)
    try { await signOut() } finally { setSigningOut(false) }
  }

  return (
    <header className="flex flex-col border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0 z-20">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2.5 min-w-[180px]">
          <a
            href={import.meta.env.BASE_URL}
            title="Back to home"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <Home size={16} />
          </a>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-500">
            <Activity size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-none">
              Human Muscle Atlas
            </h1>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-none mt-0.5">
              Interactive Anatomy Viewer
            </p>
          </div>
        </div>

        <ActionButtons />

        <div className="hidden md:flex items-center gap-3 min-w-[280px] justify-end">
          <button
            onClick={() => setShowPresets((v) => !v)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${
              showPresets
                ? 'border-primary-400 text-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-primary-400 hover:text-primary-500'
            }`}
            title="Toggle camera view presets"
          >
            📷 Views
          </button>

          {/* The Assessment / Symmetry / My Program buttons used to live
              here. They have been moved to the on-canvas FeatureLauncher
              (top-right of the 3D viewport) where they read as primary
              features rather than tiny header chips. */}

          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                modelStatus === 'loaded'
                  ? 'bg-emerald-400'
                  : modelStatus === 'placeholder'
                  ? 'bg-amber-400'
                  : modelStatus === 'error'
                  ? 'bg-red-400'
                  : 'bg-slate-300 animate-pulse'
              }`}
            />
            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              {modelStatus === 'loaded'
                ? 'GLB loaded'
                : modelStatus === 'placeholder'
                ? 'Mock mode'
                : modelStatus === 'error'
                ? 'Load error'
                : 'Loading…'}
            </span>
          </div>

          {user ? (
            <div className="flex items-center gap-2 pl-3 border-l border-slate-200 dark:border-slate-700">
              <span
                className="text-[10px] text-slate-500 dark:text-slate-400 max-w-[140px] truncate"
                title={user.email ?? ''}
              >
                {user.email}
              </span>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded border border-cyan-500/50 text-cyan-500 hover:bg-cyan-500/10 transition-colors"
              title="Sign in to sync your assessment history"
            >
              <LogIn size={12} />
              Sign in
            </button>
          )}
        </div>
      </div>

      {showPresets && (
        <div className="border-t border-slate-100 dark:border-slate-700/60 px-4 py-2">
          <CameraPresetBar />
        </div>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <SymmetryReport       open={symOpen}  onClose={() => setSymOpen(false)} />
      <PersonalProgramView open={progOpen} onClose={() => setProgOpen(false)} />
      <FullBodyAssessmentView open={batteryOpen} onClose={() => setBatteryOpen(false)} />
    </header>
  )
}
