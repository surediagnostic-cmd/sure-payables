import { useState } from 'react'

export default function LoginPage({ onSignIn }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) { setError('Please enter email and password.'); return }
    setLoading(true); setError('')
    const err = await onSignIn(email, password, remember)
    if (err) setError(err.message || 'Invalid email or password.')
    setLoading(false)
  }

  return (
    <div className="auth-screen">
      <div className="auth-box">
        <div className="auth-logo">
          <div className="auth-logo-mark">S</div>
          <div>
            <div className="auth-title">Sure Payables</div>
            <div className="auth-sub">Sure Medical Diagnostics</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="auth-err">{error}</div>}

          <div className="auth-field">
            <label className="auth-label">Email Address</label>
            <input className="auth-input" type="email" placeholder="you@surediagnostics.com"
              value={email} onChange={e=>setEmail(e.target.value)}
              autoComplete="email" autoFocus />
          </div>

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <input className="auth-input" type="password" placeholder="••••••••"
              value={password} onChange={e=>setPassword(e.target.value)}
              autoComplete="current-password" />
          </div>

          <label className="auth-remember">
            <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} />
            Remember me on this device
          </label>

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

        <div style={{marginTop:20,textAlign:'center',fontSize:11,color:'var(--text-4)'}}>
          Contact the system administrator to reset your password.
        </div>
      </div>
    </div>
  )
}
