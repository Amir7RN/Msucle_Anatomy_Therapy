import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ZevahealthHome } from './ZevahealthHome'
import { GymApp } from './components/gym/GymApp'
import { useAtlasStore } from './store/atlasStore'
import { AuthProvider, useAuth } from './lib/auth/authContext'
import { LoginPage } from './components/auth/LoginPage'
import { supabaseConfigured } from './lib/supabase'
import { LegalPage } from './components/legal/LegalPage'
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

/**
 * Catches render-time crashes so a single failing component shows a readable
 * message (and logs the error) instead of a blank white page.
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Zevahealth] render error:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f8fc', padding: 24, fontFamily: 'Inter, Arial, sans-serif' }}>
          <div style={{ maxWidth: 520, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Something went wrong loading this page</h1>
            <p style={{ fontSize: 14, color: '#475569', margin: '0 0 16px' }}>
              Try reloading. If it keeps happening, the details below help us fix it.
            </p>
            <pre style={{ textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, color: '#b91c1c', background: '#fff', border: '1px solid #e6eaf1', borderRadius: 8, padding: 12, margin: '0 0 16px' }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => location.reload()} style={{ padding: '10px 20px', borderRadius: 9999, border: 'none', background: '#f97316', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Reload</button>
              <a href={import.meta.env.BASE_URL} style={{ padding: '10px 20px', borderRadius: 9999, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', fontWeight: 600, textDecoration: 'none' }}>Home</a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function Root() {
  const params = new URLSearchParams(window.location.search)
  const showAtlas = params.has('atlas')
  const showGym = params.has('gym')
  const legal = params.get('legal')
  const appUrl = `${import.meta.env.BASE_URL}?atlas=1`
  const diagnosticUrl = `${import.meta.env.BASE_URL}?atlas=1&diagnostic=1`
  const gymUrl = `${import.meta.env.BASE_URL}?gym=1`

  if (legal === 'privacy' || legal === 'terms') return <LegalPage kind={legal} />

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
    <ErrorBoundary>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
