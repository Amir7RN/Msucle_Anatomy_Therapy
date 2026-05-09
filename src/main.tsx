import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { MoveMateLanding } from './components/landing/MoveMateLanding'
import { useAtlasStore } from './store/atlasStore'
import './index.css'

function Root() {
  const params = new URLSearchParams(window.location.search)
  const showAtlas = params.has('atlas')
  const appUrl = `${import.meta.env.BASE_URL}?atlas=1`
  const diagnosticUrl = `${import.meta.env.BASE_URL}?atlas=1&diagnostic=1`

  if (!showAtlas) {
    return <MoveMateLanding atlasUrl={appUrl} diagnosticUrl={diagnosticUrl} />
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
    <Root />
  </React.StrictMode>,
)
