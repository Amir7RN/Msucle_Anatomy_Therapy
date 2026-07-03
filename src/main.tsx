import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ZevahealthHome } from './ZevahealthHome'
import { GymApp } from './components/gym/GymApp'
import { useAtlasStore } from './store/atlasStore'
import { AuthProvider, useAuth } from './lib/auth/authContext'
import { LoginPage } from './components/auth/LoginPage'
import { supabaseConfigured } from './lib/supabase'
import './index.css'

/**
 * Gate for the model pages: visitors must sign in (or sign up) before they can
 * open the atlas / diagnostic / gym experience. The public landing page stays
 * open. If Supabase auth isn't configured (e.g. local dev with no env), we fall
 * through so the app is still usable.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center bg-[#f6f8fc] text-sm text-slate-400">
        Loading…
      </div>
    )
  }

  if (!user && supabaseConfigured) {
    return (
      <>
        <a
          href={import.meta.env.BASE_URL}
          className="fixed left-4 top-4 z-[200] rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow backdrop-blur transition hover:border-cyan-300 hover:text-cyan-700"
        >
          ← Home
        </a>
        <LoginPage />
      </>
    )
  }

  return <>{children}</>
}

function Root() {
  const params = new URLSearchParams(window.location.search)
  const showAtlas = params.has('atlas')
  const showGym = params.has('gym')
  const appUrl = `${import.meta.env.BASE_URL}?atlas=1`
  const diagnosticUrl = `${import.meta.env.BASE_URL}?atlas=1&diagnostic=1`
  const gymUrl = `${import.meta.env.BASE_URL}?gym=1`

  // MoveMate Train — the separate gym-training platform (parallel to the pain app).
  // Model pages require sign-in; the landing page stays public.
  if (showGym) return <RequireAuth><GymApp /></RequireAuth>

  if (!showAtlas) {
    return <ZevahealthHome atlasUrl={appUrl} diagnosticUrl={diagnosticUrl} gymUrl={gymUrl} />
  }

  return (
    <RequireAuth>
      <AtlasEntry diagnosticRequested={params.has('diagnostic')} />
    </RequireAuth>
  )
}

function AtlasEntry({ diagnosticRequested }: { diagnosticRequested: boolean }) {
  useEffect(() => {
    if (!diagnosticRequested) return

    const state = useAtlasStore.getState()
    if (!state.diagnosticMode) state.toggleDiagnosticMode()
    state.setTriageOpen(true)
  }, [diagnosticRequested])

  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>,
)
