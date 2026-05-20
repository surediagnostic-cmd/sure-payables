import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [role,    setRole]    = useState(null)       // 'md' | 'accountant'

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
    })
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
      else setRole(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchRole(userId) {
    const { data } = await supabase
      .from('user_roles')
      .select('role, full_name')
      .eq('id', userId)
      .single()
    if (data) setRole(data.role)
  }

  async function signIn(email, password, remember) {
    // Set session persistence based on remember me
    await supabase.auth.setSession  // persistence is set at client level
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setRole(null)
  }

  const isMD = role === 'md'
  const isAccountant = role === 'accountant'
  const canDelete = isMD
  const canManageLoans = isMD
  const canManageVendors = true  // both roles

  return (
    <AuthCtx.Provider value={{
      session, role, isMD, isAccountant,
      canDelete, canManageLoans, canManageVendors,
      signIn, signOut,
      loading: session === undefined,
      user: session?.user,
      fullName: session?.user?.user_metadata?.full_name || role?.toUpperCase() || '',
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
