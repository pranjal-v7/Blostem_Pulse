import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { Building2, MapPin, FileText, ArrowRight, ArrowLeft, Check } from 'lucide-react'

const COMPANY_TYPES = [
  { value: 'NBFC', icon: '🏦', desc: 'Non-Banking Financial Company' },
  { value: 'Neobank', icon: '📱', desc: 'Digital-first banking platform' },
  { value: 'Payments', icon: '💳', desc: 'Payment processing & gateway' },
  { value: 'Insurtech', icon: '🛡️', desc: 'Insurance technology' },
  { value: 'Lending', icon: '💰', desc: 'Digital lending & credit' },
]

const STAGES = ['Seed', 'Series A', 'Series B', 'Series C+', 'Pre-IPO']
const GEOGRAPHIES = ['Pan-India', 'Metro-focused', 'Tier 2 & 3']

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [companyType, setCompanyType] = useState('')
  const [stageFilter, setStageFilter] = useState([])
  const [geography, setGeography] = useState('')
  const [icpDefinition, setIcpDefinition] = useState('')
  const [saving, setSaving] = useState(false)
  const { user, session } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()

  const toggleStage = (s) => {
    setStageFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        company_type: companyType,
        stage_filter: stageFilter,
        geography,
        icp_definition: icpDefinition,
      })
      if (error) throw error
      addToast('Profile saved! Scoring prospects...', 'success')
      // Trigger async rescore_all — now with auth header so ICP is used
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/score-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ rescore_all: true }),
      }).catch(() => {}) // fire-and-forget
      setTimeout(() => navigate('/app/radar'), 500)
    } catch (err) {
      addToast(err.message, 'error')
    }
    setSaving(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 36 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              height: 4, flex: 1, borderRadius: 4,
              background: s <= step ? 'var(--teal)' : 'rgba(255,255,255,0.08)',
              transition: 'background 0.5s',
            }} />
          ))}
        </div>

        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}
          className="glass" style={{ borderRadius: 16, padding: 40 }}>
          {step === 1 && (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text1)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Building2 size={22} style={{ color: 'var(--teal)' }} /> Company Type
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24 }}>What type of fintech companies are you targeting?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {COMPANY_TYPES.map(ct => (
                  <button key={ct.value} onClick={() => setCompanyType(ct.value)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: 18, borderRadius: 12,
                      border: `1px solid ${companyType === ct.value ? 'rgba(0,212,164,0.4)' : 'var(--border)'}`,
                      background: companyType === ct.value ? 'var(--teal-glow)' : 'transparent',
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                    }}>
                    <span style={{ fontSize: 28 }}>{ct.icon}</span>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text1)' }}>{ct.value}</p>
                      <p style={{ fontSize: 13, color: 'var(--text2)' }}>{ct.desc}</p>
                    </div>
                    {companyType === ct.value && <Check size={20} style={{ marginLeft: 'auto', color: 'var(--teal)' }} />}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text1)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <MapPin size={22} style={{ color: 'var(--teal)' }} /> Stage & Geography
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24 }}>Narrow down by funding stage and location</p>
              <div style={{ marginBottom: 28 }}>
                <label className="form-label">Funding Stage</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {STAGES.map(s => (
                    <button key={s} onClick={() => toggleStage(s)}
                      style={{
                        padding: '9px 18px', borderRadius: 8, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s',
                        background: stageFilter.includes(s) ? 'var(--teal)' : 'transparent',
                        color: stageFilter.includes(s) ? '#fff' : 'var(--text2)',
                        border: `1px solid ${stageFilter.includes(s) ? 'var(--teal)' : 'var(--border)'}`,
                        fontWeight: stageFilter.includes(s) ? 600 : 400,
                      }}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">Geography</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {GEOGRAPHIES.map(g => (
                    <button key={g} onClick={() => setGeography(g)}
                      style={{
                        padding: '9px 18px', borderRadius: 8, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s',
                        background: geography === g ? 'var(--purple)' : 'transparent',
                        color: geography === g ? '#fff' : 'var(--text2)',
                        border: `1px solid ${geography === g ? 'var(--purple)' : 'var(--border)'}`,
                        fontWeight: geography === g ? 600 : 400,
                      }}>{g}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text1)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={22} style={{ color: 'var(--teal)' }} /> ICP Description
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24 }}>Describe your ideal customer profile in detail</p>
              <textarea value={icpDefinition} onChange={e => setIcpDefinition(e.target.value)}
                placeholder="e.g., Series B+ NBFCs with active digital lending products, 50k+ monthly disbursals, compliance team of 5+"
                className="input-field" style={{ minHeight: 160, resize: 'vertical', height: 'auto', fontSize: 14 }} />
            </>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
            {step > 1 ? (
              <button onClick={() => setStep(step - 1)} className="btn-secondary">
                <ArrowLeft size={16} /> Back
              </button>
            ) : <div />}
            {step < 3 ? (
              <button onClick={() => setStep(step + 1)} className="btn-primary">
                Next <ArrowRight size={16} />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : 'Launch Radar'} <ArrowRight size={16} />
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
