import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ZevahealthHome } from './ZevahealthHome'
import { GymApp } from './components/gym/GymApp'
import { useAtlasStore } from './store/atlasStore'
import { AuthProvider } from './lib/auth/authContext'
import './index.css'

function Root() {
  const params = new URLSearchParams(window.location.search)
  const showAtlas = params.has('atlas')
  const showGym = params.has('gym')
  const appUrl = `${import.meta.env.BASE_URL}?atlas=1`
  const diagnosticUrl = `${import.meta.env.BASE_URL}?atlas=1&diagnostic=1`
  const gymUrl = `${import.meta.env.BASE_URL}?gym=1`

  // MoveMate Train — the separate gym-training platform (parallel to the pain app).
  if (showGym) return <GymApp />

  if (!showAtlas) {
    return <ZevahealthHome atlasUrl={appUrl} diagnosticUrl={diagnosticUrl} gymUrl={gymUrl} />
  }

  return <AtlasEntry diagnosticRequested={params.has('diagnostic')} />
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
