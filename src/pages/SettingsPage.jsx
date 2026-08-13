import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { getRealisticIntentScore } from '../utils/scoreCalculator'
import { motion } from 'framer-motion'
import { Settings, User, Database, Trash2, AlertTriangle, Loader2, Sparkles, RefreshCw, Camera, Shield, Bell, Globe, Moon, Sun, Info } from 'lucide-react'

const DEMO_SIGNALS = [
  { name: 'KreditBee', headlines: ['KreditBee raises $200M Series D to expand BNPL portfolio', 'KreditBee partners with NBFC to launch co-lending product'] },
  { name: 'Razorpay', headlines: ['Razorpay launches PayrollCard for SME payroll compliance', 'Razorpay expands UPI autopay to subscription businesses'] },
  { name: 'Jupiter Money', headlines: ['Jupiter Money integrates RBI-mandated FLDG norms into lending stack'] },
  { name: 'Fibe', headlines: ['Fibe reports 3x growth in salary advance disbursals Q1 2026'] },
  { name: 'Slice', headlines: ['Slice completes merger with North East SFB, becomes full-stack bank'] },
  { name: 'Niyo Solutions', headlines: ['Niyo launches cross-border forex card with zero markup'] },
]

export default function SettingsPage() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const { theme, setTheme } = useTheme()
  const [profile, setProfile] = useState({ icp_definition: '', company_type: '', stage_filter: [], geography: '', scan_frequency: '2x_daily' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [showDangerConfirm, setShowDangerConfirm] = useState(null)

  // Account
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('Sales Lead')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Preferences
  const [notifications, setNotifications] = useState(true)
  const [timezone, setTimezone] = useState('Asia/Kolkata')

  useEffect(() => {
    async function fetchProfile() {
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        setProfile(data)
        setDisplayName(data.display_name || user.email?.split('@')[0]?.replace(/[0-9._]/g, ' ').trim() || '')
        setRole(data.role || 'Sales Lead')
        setAvatarUrl(data.avatar_url || null)
      } else {
        setDisplayName(user.email?.split('@')[0]?.replace(/[0-9._]/g, ' ').trim() || '')
      }
      setLoading(false)
    }
    fetchProfile()
  }, [user])

  const saveProfile = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        icp_definition: profile.icp_definition,
        company_type: profile.company_type,
        stage_filter: profile.stage_filter,
        geography: profile.geography,
        scan_frequency: profile.scan_frequency,
        display_name: displayName,
        role,
        avatar_url: avatarUrl,
      })
      if (error) throw error
      addToast('Profile saved!', 'success')
    } catch (err) {
      addToast(`Failed to save profile: ${err.message}`, 'error')
      setSaving(false)
      return // Don't attempt cron update if profile save failed
    }

    // Update the backend cron schedule separately — non-fatal
    try {
      let freqArg = 'manual'
      if (profile.scan_frequency === '2x_daily') freqArg = '2x'
      if (profile.scan_frequency === '4x_daily') freqArg = '4x'
      
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-cron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ frequency: freqArg })
      })
      const data = await res.json()
      if (data.warning) {
        addToast(`Scan schedule note: ${data.warning}`, 'info')
      } else if (!res.ok) {
        addToast('Profile saved, but scan schedule update failed', 'warning')
      } else {
        addToast('Scan schedule updated', 'success')
      }
    } catch (cronErr) {
      addToast('Profile saved, but scan schedule update failed', 'warning')
    }
    setSaving(false)
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `avatars/${user.id}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (uploadErr) throw uploadErr
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      setAvatarUrl(publicUrl)
      addToast('Profile photo uploaded!', 'success')
    } catch {
      const reader = new FileReader()
      reader.onload = () => {
        setAvatarUrl(reader.result)
        addToast('Profile photo set', 'success')
      }
      reader.readAsDataURL(file)
    }
    setUploading(false)
  }

  const loadDemoSignals = async () => {
    setLoadingDemo(true)
    try {
      const { data: prospects } = await supabase.from('prospects').select('id, name, intent_score')
      let inserted = 0
      for (const demo of DEMO_SIGNALS) {
        const prospect = prospects?.find(p => p.name === demo.name)
        if (!prospect) continue
        for (const headline of demo.headlines) {
          const { error } = await supabase.from('signals').insert({
            company_id: prospect.id, headline, source: 'deep-scan',
            url: `https://inc42.com/buzz/${demo.name.toLowerCase().replace(/\s/g, '-')}`,
            score_contribution: Math.floor(Math.random() * 20) + 5,
          })
          if (!error) inserted++
        }
        const newScore = getRealisticIntentScore(prospect, 5)
        await supabase.from('prospects').update({ intent_score: newScore }).eq('id', prospect.id)
      }
      addToast(`Loaded ${inserted} demo signals & updated scores`, 'success')
    } catch { addToast('Failed to load demo signals', 'error') }
    setLoadingDemo(false)
  }

  const clearSignals = async () => {
    try {
      await supabase.from('signals').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      addToast('All signals cleared', 'success')
    } catch { addToast('Failed', 'error') }
    setShowDangerConfirm(null)
  }

  const resetScores = async () => {
    try {
      await supabase.from('prospects').update({ intent_score: 0 }).neq('id', '00000000-0000-0000-0000-000000000000')
      addToast('All scores reset', 'success')
    } catch { addToast('Failed', 'error') }
    setShowDangerConfirm(null)
  }

  const initials = user?.email?.slice(0, 2).toUpperCase() || 'BP'
  const wl = { fontSize: 12, color: '#ffffff', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'block' }

  if (loading) return (
    <div style={{ padding: 32, maxWidth: 800, margin: '0 auto' }}>
      {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 140, borderRadius: 12, marginBottom: 16 }} />)}
    </div>
  )

  return (
    <div style={{ padding: '28px 40px', maxWidth: 800, margin: '0 auto', paddingBottom: 80 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
        <Settings size={24} style={{ color: 'var(--teal)' }} /> Settings
      </h1>

      {/* Profile & Account */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="glass" style={{ borderRadius: 14, padding: 28, marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <User size={18} style={{ color: 'var(--teal)' }} /> Profile & Account
        </h2>
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div onClick={() => fileInputRef.current?.click()} style={{
              width: 80, height: 80, borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
              background: avatarUrl ? 'transparent' : 'linear-gradient(135deg, var(--teal-dim), var(--teal))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--border)', position: 'relative',
            }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{initials}</span>
              )}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 4, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center' }}>
                {uploading ? <Loader2 size={14} className="animate-spin" style={{ color: '#fff' }} /> : <Camera size={14} style={{ color: '#fff' }} />}
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>Upload photo</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={wl}>Display Name</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className="input-field" placeholder="Your name" />
            </div>
            <div>
              <label style={wl}>Email</label>
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: '#ffffff', fontSize: 14 }}>{user?.email}</div>
            </div>
            <div>
              <label style={wl}>Role</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Sales Lead', 'Manager', 'Analyst', 'Admin'].map(r => (
                  <button key={r} onClick={() => setRole(r)} style={{
                    padding: '8px 16px', borderRadius: 8, fontSize: 13, border: '1px solid', cursor: 'pointer', transition: 'all 0.2s',
                    background: role === r ? 'var(--purple)' : 'transparent',
                    borderColor: role === r ? 'var(--purple)' : 'var(--border)',
                    color: '#ffffff', fontWeight: role === r ? 600 : 400,
                  }}>{r}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Preferences */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="glass" style={{ borderRadius: 14, padding: 28, marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Shield size={18} style={{ color: 'var(--purple)' }} /> Preferences
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <label style={{ ...wl, display: 'flex', alignItems: 'center', gap: 6 }}><Moon size={12} /> Theme</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ v: 'dark', i: Moon, l: 'Dark' }, { v: 'light', i: Sun, l: 'Light' }].map(t => (
                <button key={t.v} onClick={() => setTheme(t.v)} style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 13, border: '1px solid', cursor: 'pointer',
                  background: theme === t.v ? 'var(--teal)' : 'transparent', display: 'flex', alignItems: 'center', gap: 6,
                  borderColor: theme === t.v ? 'var(--teal)' : 'var(--border)', color: '#ffffff',
                }}><t.i size={14} /> {t.l}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ ...wl, display: 'flex', alignItems: 'center', gap: 6 }}><Bell size={12} /> Notifications</label>
            <button onClick={() => setNotifications(!notifications)} style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 13, border: '1px solid', cursor: 'pointer',
              background: notifications ? 'var(--teal)' : 'transparent',
              borderColor: notifications ? 'var(--teal)' : 'var(--border)', color: '#ffffff',
            }}>{notifications ? '✓ Enabled' : 'Disabled'}</button>
          </div>
          <div>
            <label style={{ ...wl, display: 'flex', alignItems: 'center', gap: 6 }}><Globe size={12} /> Timezone</label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)} className="input-field" style={{ cursor: 'pointer' }}>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="America/New_York">America/New York (EST)</option>
              <option value="Europe/London">Europe/London (GMT)</option>
              <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* ICP Configuration */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass" style={{ borderRadius: 14, padding: 28, marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#ffffff', marginBottom: 20 }}>ICP Configuration</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={wl}>Company Type</label>
            <input type="text" value={profile.company_type || ''} onChange={e => setProfile(p => ({ ...p, company_type: e.target.value }))} className="input-field" placeholder="e.g., NBFC" />
          </div>
          <div>
            <label style={wl}>Geography</label>
            <input type="text" value={profile.geography || ''} onChange={e => setProfile(p => ({ ...p, geography: e.target.value }))} className="input-field" placeholder="e.g., Pan-India" />
          </div>
          <div>
            <label style={wl}>ICP Description</label>
            <textarea value={profile.icp_definition || ''} onChange={e => setProfile(p => ({ ...p, icp_definition: e.target.value }))}
              className="input-field" style={{ minHeight: 110, resize: 'vertical', height: 'auto' }} placeholder="Describe your ideal customer..." />
          </div>
          <div>
            <label style={wl}>Scan Frequency</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {['2x_daily', '4x_daily', 'manual'].map(f => (
                <button key={f} onClick={() => setProfile(p => ({ ...p, scan_frequency: f }))} style={{
                  padding: '9px 18px', borderRadius: 8, fontSize: 14, border: '1px solid', cursor: 'pointer',
                  background: profile.scan_frequency === f ? 'var(--teal)' : 'transparent',
                  borderColor: profile.scan_frequency === f ? 'var(--teal)' : 'var(--border)',
                  color: '#ffffff', fontWeight: profile.scan_frequency === f ? 600 : 400,
                }}>
                  {f === '2x_daily' ? '2x / day' : f === '4x_daily' ? '4x / day' : 'Manual'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={saveProfile} disabled={saving} className="btn-primary" style={{ width: 'fit-content' }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {saving ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>
      </motion.div>

      {/* About */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="glass" style={{ borderRadius: 14, padding: 28, marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Info size={18} style={{ color: 'var(--teal)' }} /> About BlostemPulse
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[
            { label: 'Version', value: 'v2.0.0-beta' },
            { label: 'Platform', value: 'React + Supabase' },
            { label: 'AI Engine', value: 'Gemini 2.0 Flash' },
            { label: 'License', value: 'MIT' },
          ].map(item => (
            <div key={item.label} style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 14, color: '#ffffff', fontWeight: 500 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Demo Controls */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass" style={{ borderRadius: 14, padding: 28, marginBottom: 20, border: '1px solid rgba(0,212,164,0.2)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Sparkles size={18} style={{ color: 'var(--teal)' }} /> Demo Controls
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Load realistic demo signals for the presentation</p>
        <button onClick={loadDemoSignals} disabled={loadingDemo} className="btn-primary" style={{ width: 'fit-content' }}>
          {loadingDemo ? <RefreshCw size={16} className="animate-spin" /> : <Database size={16} />}
          {loadingDemo ? 'Loading...' : 'Load Demo Signals'}
        </button>
      </motion.div>

      {/* Danger Zone */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="glass" style={{ borderRadius: 14, padding: 28, border: '1px solid rgba(255,80,64,0.2)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--coral)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}><AlertTriangle size={18} /> Danger Zone</h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {showDangerConfirm === 'signals' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--coral)' }}>Are you sure?</span>
              <button onClick={clearSignals} style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>Yes, clear all</button>
              <button onClick={() => setShowDangerConfirm(null)} className="btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowDangerConfirm('signals')} className="btn-secondary" style={{ color: 'var(--coral)', borderColor: 'rgba(255,80,64,0.2)' }}>
              <Trash2 size={16} /> Clear All Signals
            </button>
          )}
          {showDangerConfirm === 'scores' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--coral)' }}>Are you sure?</span>
              <button onClick={resetScores} style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>Yes, reset</button>
              <button onClick={() => setShowDangerConfirm(null)} className="btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowDangerConfirm('scores')} className="btn-secondary" style={{ color: 'var(--coral)', borderColor: 'rgba(255,80,64,0.2)' }}>
              <RefreshCw size={16} /> Reset All Scores
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
