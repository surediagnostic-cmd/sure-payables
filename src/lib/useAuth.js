import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase.js'

export function useAuth() {
  const [user,    setUser]    = useState(null)
  const [role,    setRole]    = useState(null)   // 'admin' | 'accountant'
  const [loading, setLoading] = useState(true)

  async function resolveRole(session) {
    if (!session) { setUser(null); setRole(null); setLoading(false); return }
    const u = session.user
    // Role is stored in user_metadata.role — set when creating users in Supabase Auth
    const r = u.user_metadata?.role || 'accountant'
    setUser(u); setRole(r); setLoading(false)
  }

  useEffect(() => {
    // Get current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => resolveRole(session))
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveRole(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email, password, remember) => {
    const { error } = await supabase.auth.signInWithPassword({
      email, password,
      options: { persistSession: remember }
    })
    return error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const isAdmin = role === 'admin'

  return { user, role, isAdmin, loading, signIn, signOut }
}
