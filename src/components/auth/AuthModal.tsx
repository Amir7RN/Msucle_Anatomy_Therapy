/**
 * AuthModal.tsx
 *
 * Email + password sign-in / sign-up modal. Renders only when `open` is true.
 * Uses the AuthContext to call Supabase. After a successful sign-in, the
 * AuthContext's auth-state subscription fires and any subscribed component
 * (e.g. romHistory readers) re-renders against the new session.
 *
 * Continue-as-guest: clicking the X (or the "Continue without account" link)
 * dismisses the modal. The app keeps working against localStorage in guest
 * mode — this is intentional so the public demo still functions.
 */

import React, { useState } from 'react'
import { X, Mail, Lock, LogIn, UserPlus, AlertCircle, CheckCircle } from 'lucide-react'
import { useAuth } from '../../lib/auth/authContext'
import { supabaseConfigured } from '../../lib/supabase'

interface Props {
  open: boolean
  onClose: () => void
  /** Optional pre-selected tab */
  initialMode?: 'signin' | 'signup'
}

export function AuthModal({ open, onClose, initialMode = 'signin' }: Props) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (!open) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError('Email and password required.')
      return
    }
    setBusy(true)
    setError(null)
    setInfo(null)
    const fn = mode === 'signin' ? signIn : signUp
    const { error: err } = await fn(email.trim(), password)
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    if (mode === 'signup') {
      setInfo('Account created. Check your email if confirmation is required, then sign in.')
      setMode('signin')
      setPassword('')
      return
    }
    // sign-in success — close the modal; AuthProvider state takes over.
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {mode === 'signin'
              ? <LogIn size={16} className="text-cyan-400" />
              : <UserPlus size={16} className="text-orange-400" />}
            <h2 className="text-sm font-semibold text-slate-100">
              {mode === 'signin' ? 'Sign in to Zevahealth' : 'Create an account'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Continue without account"
          >
            <X size={16} />
          </button>
        </div>

        {!supabaseConfigured && (
          <div className="mb-3 flex items-start gap-2 rounded bg-amber-900/30 border border-amber-700/40 p-2 text-[11px] text-amber-200">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, then restart the dev server.
          </div>
        )}

        <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
          {mode === 'signin'
            ? 'Sign in to sync your assessment history and exercise progress across devices.'
            : 'Create an account to save your assessment history. Your data stays private to you.'}
        </p>

        <form onSubmit={submit} className="space-y-2.5">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Email</span>
            <div className="mt-1 flex items-center gap-2 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 focus-within:border-cyan-500">
              <Mail size={12} className="text-slate-500" />
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 bg-transparent text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Password</span>
            <div className="mt-1 flex items-center gap-2 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 focus-within:border-cyan-500">
              <Lock size={12} className="text-slate-500" />
              <input
                type="password"
                value={password}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min 6 characters' : '••••••••'}
                className="flex-1 bg-transparent text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none"
              />
            </div>
          </label>

          {error && (
            <div className="flex items-start gap-1.5 rounded bg-red-900/30 border border-red-700/40 p-2 text-[11px] text-red-300">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {info && (
            <div className="flex items-start gap-1.5 rounded bg-emerald-900/30 border border-emerald-700/40 p-2 text-[11px] text-emerald-300">
              <CheckCircle size={12} className="mt-0.5 flex-shrink-0" />
              <span>{info}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !supabaseConfigured}
            className={`w-full rounded py-2 text-xs font-semibold transition-colors ${
              mode === 'signin'
                ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                : 'bg-orange-600 hover:bg-orange-500 text-white'
            } disabled:bg-slate-700 disabled:text-slate-500`}
          >
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="mt-3 flex items-center justify-between text-[11px]">
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null) }}
            className="text-cyan-400 hover:text-cyan-300"
          >
            {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300"
          >
            Continue without account
          </button>
        </div>
      </div>
    </div>
  )
}
