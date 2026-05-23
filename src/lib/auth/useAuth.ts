/**
 * useAuth.ts
 *
 * Custom hooks for common auth operations.
 */

import { useState } from 'react'
import { useAuth as useAuthContext } from './authContext'

/**
 * Hook for sign up with loading and error states.
 */
export function useSignUp() {
  const { signUp } = useAuthContext()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = async (email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    const { error: authError } = await signUp(email, password)
    if (authError) {
      setError(authError.message)
    }
    setIsLoading(false)
    return !authError
  }

  return { execute, isLoading, error }
}

/**
 * Hook for sign in with loading and error states.
 */
export function useSignIn() {
  const { signIn } = useAuthContext()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = async (email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    const { error: authError } = await signIn(email, password)
    if (authError) {
      setError(authError.message)
    }
    setIsLoading(false)
    return !authError
  }

  return { execute, isLoading, error }
}

/**
 * Hook for sign out.
 */
export function useSignOut() {
  const { signOut } = useAuthContext()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await signOut()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setIsLoading(false)
  }

  return { execute, isLoading, error }
}

/**
 * Hook for password reset with loading and error states.
 */
export function useResetPassword() {
  const { resetPassword } = useAuthContext()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const execute = async (email: string) => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)
    const { error: authError } = await resetPassword(email)
    if (authError) {
      setError(authError.message)
    } else {
      setSuccess(true)
    }
    setIsLoading(false)
    return !authError
  }

  return { execute, isLoading, error, success }
}
