/**
 * LoginPage.tsx
 *
 * Full-screen authentication interface with login and signup tabs.
 * Users can toggle between login and signup modes.
 */

import React, { useState } from 'react'
import { Mail, Lock, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { useSignIn, useSignUp, useResetPassword } from '../../lib/auth/useAuth'

type Tab = 'login' | 'signup' | 'reset'

export function LoginPage() {
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const { execute: signIn, isLoading: signInLoading, error: signInError } = useSignIn()
  const { execute: signUp, isLoading: signUpLoading, error: signUpError } = useSignUp()
  const { execute: resetPassword, isLoading: resetLoading, error: resetError, success: resetSuccess } = useResetPassword()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    const success = await signIn(email, password)
    if (success) {
      setEmail('')
      setPassword('')
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || !confirmPassword) return
    if (password !== confirmPassword) return

    const success = await signUp(email, password)
    if (success) {
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setTab('login')
    }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    await resetPassword(email)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background accent */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-md">
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Zeva Health</h1>
            <p className="text-slate-400">Pain relief exercises tailored for you</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-8 p-1 bg-slate-700/30 rounded-lg">
            <button
              onClick={() => setTab('login')}
              className={`flex-1 py-2 px-4 rounded transition-all font-medium text-sm ${
                tab === 'login'
                  ? 'bg-cyan-500 text-white shadow-lg'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setTab('signup')}
              className={`flex-1 py-2 px-4 rounded transition-all font-medium text-sm ${
                tab === 'signup'
                  ? 'bg-cyan-500 text-white shadow-lg'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Login Tab */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Error */}
              {signInError && (
                <div className="flex gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  {signInError}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={signInLoading || !email || !password}
                className="w-full py-2 px-4 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {signInLoading ? <Loader2 size={18} className="animate-spin" /> : null}
                {signInLoading ? 'Signing in...' : 'Sign In'}
              </button>

              {/* Forgot password */}
              <button
                type="button"
                onClick={() => setTab('reset')}
                className="w-full text-sm text-slate-400 hover:text-cyan-400 transition-colors"
              >
                Forgot password?
              </button>
            </form>
          )}

          {/* Signup Tab */}
          {tab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className={`w-full pl-10 pr-4 py-2 bg-slate-700/50 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-1 ${
                      confirmPassword && password !== confirmPassword
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                        : 'border-slate-600 focus:border-cyan-500 focus:ring-cyan-500'
                    }`}
                  />
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-red-400 text-xs mt-1">Passwords don't match</p>
                )}
              </div>

              {/* Error */}
              {signUpError && (
                <div className="flex gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  {signUpError}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={signUpLoading || !email || !password || !confirmPassword || password !== confirmPassword}
                className="w-full py-2 px-4 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {signUpLoading ? <Loader2 size={18} className="animate-spin" /> : null}
                {signUpLoading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}

          {/* Reset Tab */}
          {tab === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <p className="text-slate-300 text-sm mb-4">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Success */}
              {resetSuccess && (
                <div className="flex gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
                  <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                  Check your email for the reset link!
                </div>
              )}

              {/* Error */}
              {resetError && (
                <div className="flex gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  {resetError}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={resetLoading || !email}
                className="w-full py-2 px-4 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {resetLoading ? <Loader2 size={18} className="animate-spin" /> : null}
                {resetLoading ? 'Sending...' : 'Send Reset Link'}
              </button>

              {/* Back to login */}
              <button
                type="button"
                onClick={() => setTab('login')}
                className="w-full text-sm text-slate-400 hover:text-cyan-400 transition-colors"
              >
                Back to login
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-slate-700/50 text-center text-xs text-slate-500">
            <p>Your signed-in cloud records use per-user access controls. Some preferences and health history are also stored in this browser.</p>
            <p className="mt-2">
              <a href={`${import.meta.env.BASE_URL}?legal=privacy`} className="text-cyan-400 hover:underline">Privacy</a>
              <span className="mx-2">·</span>
              <a href={`${import.meta.env.BASE_URL}?legal=terms`} className="text-cyan-400 hover:underline">Terms</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
