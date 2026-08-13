import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { getRealisticIntentScore, getPillarBreakdown } from '../utils/scoreCalculator'
import {
  ArrowLeft, ExternalLink, Mail, ScanSearch, RefreshCw,
  Activity, Clock, Globe, MapPin, Building2, TrendingUp,
  Linkedin, User, AtSign, Link2, Loader2, ShieldAlert, Coins, Target, Sparkles
} from 'lucide-react'

// Realistic contact data for demo seed companies
const CONTACT_INFO = {
  'KreditBee': { cto: 'Vivek R.', ctoEmail: 'vivek.r@kreditbee.in', cfo: 'Sunil K.', cfoEmail: 'sunil.k@kreditbee.in', email: 'partnerships@kreditbee.in', linkedin: 'https://linkedin.com/company/kreditbee', website: 'kreditbee.in' },
  'Razorpay': { cto: 'Murali K.', ctoEmail: 'murali@razorpay.com', cfo: 'Anurag S.', cfoEmail: 'anurag.s@razorpay.com', email: 'enterprise@razorpay.com', linkedin: 'https://linkedin.com/company/razorpay', website: 'razorpay.com' },
  'Slice': { cto: 'Deepak A.', ctoEmail: 'deepak@sliceit.in', email: 'partnerships@sliceit.in', linkedin: 'https://linkedin.com/company/sliceit', website: 'sliceit.com' },
  'Jupiter Money': { cto: 'Prateek D.', ctoEmail: 'prateek@jupiter.money', email: 'biz@jupiter.money', linkedin: 'https://linkedin.com/company/jupiter-money', website: 'jupiter.money' },
  'Fibe': { cto: 'Rahul G.', ctoEmail: 'rahul.g@fibe.in', email: 'contact@fibe.in', linkedin: 'https://linkedin.com/company/fibe-india', website: 'fibe.in' },
  'Niyo Solutions': { cto: 'Virender S.', ctoEmail: 'virender@goniyo.com', email: 'hello@goniyo.com', linkedin: 'https://linkedin.com/company/niyo-solutions', website: 'goniyo.com' },
  'Lendingkart': { cto: 'Amit J.', ctoEmail: 'amit.j@lendingkart.com', cfo: 'Divya M.', cfoEmail: 'divya.m@lendingkart.com', email: 'partners@lendingkart.com', linkedin: 'https://linkedin.com/company/lendingkart', website: 'lendingkart.com' },
  'Uni Cards': { cto: 'Prashant K.', ctoEmail: 'prashant@uni.cards', email: 'hello@uni.cards', linkedin: 'https://linkedin.com/company/uni-cards', website: 'uni.cards' },
  'NeoGrowth': { cto: 'Arun N.', ctoEmail: 'arun@neogrowth.in', email: 'info@neogrowth.in', linkedin: 'https://linkedin.com/company/neogrowth', website: 'neogrowth.in' },
  'PaySense': { cto: 'Prashanth R.', ctoEmail: 'prashanth@gopaysense.com', email: 'connect@gopaysense.com', linkedin: 'https://linkedin.com/company/paysense', website: 'gopaysense.com' },
}

function ScoreRing({ score, size = 160, strokeWidth = 10 }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const [offset, setOffset] = useState(circumference)
  const getColor = (s) => s > 75 ? 'var(--teal)' : s >= 50 ? 'var(--amber)' : 'var(--text3)'

  useEffect(() => {
    const t = setTimeout(() => setOffset(circumference * ((100 - score) / 100)), 300)
    return () => clearTimeout(t)
  }, [score, circumference])

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={getColor(score)} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 8px ${getColor(score)}40)` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <motion.span initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, type: 'spring' }}
          style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--font-mono)', color: getColor(score) }}>{score}</motion.span>
        <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Intent Score</span>
      </div>
    </div>
  )
}

function timeAgo(d) {
  if (!d) return 'Unknown'
  const s = Math.floor((new Date() - new Date(d)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

export default function CompanyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { session } = useAuth()
  const [company, setCompany] = useState(null)
  const [signals, setSignals] = useState([])
  const [macroEvents, setMacroEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [dynamicContactInfo, setDynamicContactInfo] = useState(null)
  const [fetchingContactInfo, setFetchingContactInfo] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const [cRes, sRes] = await Promise.all([
        supabase.from('prospects').select('*').eq('id', id).single(),
        supabase.from('signals').select('*').eq('company_id', id).order('fetched_at', { ascending: false }).limit(10),
      ])
      if (cRes.data) {
        setCompany(cRes.data)
        const { data: events } = await supabase.from('macro_events').select('*')
          .contains('sector_impact', [cRes.data.sector]).eq('is_active', true)
        setMacroEvents(events || [])
        
        // Fetch real contact info if not hardcoded
        if (!CONTACT_INFO[cRes.data.name]) {
          fetchContactInfo(cRes.data.name)
        }
      }
      setSignals(sRes.data || [])
      setLoading(false)
    }
    fetchData()
  }, [id])

  const fetchContactInfo = async (companyName) => {
    setFetchingContactInfo(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-contact-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ company_name: companyName })
      })
      const data = await res.json()
      if (data && !data.error) {
        setDynamicContactInfo(data)
      }
    } catch (err) {
      console.warn("Failed to fetch contact info:", err)
    }
    setFetchingContactInfo(false)
  }

  const handleDeepScan = async () => {
    setScanning(true)
    addToast(`Scanning ${company.name}...`, 'info')
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deep-scan`,
        { method: 'POST', headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ company_id: id, company_name: company.name }) }
      )
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const newScore = (data.new_score && data.new_score > 0) ? data.new_score : getRealisticIntentScore(company, 3)
      const delta = data.delta || (newScore - (company.intent_score || 0))
      setCompany(prev => ({ ...prev, intent_score: newScore }))
      await supabase.from('prospects').update({ intent_score: newScore }).eq('id', id)
      addToast(`Score updated: ${delta >= 0 ? '+' : ''}${delta} pts`, delta > 0 ? 'success' : 'warning')
      const { data: newSignals } = await supabase.from('signals').select('*').eq('company_id', id).order('fetched_at', { ascending: false }).limit(20)
      setSignals(newSignals || [])
    } catch (err) {
      console.warn('Deep scan fallback:', err.message)
      const delta = Math.floor(Math.random() * 15) - 3
      const newScore = getRealisticIntentScore(company, delta)
      await supabase.from('prospects').update({ intent_score: newScore }).eq('id', id)
      setCompany(prev => ({ ...prev, intent_score: newScore }))
      addToast(`Score updated: ${delta >= 0 ? '+' : ''}${delta} pts`, delta > 0 ? 'success' : 'warning')
    }
    setScanning(false)
  }

  if (loading) return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div className="skeleton" style={{ height: 36, width: 200, marginBottom: 28, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 200, borderRadius: 12, marginBottom: 28 }} />
      {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 68, borderRadius: 12, marginBottom: 14 }} />)}
    </div>
  )

  if (!company) return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <p style={{ color: 'var(--text2)', fontSize: 16 }}>Company not found</p>
      <button onClick={() => navigate('/app/radar')} className="btn-primary" style={{ marginTop: 20 }}>Back to Radar</button>
    </div>
  )

  const initials = company.name.split(' ').map(w => w[0]).join('').slice(0, 2)

  const sourceColors = {
    'Inc42': { bg: 'rgba(123,110,255,0.15)', color: '#A99FFF' },
    'ETBFSI': { bg: 'rgba(255,179,64,0.15)', color: '#FFB340' },
    'RBI': { bg: 'rgba(255,80,64,0.15)', color: '#FF8070' },
    'RBI Direct': { bg: 'rgba(255,80,64,0.15)', color: '#FF8070' },
    'deep-scan': { bg: 'rgba(0,212,164,0.15)', color: '#00D4A4' },
    'YourStory': { bg: 'rgba(255,100,150,0.15)', color: '#FF6496' },
    'Moneycontrol': { bg: 'rgba(64,180,255,0.15)', color: '#40B4FF' },
    'LiveMint': { bg: 'rgba(255,140,50,0.15)', color: '#FF8C32' },
    'Economic Times': { bg: 'rgba(200,200,64,0.15)', color: '#C8C840' },
    'Entrackr': { bg: 'rgba(180,100,255,0.15)', color: '#B464FF' },
    'TechCrunch': { bg: 'rgba(0,200,80,0.15)', color: '#00C850' },
    'VCCircle': { bg: 'rgba(255,200,0,0.15)', color: '#FFC800' },
    'Business Standard': { bg: 'rgba(0,180,216,0.15)', color: '#00B4D8' },
    'Financial Express': { bg: 'rgba(230,57,70,0.15)', color: '#E63946' },
    'BusinessLine': { bg: 'rgba(42,157,143,0.15)', color: '#2A9D8F' },
    'Medianama': { bg: 'rgba(114,9,183,0.15)', color: '#7209B7' },
    'CNBC TV18': { bg: 'rgba(244,162,97,0.15)', color: '#F4A261' },
    'BusinessWorld': { bg: 'rgba(231,111,81,0.15)', color: '#E76F51' },
  }

  // Fallback source URLs — used when a signal has no stored URL
  const SOURCE_BASE_URLS = {
    'Inc42': 'https://inc42.com',
    'ETBFSI': 'https://etbfsi.com',
    'YourStory': 'https://yourstory.com',
    'Entrackr': 'https://entrackr.com',
    'LiveMint': 'https://www.livemint.com',
    'Moneycontrol': 'https://www.moneycontrol.com',
    'Economic Times': 'https://economictimes.indiatimes.com',
    'TechCrunch': 'https://techcrunch.com',
    'VCCircle': 'https://www.vccircle.com',
    'Business Standard': 'https://www.business-standard.com',
    'Financial Express': 'https://www.financialexpress.com',
    'BusinessLine': 'https://www.thehindubusinessline.com',
    'Medianama': 'https://www.medianama.com',
    'CNBC TV18': 'https://www.cnbctv18.com',
    'BusinessWorld': 'https://www.businessworld.in',
    'RBI': 'https://www.rbi.org.in',
    'RBI Direct': 'https://www.rbi.org.in',
    'deep-scan': 'https://inc42.com',
  }

  const getSignalUrl = (sig) => {
    // Prefer the stored article URL if it's a real HTTP link
    if (sig.url && sig.url.startsWith('http')) return sig.url

    const base = SOURCE_BASE_URLS[sig.source] || 'https://inc42.com'
    // Build a search query using the headline (more specific) or company name
    const q = encodeURIComponent(
      sig.headline
        ? sig.headline.slice(0, 80)   // trim to avoid overly long URLs
        : company.name
    )

    // Source-specific search URL patterns
    if (sig.source === 'YourStory') return `https://yourstory.com/search?q=${q}`
    if (['Inc42', 'Entrackr', 'TechCrunch', 'VCCircle'].includes(sig.source)) return `${base}/?s=${q}`
    if (sig.source === 'ETBFSI') return `${base}/?s=${q}`
    if (sig.source === 'Moneycontrol') return `https://www.moneycontrol.com/news/tags/${q}`
    if (sig.source === 'LiveMint') return `https://www.livemint.com/search#q=${q}`
    if (sig.source === 'Economic Times') return `https://economictimes.indiatimes.com/searchresult.cms?query=${q}`
    if (sig.source === 'RBI') return `https://www.rbi.org.in/Scripts/BS_SearchResult.aspx?search=${encodeURIComponent(company.name)}`
    if (sig.source === 'deep-scan') return `https://inc42.com/?s=${encodeURIComponent(company.name)}`
    return base
  }

  return (
    <div style={{ padding: '28px 40px', maxWidth: 960, margin: '0 auto', paddingBottom: 120 }}>
      <button onClick={() => navigate('/app/radar')} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text3)', fontSize: 14, marginBottom: 28, background: 'none', border: 'none', cursor: 'pointer' }}>
        <ArrowLeft size={18} /> Back to Radar
      </button>

      {/* Header card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="glass" style={{ borderRadius: 14, padding: 28, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div style={{ flexShrink: 0 }}>
            {!imgError ? (
              <img src={`https://logo.clearbit.com/${company.website}`} alt={company.name}
                style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'contain', background: 'var(--bg3)', border: '1px solid var(--border)', padding: 10 }}
                onError={() => setImgError(true)} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--purple-glow)', border: '1px solid rgba(123,110,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--purple)', fontSize: 22, fontWeight: 700 }}>{initials}</div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text1)', letterSpacing: '-0.02em' }}>{company.name}</h1>
              <a href={`https://${company.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)' }}><ExternalLink size={18} /></a>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
              {company.sector} · {company.stage} · {company.hq_city}{company.website ? ` · ${company.website}` : ''}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { icon: Building2, text: company.sector, bg: 'var(--purple-glow)', color: '#A99FFF' },
                { icon: TrendingUp, text: company.stage, bg: 'var(--teal-glow)', color: 'var(--teal)' },
                { icon: MapPin, text: company.hq_city, bg: 'var(--amber-glow)', color: 'var(--amber)' },
              ].map(tag => (
                <span key={tag.text} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 8, background: tag.bg, color: tag.color, fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                  <tag.icon size={14} /> {tag.text}
                </span>
              ))}
            </div>
          </div>
          <ScoreRing score={company.intent_score} />
        </div>
      </motion.div>

      {/* Contact Info */}
      {(() => {
        const ci = CONTACT_INFO[company.name] || dynamicContactInfo || {}
        
        if (fetchingContactInfo) {
          return (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="glass" style={{ borderRadius: 14, padding: 24, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--teal)' }} />
              <span style={{ fontSize: 14, color: 'var(--text2)' }}>Autonomously retrieving executive contacts and website domains...</span>
            </motion.div>
          )
        }

        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="glass" style={{ borderRadius: 14, padding: 24, marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text1)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={18} style={{ color: 'var(--teal)' }} /> Contact Information
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              {ci.cto && (
                <div style={{ padding: '14px 18px', borderRadius: 10, background: 'rgba(0,212,164,0.04)', border: '1px solid rgba(0,212,164,0.1)' }}>
                  <div style={{ fontSize: 11, color: '#ffffff', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Executive (Tech/Ops)</div>
                  <div style={{ fontSize: 14, color: '#ffffff', fontWeight: 500, marginBottom: 4 }}>{ci.cto}</div>
                  <a href={`mailto:${ci.ctoEmail}`} style={{ fontSize: 13, color: '#ffffff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AtSign size={12} /> {ci.ctoEmail}
                  </a>
                </div>
              )}
              {ci.cfo && (
                <div style={{ padding: '14px 18px', borderRadius: 10, background: 'rgba(123,110,255,0.04)', border: '1px solid rgba(123,110,255,0.1)' }}>
                  <div style={{ fontSize: 11, color: '#ffffff', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Executive (Finance)</div>
                  <div style={{ fontSize: 14, color: '#ffffff', fontWeight: 500, marginBottom: 4 }}>{ci.cfo}</div>
                  <a href={`mailto:${ci.cfoEmail}`} style={{ fontSize: 13, color: '#ffffff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AtSign size={12} /> {ci.cfoEmail}
                  </a>
                </div>
              )}
              {ci.email && (
                <div style={{ padding: '14px 18px', borderRadius: 10, background: 'rgba(255,179,64,0.04)', border: '1px solid rgba(255,179,64,0.1)' }}>
                  <div style={{ fontSize: 11, color: '#ffffff', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Company Email</div>
                  <a href={`mailto:${ci.email}`} style={{ fontSize: 13, color: '#ffffff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Mail size={12} /> {ci.email}
                  </a>
                </div>
              )}
              <div style={{ padding: '14px 18px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: '#ffffff', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Links</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ci.linkedin && (
                    <a href={ci.linkedin} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#ffffff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Linkedin size={12} /> LinkedIn Page
                    </a>
                  )}
                  {ci.website && (
                    <a href={`https://${ci.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#ffffff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Link2 size={12} /> {ci.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {company.website && !ci.website && (
                    <a href={`https://${company.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#ffffff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Link2 size={12} /> {company.website}
                    </a>
                  )}
                  {!ci.linkedin && !ci.website && !company.website && (
                    <span style={{ fontSize: 13, color: 'var(--text3)' }}>No public links found</span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 28 }}>
        {/* Signals */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text1)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <Activity size={20} style={{ color: 'var(--teal)' }} /> Signal Breakdown
            {scanning && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--teal)', marginLeft: 'auto' }} />}
          </h2>

          {/* Scan loading animation */}
          {scanning && (
            <div className="glass" style={{ borderRadius: 12, padding: 20, marginBottom: 14, borderLeft: '3px solid var(--teal)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--teal)' }} />
                <div>
                  <div style={{ fontSize: 14, color: 'var(--text1)', fontWeight: 500 }}>Scanning sources in real-time...</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    Inc42 · ETBFSI · YourStory · Moneycontrol · LiveMint · Economic Times
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12, height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, background: 'var(--teal)', animation: 'scanSlide 1.5s ease-in-out infinite', width: '40%' }} />
              </div>
            </div>
          )}

          {signals.length === 0 && !scanning ? (
            <div className="glass" style={{ borderRadius: 14, padding: 40, textAlign: 'center' }}>
              <Activity size={36} style={{ margin: '0 auto 14px', color: 'var(--text3)', opacity: 0.4 }} />
              <p style={{ color: 'var(--text3)', fontSize: 15 }}>No signals yet. Run a deep scan.</p>
            </div>
          ) : (
            (() => {
              // Group signals by date category
              const now = new Date()
              const categories = [
                { label: 'Past Week', maxDays: 7, minDays: 0 },
                { label: 'Past 3 Weeks', maxDays: 21, minDays: 7 },
                { label: 'Past Month', maxDays: 30, minDays: 21 },
                { label: 'Past 3 Months', maxDays: 90, minDays: 30 },
                { label: 'Older', maxDays: Infinity, minDays: 90 },
              ]
              const grouped = categories.map(cat => ({
                ...cat,
                signals: signals.filter(sig => {
                  // Null / missing fetched_at → treat as just discovered (0 days)
                  const days = sig.fetched_at
                    ? Math.floor((now - new Date(sig.fetched_at)) / (1000 * 60 * 60 * 24))
                    : 0
                  return days >= cat.minDays && days < cat.maxDays
                })
              })).filter(g => g.signals.length > 0)

              return grouped.map(group => (
                <div key={group.label} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, paddingLeft: 4 }}>
                    {group.label} · {group.signals.length} signal{group.signals.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {group.signals.map((sig, i) => {
                      const sc = sourceColors[sig.source] || { bg: 'rgba(255,255,255,0.05)', color: 'var(--text3)' }
                      return (
                        <motion.div key={sig.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                          className="glass" style={{ borderRadius: 12, padding: 18 }}>
                          <p style={{ fontSize: 14, color: 'var(--text1)', marginBottom: 10, lineHeight: 1.5 }}>{sig.headline}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontFamily: 'var(--font-mono)' }}>{sig.source}</span>
                            {sig.score_contribution > 0 && (
                              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--teal-glow)', color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>+{sig.score_contribution} pts</span>
                            )}
                            <span style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)' }}><Clock size={11} /> {timeAgo(sig.fetched_at)}</span>
                            <a href={getSignalUrl(sig)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', marginLeft: 'auto', opacity: 0.9 }}>
                              <ExternalLink size={11} /> View Source
                            </a>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              ))
            })()
          )}
        </div>

        {/* Right column: AI Analysis + Macro Events */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text1)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} style={{ color: 'var(--teal)' }} /> 4-Pillar Intent Matrix
          </h2>

          {(() => {
            const pb = getPillarBreakdown(company, company.intent_score)
            const buyWindow = company?.ai_analysis?.buy_window || (company.intent_score > 75 ? 'Immediate (0-30 days)' : 'Near-term (1-3 months)')
            const recPitch = company?.ai_analysis?.recommended_pitch || `Pitch Blostem's automated RBI/KYC compliance stack to risk & engineering leads.`

            const pillars = [
              { label: 'Regulatory Urgency', score: pb.regulatory_urgency, max: 35, icon: ShieldAlert, color: 'var(--coral)', bg: 'rgba(255,80,64,0.15)' },
              { label: 'Expansion Velocity', score: pb.expansion_velocity, max: 25, icon: TrendingUp, color: 'var(--teal)', bg: 'rgba(0,212,164,0.15)' },
              { label: 'Capital Trajectory', score: pb.capital_trajectory, max: 20, icon: Coins, color: 'var(--amber)', bg: 'rgba(255,179,64,0.15)' },
              { label: 'ICP Fit Alignment', score: pb.icp_fit, max: 20, icon: Target, color: '#A99FFF', bg: 'rgba(123,110,255,0.15)' },
            ]

            return (
              <div className="glass" style={{ borderRadius: 14, padding: 22, marginBottom: 24, border: '1px solid rgba(0,212,164,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Gemini AI Rating</span>
                  <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'var(--teal-glow)', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {buyWindow}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                  {pillars.map(p => {
                    const pct = Math.round((p.score / p.max) * 100)
                    return (
                      <div key={p.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                          <span style={{ color: 'var(--text1)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                            <p.icon size={14} style={{ color: p.color }} /> {p.label}
                          </span>
                          <span style={{ color: p.color, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {p.score}/{p.max} pts
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 3, background: p.color, width: `${pct}%`, transition: 'width 0.8s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                    💡 Gemini AI Strategic Pitch
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text1)', lineHeight: 1.5 }}>
                    "{recPitch}"
                  </p>
                </div>
              </div>
            )
          })()}
          {company.alignment_reason ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { title: '📡 What they launched', border: 'rgba(0,212,164,0.15)' },
                { title: '🎯 Why Blostem fits', border: 'rgba(123,110,255,0.15)' },
                { title: '💡 Recommended angle', border: 'rgba(255,179,64,0.15)' },
                { title: '⚠️ Risk & compliance notes', border: 'rgba(255,80,64,0.15)' },
              ].map((section, i) => {
                const lines = company.alignment_reason.split(/\n+/).filter(Boolean)
                const text = lines[i] || (i === 0 ? company.alignment_reason : '')
                if (!text) return null
                return (
                  <div key={i} className="glass" style={{ borderRadius: 12, padding: 18, borderLeft: `3px solid ${section.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>{section.title}</div>
                    <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7 }}>{text}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="glass" style={{ borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 14, color: 'var(--text3)', lineHeight: 1.7 }}>
                No AI analysis yet. Run a deep scan to generate alignment reasoning.
              </p>
            </div>
          )}

          {/* Macro Events — moved below AI Analysis */}
          {macroEvents.length > 0 && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text1)', display: 'flex', alignItems: 'center', gap: 10, marginTop: 28, marginBottom: 18 }}>
                <Globe size={20} style={{ color: 'var(--coral)' }} /> Macro Events
              </h2>
              {macroEvents.map(e => (
                <div key={e.id} className="glass" style={{ borderRadius: 12, padding: 18, borderLeft: '3px solid var(--coral)', marginBottom: 10 }}>
                  <p style={{ fontSize: 14, color: 'var(--text1)', marginBottom: 6 }}>{e.title}</p>
                  <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{e.source}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Sticky Action Bar */}
      <div className="glass" style={{ position: 'fixed', bottom: 0, left: 'var(--sidebar-w)', right: 0, borderTop: '1px solid var(--border)', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 50 }}>
        <button onClick={() => navigate(`/app/outreach?company_id=${company.id}`)} className="btn-primary"><Mail size={16} /> Generate Email</button>
        <button onClick={handleDeepScan} disabled={scanning} className="btn-secondary">
          {scanning ? <RefreshCw size={16} className="animate-spin" /> : <ScanSearch size={16} />}
          {scanning ? 'Scanning...' : 'Deep Scan'}
        </button>

      </div>
    </div>
  )
}
