/**
 * authContext.tsx
 *
 * React Context for Supabase auth.
 *
 * On SIGNED_IN we hydrate the ROM-history cache from the cloud and migrate
 * any local-only records.  On SIGNED_OUT we drop the cloud user binding so
 * subsequent saves stay local until the user signs in again.
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import {
  hydrateFromSupabase,
  clearSupabaseUser,
  migrateLocalStorageToSupabase,
} from '../movement/romHistory'

export interface AuthContextType {
  user:            User | null
  session:         Session | null
  isLoading:       boolean
  isAuthenticated: boolean
  signUp:          (email: string, password: string) => Promise<{ error: Error | null }>
  signIn:          (email: string, password: string) => Promise<{ error: Error | null }>
  signOut:         () => Promise<void>
  resetPassword:   (email: string) => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null)
  const [session,   setSession]   = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Initial session restore on mount.
    (async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession()
        setSession(s)
        setUser(s?.user ?? null)
        if (s?.user) {
          // Hydrate ROM cache from cloud for the restored session.
          void hydrateFromSupabase(s.user.id)
        }
      } catch (err) {
        console.error('[Auth] initial getSession failed:', err)
      } finally {
        setIsLoading(false)
      }
    })()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      console.log('[Auth Event]', event)

      if (event === 'SIGNED_IN' && s?.user) {
        // STRICT per-user isolation: hydrateFromSupabase wipes any previous
        // cache + anon localStorage and replaces it with this user's cloud
        // rows only. No automatic local->cloud migration (would leak a prior
        // guest or signed-out user's data into the new account).
        hydrateFromSupabase(s.user.id).catch((err) => {
          console.error('[Auth] hydrate failed:', err)
        })
      } else if (event === 'SIGNED_OUT') {
        // Wipe both the user-scoped and the anon localStorage buckets so the
        // next session starts from zero.
        clearSupabaseUser()
      }
    })

    return () => subscription?.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({ email, password })
      return { error: error as Error | null }
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) }
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error as Error | null }
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) }
    }
  }

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
      setUser(null)
      setSession(null)
    } catch (err) {
      console.error('[Auth] signOut failed:', err)
      throw err
    }
  }

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}?reset=true`,
      })
      return { error: error as Error | null }
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) }
    }
  }

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    isAuthenticated: !!user,
    signUp,
    signIn,
    signOut,
    resetPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
