import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// ─────────────────────────────────────────────────────────────────────────────
// useAuth — session + role (guard | manager). Call once in App, above any early return.
// ─────────────────────────────────────────────────────────────────────────────
const ROLE_KEY = 'alumenda_role_v1'
export function useAuth() {
  const [session, setSession] = useState(null)
  const [ready, setReady]     = useState(false)
  const [role, setRole]       = useState(() => { try { return localStorage.getItem(ROLE_KEY) || 'guard' } catch { return 'guard' } })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
      .catch(() => setReady(true))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const uid = session?.user?.id
  useEffect(() => {
    if (!uid) return
    supabase.from('profiles').select('role').eq('id', uid).maybeSingle()
      .then(({ data }) => { if (data?.role) { setRole(data.role); try { localStorage.setItem(ROLE_KEY, data.role) } catch {} } })
      .catch(() => {})            // offline: keep the cached role
  }, [uid])

  const signOut = () => { try { localStorage.removeItem(ROLE_KEY) } catch {}; return supabase.auth.signOut() }
  return { session, ready, user: session?.user || null, role, signOut }
}

// ─────────────────────────────────────────────────────────────────────────────
// LoginScreen — email + password (accounts are created by the administrator)
// ─────────────────────────────────────────────────────────────────────────────
export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [pwd,   setPwd]   = useState('')
  const [err,   setErr]   = useState('')
  const [busy,  setBusy]  = useState(false)

  const submit = async () => {
    if (busy || !email || !pwd) return
    setBusy(true); setErr('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pwd })
      if (error) setErr(/invalid/i.test(error.message) ? 'Wrong email or password' : error.message)
    } catch { setErr('No connection. Check your signal and try again.') }
    setBusy(false)
  }
  const field = { width:'100%', boxSizing:'border-box', height:42, padding:'0 12px', borderRadius:8, fontSize:14,
    background:'rgba(255,255,255,0.06)', border:`1px solid ${err ? '#e63946' : 'rgba(255,255,255,0.16)'}`,
    color:'#dce8f5', outline:'none', fontFamily:'inherit', colorScheme:'dark' }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:18, background:'#060e1c', padding:20 }}>
      <div style={{ width:96, height:96, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid rgba(33,118,255,0.35)', background:'rgba(255,255,255,0.03)', boxShadow:'0 0 30px rgba(33,118,255,0.25)' }}>
        <img src="https://hamza-nkhumbwa.github.io/galanwra/wwjdlogo.png" alt="WWJD" onError={e => { e.target.style.display = 'none' }} style={{ width:66, height:66, objectFit:'contain' }} />
      </div>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:16, fontWeight:600, color:'#fff' }}>SpatialData <span style={{ color:'#2176ff' }}>GIS</span></div>
        <div style={{ fontSize:10, color:'rgba(91,164,255,0.6)', letterSpacing:3, marginTop:4 }}>ALUMENDA INTELLIGENCE</div>
      </div>
      <div style={{ width:'100%', maxWidth:300, display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', letterSpacing:1.5, textAlign:'center' }}>AUTHORISED STAFF ONLY</div>
        <input style={field} type="email" autoComplete="username" placeholder="Email" value={email} autoFocus
          onChange={e => { setEmail(e.target.value); setErr('') }} onKeyDown={e => e.key === 'Enter' && submit()} />
        <input style={field} type="password" autoComplete="current-password" placeholder="Password" value={pwd}
          onChange={e => { setPwd(e.target.value); setErr('') }} onKeyDown={e => e.key === 'Enter' && submit()} />
        {err && <div style={{ fontSize:11, color:'#e63946', textAlign:'center' }}>{err}</div>}
        <button disabled={busy} onClick={submit}
          style={{ height:42, borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:700, color:'#fff', fontFamily:'inherit',
                   background:'linear-gradient(135deg,#2176ff,#1a5fc8)', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', textAlign:'center' }}>Forgotten your password? Ask your manager to reset it.</div>
      </div>
      <div style={{ fontSize:9, color:'rgba(255,255,255,0.18)', letterSpacing:1 }}>Hamza.N-Worldwide Joint Discoverers @2026 · Illovo Sugar Ltd</div>
    </div>
  )
}
