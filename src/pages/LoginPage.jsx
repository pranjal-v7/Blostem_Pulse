import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { ArrowRight, Loader2, Radio, Shield, Mail, TrendingUp, Eye, EyeOff } from 'lucide-react'

function AnimatedCounter({ target, duration = 1200 }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    let start = 0
    const ts = performance.now()
    const step = (now) => {
      const progress = Math.min((now - ts) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(target * ease))
      if (progress < 1) requestAnimationFrame(step)
    }
    const timer = setTimeout(() => requestAnimationFrame(step), 400)
    return () => clearTimeout(timer)
  }, [target, duration])
  return <span>{count}</span>
}

function BlostemLogoBig() {
  return (
    <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="#0A7A60" />
          <stop offset="100%" stopColor="#00D4A4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#logo-g)" />
      <path d="M10 10h5l3 4-3 4h-5l-3-4 3-4z" fill="rgba(255,255,255,0.9)" />
      <path d="M17 14h5l3 4-3 4h-5l-3-4 3-4z" fill="rgba(255,255,255,0.6)" />
    </svg>
  )
}

const FEATURES = [
  { icon: Radio, text: 'Real-time Signals' },
  { icon: TrendingUp, text: 'AI Scoring' },
  { icon: Shield, text: 'Compliance Check' },
  { icon: Mail, text: 'Auto Outreach' },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  // Sign-up extra fields
  const [fullName, setFullName] = useState('')
  const [age, setAge] = useState('')
  const [department, setDepartment] = useState('')
  const { signIn, signUp } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + '/app/radar',
            data: { full_name: fullName, age: age ? parseInt(age) : null, department }
          }
        })
        if (error) throw error

        if (data?.user?.id) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            display_name: fullName,
            age: age ? parseInt(age) : null,
            department,
          })
        }

        if (data?.user && !data?.session) {
          addToast('✉️ Confirmation email sent! Please check your inbox and verify your email to log in.', 'success', 8000)
          setIsSignUp(false)
        } else {
          addToast('Account created! Welcome to BlostemPulse.', 'success')
          navigate('/app/radar')
        }
      } else {
        const { error } = await signIn(email, password)
        if (error) throw error
        addToast('Signed in!', 'success')
        navigate('/app/radar')
      }
    } catch (err) {
      addToast(err.message, 'error')
    }
    setLoading(false)
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (!forgotEmail) {
      addToast('Please enter your email address', 'warning')
      return
    }
    setForgotLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: window.location.origin + '/reset-password',
      })
      if (error) throw error
      setForgotSent(true)
      addToast('Password reset email sent! Check your inbox.', 'success')
    } catch (err) {
      addToast(err.message, 'error')
    }
    setForgotLoading(false)
  }

  const eyeBtnStyle = {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer',
    padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'color 0.2s',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', position: 'relative', overflow: 'hidden' }}>
      {/* Background */}
      <div className="bg-canvas">
        <div className="beam beam-1" />
        <div className="beam beam-2" />
        <div className="beam beam-3" />
      </div>
      <div className="grain-overlay" />

      {/* Left half — Hero content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px', position: 'relative', zIndex: 1 }}>
        <div className="dot-grid" />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <BlostemLogoBig />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--text1)', letterSpacing: '-0.02em' }}>Blostem</span>
            <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--teal)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>PULSE</span>
          </div>
        </div>

        {/* Hero headline */}
        <h1 style={{ fontSize: 48, fontWeight: 800, color: 'var(--text1)', lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20, maxWidth: 520 }}>
          AI-Powered Sales<br />Intelligence for<br />
          <span style={{ color: 'var(--teal)' }}>Indian Fintech</span>
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text2)', lineHeight: 1.7, maxWidth: 440, marginBottom: 36 }}>
          Score prospects, track regulatory signals, and generate compliant outreach — all in one platform.
        </p>

        {/* Feature pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 48, maxWidth: 480 }}>
          {FEATURES.map(f => (
            <div key={f.text} className="feature-pill">
              <f.icon size={14} style={{ color: 'var(--teal)' }} />
              {f.text}
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--border)', paddingTop: 28, maxWidth: 420 }}>
          {[
            { num: 52, label: 'Companies' },
            { num: 8, label: 'Hot Leads' },
            { num: 3, label: 'RBI Alerts' },
          ].map((s, i) => (
            <div key={s.label} className="stat-box" style={{ borderRight: i < 2 ? '1px solid var(--border)' : 'none', flex: 1 }}>
              <div className="stat-num"><AnimatedCounter target={s.num} /></div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right half — Login form (shifted 20px left) */}
      <div style={{ flex: 1, maxWidth: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 60px', position: 'relative', zIndex: 1, marginLeft: -20 }}>
        <div className="login-card" style={{ width: '100%', maxWidth: 420 }}>

          {/* === FORGOT PASSWORD MODE === */}
          {forgotMode ? (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: 'var(--text1)' }}>
                Reset Password
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 28 }}>
                {forgotSent
                  ? 'Check your email for a password reset link. Click the link to set a new password.'
                  : 'Enter your email and we\'ll send you a link to reset your password.'}
              </p>

              {!forgotSent ? (
                <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div>
                    <label className="form-label">Email</label>
                    <input
                      className="input-field"
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                    />
                  </div>
                  <button type="submit" disabled={forgotLoading} className="btn-primary"
                    style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                    {forgotLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                    {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                    {!forgotLoading && <ArrowRight size={16} />}
                  </button>
                </form>
              ) : (
                <div style={{
                  padding: '16px 20px', borderRadius: 'var(--radius)',
                  background: 'rgba(0, 212, 164, 0.08)', border: '1px solid rgba(0, 212, 164, 0.2)',
                  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
                }}>
                  <Mail size={20} style={{ color: 'var(--teal)', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: 'var(--text2)' }}>
                    Reset email sent to <strong style={{ color: 'var(--text1)' }}>{forgotEmail}</strong>
                  </span>
                </div>
              )}

              <button onClick={() => { setForgotMode(false); setForgotSent(false) }}
                style={{
                  background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer',
                  fontSize: 13, textAlign: 'center', width: '100%', marginTop: 20,
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--teal)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>
                ← Back to Sign in
              </button>
            </>
          ) : (
            /* === SIGN IN / SIGN UP MODE === */
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: 'var(--text1)' }}>
                {isSignUp ? 'Create account' : 'Welcome back'}
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 32 }}>
                {isSignUp ? 'Get started with BlostemPulse' : 'Sign in to your dashboard'}
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Name — only in sign-up */}
                {isSignUp && (
                  <div>
                    <label className="form-label">Full Name</label>
                    <input className="input-field" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Doe" required />
                  </div>
                )}
                {/* Age & Department — only in sign-up */}
                {isSignUp && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="form-label">Age</label>
                      <input className="input-field" type="number" min="16" max="99" value={age} onChange={e => setAge(e.target.value)} placeholder="25" required />
                    </div>
                    <div>
                      <label className="form-label">Department</label>
                      <select className="input-field" value={department} onChange={e => setDepartment(e.target.value)} required style={{ cursor: 'pointer' }}>
                        <option value="">Select...</option>
                        <option value="Sales">Sales</option>
                        <option value="Marketing">Marketing</option>
                        <option value="Engineering">Engineering</option>
                        <option value="Product">Product</option>
                        <option value="Compliance">Compliance</option>
                        <option value="Finance">Finance</option>
                        <option value="Operations">Operations</option>
                      </select>
                    </div>
                  </div>
                )}
                <div>
                  <label className="form-label">Email</label>
                  <input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
                </div>
                <div>
                  <label className="form-label">Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input-field"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={eyeBtnStyle}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--text1)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? 'Loading...' : isSignUp ? 'Create account' : 'Sign in'}
                  {!loading && <ArrowRight size={16} />}
                </button>
              </form>

              {/* Forgot password */}
              {!isSignUp && (
                <button onClick={() => { setForgotMode(true); setForgotEmail(email) }}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer',
                    fontSize: 13, textAlign: 'center', width: '100%', marginTop: 12,
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--teal)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>
                  Forgot password?
                </button>
              )}

              <p style={{ textAlign: 'center', marginTop: 12, fontSize: 14, color: 'var(--text3)' }}>
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <button onClick={() => setIsSignUp(!isSignUp)} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                  {isSignUp ? 'Sign in' : 'Sign up'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
