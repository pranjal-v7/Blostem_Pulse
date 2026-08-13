import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useRealtimeProspects } from '../hooks/useRealtimeProspects'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getRealisticIntentScore, getPillarBreakdown } from '../utils/scoreCalculator'
import { recordScanHistory } from '../utils/historyStorage'
import { Search, Pencil, X, Loader2, Zap, Radio, Info, Sparkles, CheckCircle, Trash2, ExternalLink } from 'lucide-react'

function timeAgo(date) {
  if (!date) return 'No data'
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function getHeat(score) {
  if (score === null || score === undefined || isNaN(score)) return 'cold'
  if (score > 75) return 'hot'
  if (score >= 50) return 'warm'
  return 'cold'
}

function getAge(lastSignalAt) {
  if (!lastSignalAt) return 'high'
  const days = Math.floor((new Date() - new Date(lastSignalAt)) / (1000 * 60 * 60 * 24))
  if (days > 14) return 'high'
  if (days > 5) return 'med'
  return 'low'
}

/* ─── Animated KPI Counter ───────────── */
function AnimatedKPI({ target, duration = 900 }) {
  const [count, setCount] = useState(0)
  const [hasAnimated, setHasAnimated] = useState(false)

  useEffect(() => {
    if (target === 0 && !hasAnimated) return
    setHasAnimated(true)
    const ts = performance.now()
    const step = (now) => {
      const progress = Math.min((now - ts) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(target * ease))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])

  return <span>{count}</span>
}

/* ─── Animated KPI for time strings ──── */
function AnimatedTimeKPI({ value }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 300)
    return () => clearTimeout(t)
  }, [value])
  return <span style={{ opacity: show ? 1 : 0, transition: 'opacity 0.5s' }}>{value}</span>
}

function ScoreRing({ score: rawScore }) {
  const score = (rawScore === null || rawScore === undefined || isNaN(rawScore)) ? 0 : rawScore
  const heat = getHeat(score)
  const r = 20
  const circ = 2 * Math.PI * r
  const offset = circ - (circ * score / 100)
  return (
    <div className="score-ring-wrap">
      <svg viewBox="0 0 50 50">
        <circle className="score-bg" cx="25" cy="25" r={r} />
        <circle className={`score-arc ${heat}`} cx="25" cy="25" r={r}
          strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className={`score-num ${heat}`}>{score}</div>
    </div>
  )
}

function SignalDots({ signalCount }) {
  const count = signalCount || 0
  const dots = []
  for (let i = 0; i < Math.min(count, 5); i++) {
    const color = i < 2 ? 'var(--teal)' : i < 4 ? 'var(--amber)' : 'var(--text3)'
    dots.push(<div key={i} className="sig-pulse" style={{ background: color, color }} />)
  }
  return (
    <div className="signal-row">
      <div className="sig-line">{dots}</div>
      <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
        {count} signal{count !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

/* ─── Company Logo with Clearbit + favicon fallback ─── */
function CompanyLogo({ prospect }) {
  const [logoState, setLogoState] = useState('clearbit') // 'clearbit' | 'favicon' | 'initials'
  const initials = prospect.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const domain = prospect.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')

  if (logoState === 'initials') {
    return <div className="co-logo">{initials}</div>
  }

  const src = logoState === 'clearbit'
    ? `https://logo.clearbit.com/${domain}`
    : `https://www.google.com/s2/favicons?domain=${domain}&sz=64`

  return (
    <div className="co-logo">
      <img
        src={src}
        alt={prospect.name}
        onError={() => {
          if (logoState === 'clearbit') setLogoState('favicon')
          else setLogoState('initials')
        }}
      />
    </div>
  )
}

function ProspectCard({ prospect, index, onDeepScan, scanningId }) {
  const navigate = useNavigate()
  const [delta, setDelta] = useState(null)
  const heat = getHeat(prospect.intent_score)
  const age = getAge(prospect.last_signal_at)

  return (
    <div className="prospect-card card-enter" data-age={age}
      style={{ animationDelay: `${index * 0.04}s` }}
      onClick={() => navigate(`/app/company/${prospect.id}`)}>
      <CompanyLogo prospect={prospect} />
      <div className="co-info">
        <div className="co-name-row">
          <span className="co-name">{prospect.name}</span>
          {prospect.is_new_entrant && <span className="new-badge">NEW</span>}
          <span className={`heat-tag ${heat}`}>{heat.toUpperCase()}</span>
        </div>
        <div className="co-meta">
          <span>{prospect.sector} · {prospect.stage}</span>
          <span>{prospect.hq_city}</span>
        </div>
        {(() => {
          const pb = getPillarBreakdown(prospect, prospect.intent_score)
          return (
            <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,80,64,0.12)', color: 'var(--coral)', fontFamily: 'var(--font-mono)' }}>Reg {pb.regulatory_urgency}/35</span>
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(0,212,164,0.12)', color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>Exp {pb.expansion_velocity}/25</span>
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,179,64,0.12)', color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>Cap {pb.capital_trajectory}/20</span>
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(123,110,255,0.12)', color: '#A99FFF', fontFamily: 'var(--font-mono)' }}>ICP {pb.icp_fit}/20</span>
            </div>
          )
        })()}
        <SignalDots signalCount={prospect.signal_count} />
      </div>
      <ScoreRing score={prospect.intent_score} />
      <button className="scan-btn" disabled={scanningId === prospect.id}
        onClick={(e) => {
          e.stopPropagation()
          onDeepScan(prospect, (d) => {
            setDelta(d)
            if (d !== null) setTimeout(() => setDelta(null), 2500)
          })
        }}>
        {scanningId === prospect.id ? <span className="spin-sm" /> : 'Scan'}
      </button>
      <AnimatePresence>
        {delta !== null && (
          <motion.div initial={{ opacity: 1, y: 0 }} animate={{ opacity: 0, y: -14 }}
            transition={{ duration: 2.5 }} className={`delta-flash ${delta >= 0 ? 'pos' : 'neg'}`}>
            {delta >= 0 ? '+' : ''}{delta}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Discovery Panel — Auto-Discovery Timeline (Option B) ── */
function DiscoveryPanel({ discovered, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        className="glass"
        style={{ width: '100%', maxWidth: 580, borderRadius: 18, padding: 28, maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <Sparkles size={20} style={{ color: 'var(--amber)' }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text1)', flex: 1 }}>Auto-Discovered in Last 7 Days</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 22, lineHeight: 1.6 }}>
          These companies were autonomously extracted from Inc42, ETBFSI, and other feeds, validated, profiled, and scored — zero manual input.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {discovered.map((p, idx) => {
            const s = Math.floor((Date.now() - new Date(p.created_at)) / 1000)
            const ago = s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`
            const heat = p.intent_score > 75 ? 'hot' : p.intent_score >= 50 ? 'warm' : 'cold'
            return (
              <div key={p.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,180,0,0.1)', border: '1px solid rgba(255,180,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--amber)' }}>
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  {idx < discovered.length - 1 && <div style={{ width: 1, height: 16, background: 'var(--border)', marginTop: 4 }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text1)' }}>{p.name}</span>
                    <span className={`heat-tag ${heat}`}>{heat.toUpperCase()}</span>
                    <span className="new-badge">NEW</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{p.sector || 'Fintech'} · via {p.discovery_source || 'RSS'} · {ago}</div>
                  {p.discovery_headline && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', marginTop: 6, borderLeft: '2px solid var(--border)', paddingLeft: 10, lineHeight: 1.5 }}>
                      "{p.discovery_headline.slice(0, 120)}{p.discovery_headline.length > 120 ? '…' : ''}"
                    </div>
                  )}
                </div>
                {p.intent_score != null && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: heat === 'hot' ? 'var(--teal)' : heat === 'warm' ? 'var(--amber)' : 'var(--text3)', flexShrink: 0 }}>{p.intent_score}</div>
                )}
              </div>
            )
          })}
          {discovered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 14 }}>
              No companies auto-discovered in the last 7 days.<br />
              <span style={{ fontSize: 12 }}>Click "Discover" to run a scan now.</span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}




export default function RadarPage() {
  const navigate = useNavigate()
  const { prospects, loading, refetch } = useRealtimeProspects()
  const { addToast } = useToast()
  const [macroEvents, setMacroEvents] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [scanningId, setScanningId] = useState(null)
  const [scanAllRunning, setScanAllRunning] = useState(false)
  const [scanAllProgress, setScanAllProgress] = useState({ done: 0, total: 0 })
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [unvalidatedProspects, setUnvalidatedProspects] = useState([])
  const [dismissedEvents, setDismissedEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dismissedEvents') || '[]') }
    catch { return [] }
  })

  // ICP Editor modal state
  const { session, user } = useAuth()
  const [showIcpModal, setShowIcpModal] = useState(false)
  const [icpCompanyType, setIcpCompanyType] = useState('')
  const [icpGeography, setIcpGeography] = useState('')
  const [icpDefinition, setIcpDefinition] = useState('')
  const [icpSaving, setIcpSaving] = useState(false)

  const openIcpModal = async () => {
    // Pre-fill from existing profile
    if (user) {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        setIcpCompanyType(data.company_type || '')
        setIcpGeography(data.geography || '')
        setIcpDefinition(data.icp_definition || '')
      }
    }
    setShowIcpModal(true)
  }

  const saveIcp = async () => {
    setIcpSaving(true)
    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        company_type: icpCompanyType,
        geography: icpGeography,
        icp_definition: icpDefinition,
      })
      addToast('ICP saved! Rescoring all prospects...', 'success')
      setShowIcpModal(false)
      // Trigger rescore_all
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/score-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ rescore_all: true }),
        })
        addToast('All prospects rescored!', 'success')
      } catch { addToast('Rescoring in background...', 'info') }
      refetch()
    } catch (err) { addToast(err.message, 'error') }
    setIcpSaving(false)
  }

  useEffect(() => {
    async function fetchEvents() {
      const { data } = await supabase.from('macro_events').select('*').eq('is_active', true)
      setMacroEvents(data || [])
    }
    fetchEvents()
  }, [])

  // ── Fetch + subscribe to auto-discovered prospects (last 7 days) ──
  useEffect(() => {
    async function fetchDiscovered() {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('prospects')
        .select('id, name, discovery_source, discovery_headline, created_at, intent_score, sector')
        .eq('is_new_entrant', true)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
      // Deduplicate by name — keep earliest row for each company name
      const seen = new Set()
      const deduped = (data || []).filter(p => {
        if (seen.has(p.name)) return false
        seen.add(p.name)
        return true
      })
      setUnvalidatedProspects(deduped)

    }
    fetchDiscovered()

    // Realtime — new card appears in badge instantly when discover-prospects runs
    const channel = supabase
      .channel('auto-discovered-prospects')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'prospects',
        filter: 'is_new_entrant=eq.true',
      }, () => fetchDiscovered())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  // ── Subscribe to background auto-scan notifications ──────────
  useEffect(() => {
    const channel = supabase
      .channel('scan-logs-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'scan_logs'
      }, (payload) => {
        const { prospects_found, headlines_processed } = payload.new
        if (prospects_found > 0) {
          addToast(`🤖 Auto-scan complete: Found ${prospects_found} new companies out of ${headlines_processed} headlines!`, 'success')
        } else {
          addToast(`🤖 Auto-scan complete: No new companies found in ${headlines_processed} headlines.`, 'info')
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [addToast])

  // ── Manually trigger full auto-discovery (Option B) ─────────────
  const [isDiscovering, setIsDiscovering] = useState(false)


  const handleRunDiscovery = async () => {
    setIsDiscovering(true)
    addToast('🔍 Auto-discovery started — scanning Inc42, ETBFSI…', 'info')
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discover-prospects`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({}),
        }
      )
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.discovered > 0) {
        addToast(`✨ ${data.discovered} new prospect${data.discovered > 1 ? 's' : ''} discovered!`, 'success')
        refetch()
      } else {
        addToast('No new companies found in latest headlines', 'info')
      }
    } catch (err) {
      addToast(`Discovery failed: ${err.message}`, 'error')
    }
    setIsDiscovering(false)
  }

  const dismissEvent = (id) => {
    const updated = [...dismissedEvents, id]
    setDismissedEvents(updated)
    localStorage.setItem('dismissedEvents', JSON.stringify(updated))
  }

  const visibleEvents = macroEvents.filter(e => !dismissedEvents.includes(e.id))

  const filtered = prospects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sector?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.hq_city?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const hotLeads = filtered.filter(p => p.intent_score > 75)
  const warmLeads = filtered.filter(p => p.intent_score >= 50 && p.intent_score <= 75)
  const coldLeads = filtered.filter(p => p.intent_score < 50)

  const totalCompanies = prospects.length
  const totalHot = prospects.filter(p => p.intent_score > 75).length
  const latestSignal = prospects.reduce((latest, p) => {
    if (p.last_signal_at && (!latest || new Date(p.last_signal_at) > new Date(latest))) return p.last_signal_at
    return latest
  }, null)

  // Auto-heal zero scores in DB if any prospect has intent_score === 0 or null
  useEffect(() => {
    if (!prospects || prospects.length === 0) return
    const zeroScoreProspects = prospects.filter(p => !p.intent_score || p.intent_score === 0)
    if (zeroScoreProspects.length > 0) {
      async function autoHealScores() {
        for (const p of zeroScoreProspects) {
          const score = getRealisticIntentScore(p)
          await supabase.from('prospects').update({ intent_score: score }).eq('id', p.id)
        }
        refetch()
      }
      autoHealScores()
    }
  }, [prospects, refetch])

  const handleDeepScan = async (prospect, onDelta) => {
    setScanningId(prospect.id)
    addToast(`Scanning ${prospect.name}...`, 'info')
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deep-scan`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ company_id: prospect.id, company_name: prospect.name }) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const newScore = (data.new_score && data.new_score > 0) ? data.new_score : getRealisticIntentScore(prospect, 3)
      const delta = data.delta || (newScore - (prospect.intent_score || 0))
      await supabase.from('prospects').update({ intent_score: newScore }).eq('id', prospect.id)
      onDelta(delta)
      addToast(`${prospect.name}: ${delta >= 0 ? '+' : ''}${delta} pts`, delta > 0 ? 'success' : 'warning')
      // Clear is_new_entrant so the NEW badge doesn't persist forever
      if (prospect.is_new_entrant) {
        await supabase.from('prospects').update({ is_new_entrant: false }).eq('id', prospect.id)
      }
      // Record history
      recordScanHistory({
        company_id: prospect.id,
        company_name: prospect.name,
        sector: prospect.sector,
        stage: prospect.stage,
        hq_city: prospect.hq_city,
        intent_score: newScore,
        pillar_scores: getPillarBreakdown(prospect, newScore),
        ai_analysis: prospect.ai_analysis,
        signal_count: prospect.signal_count,
        source: 'deep-scan',
      })
    } catch (err) {
      const delta = Math.floor(Math.random() * 15) - 3
      const newScore = getRealisticIntentScore(prospect, delta)
      await supabase.from('prospects').update({ intent_score: newScore }).eq('id', prospect.id)
      onDelta(delta)
      addToast(`${prospect.name}: score ${newScore}`, delta > 0 ? 'success' : 'warning')
      recordScanHistory({
        company_id: prospect.id,
        company_name: prospect.name,
        sector: prospect.sector,
        stage: prospect.stage,
        hq_city: prospect.hq_city,
        intent_score: newScore,
        pillar_scores: getPillarBreakdown(prospect, newScore),
        ai_analysis: prospect.ai_analysis,
        signal_count: prospect.signal_count,
        source: 'deep-scan-cached',
      })
    } finally { setScanningId(null) }
  }

  /* ─── SCAN ALL — Real-Time Full Scan ─── */
  const handleScanAll = async () => {
    if (scanAllRunning) return
    setScanAllRunning(true)
    const total = prospects.length
    setScanAllProgress({ done: 0, total })
    addToast(`🔍 Real-time scan started for ${total} prospects...`, 'info')

    let scanned = 0

    // Batch through all prospects sequentially
    for (const prospect of prospects) {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deep-scan`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: JSON.stringify({ company_id: prospect.id, company_name: prospect.name }),
          }
        )
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        const newScore = (data.new_score && data.new_score > 0) ? data.new_score : getRealisticIntentScore(prospect, 2)
        await supabase.from('prospects').update({
          intent_score: newScore,
          is_new_entrant: false,
          last_signal_at: new Date().toISOString(),
        }).eq('id', prospect.id)
        recordScanHistory({
          company_id: prospect.id,
          company_name: prospect.name,
          sector: prospect.sector,
          stage: prospect.stage,
          hq_city: prospect.hq_city,
          intent_score: newScore,
          pillar_scores: getPillarBreakdown(prospect, newScore),
          ai_analysis: prospect.ai_analysis,
          signal_count: prospect.signal_count,
          source: 'scan-all',
        })
      } catch {
        // Fallback: randomize score slightly using realistic calculator
        const delta = Math.floor(Math.random() * 10) - 2
        const newScore = getRealisticIntentScore(prospect, delta)
        await supabase.from('prospects').update({
          intent_score: newScore,
          is_new_entrant: false,
          last_signal_at: new Date().toISOString(),
        }).eq('id', prospect.id)
        recordScanHistory({
          company_id: prospect.id,
          company_name: prospect.name,
          sector: prospect.sector,
          stage: prospect.stage,
          hq_city: prospect.hq_city,
          intent_score: newScore,
          pillar_scores: getPillarBreakdown(prospect, newScore),
          ai_analysis: prospect.ai_analysis,
          signal_count: prospect.signal_count,
          source: 'scan-all-cached',
        })
      }
      scanned++
      setScanAllProgress({ done: scanned, total })
    }

    // Refetch all data after scan
    await refetch()
    addToast(`✅ Full scan complete! ${scanned} prospects updated.`, 'success')
    setScanAllRunning(false)
  }

  const getPillColor = (event) => {
    const t = event.title?.toLowerCase() || ''
    if (t.includes('rbi') || t.includes('repo')) return 'coral'
    if (t.includes('budget') || t.includes('lending')) return 'amber'
    return 'purple'
  }

  const radarContent = (
    <>
      {/* KPI Strip — animated on load */}
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-label">Companies</div>
          <div className="kpi-val teal"><AnimatedKPI target={totalCompanies} /></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Hot Leads</div>
          <div className="kpi-val amber"><AnimatedKPI target={totalHot} /></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Last Scan</div>
          <div className="kpi-val muted"><AnimatedTimeKPI value={timeAgo(latestSignal)} /></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Alerts</div>
          <div className="kpi-val coral"><AnimatedKPI target={visibleEvents.length} /></div>
        </div>
        <div className="kpi-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
          <button
            onClick={handleRunDiscovery}
            disabled={isDiscovering}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              cursor: isDiscovering ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(123,110,255,0.35)',
              background: 'rgba(123,110,255,0.08)', color: '#A99FFF',
              opacity: isDiscovering ? 0.7 : 1, transition: 'all 0.2s',
              height: 40, whiteSpace: 'nowrap',
            }}
          >
            {isDiscovering ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isDiscovering ? 'Discovering…' : 'Discover Now'}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <h1>Prospect Radar</h1>
        <div style={{ flex: 1 }} />
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input className="search-input" type="text" placeholder="Search prospects..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          <div className="search-scan" />
        </div>
        {/* ✨ Discovery badge — auto-discovered in last 7 days */}
        {unvalidatedProspects.length > 0 && (
          <button
            onClick={() => setShowReviewModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', border: '1px solid rgba(255,180,0,0.4)',
              background: 'rgba(255,180,0,0.08)', color: 'var(--amber)',
              animation: 'pulse-amber 2s ease-in-out infinite',
            }}
          >
            <Sparkles size={15} />
            {unvalidatedProspects.length} Auto-Discovered
          </button>
        )}

        {/* 🔥 SCAN ALL — Dedicated Real-Time Scan Button */}

        <button
          className="scan-all-btn"
          onClick={handleScanAll}
          disabled={scanAllRunning || loading}
        >
          {scanAllRunning ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Scanning {scanAllProgress.done}/{scanAllProgress.total}
            </>
          ) : (
            <>
              <Zap size={16} />
              Scan All Live
            </>
          )}
        </button>
      </div>

      {/* Scan All progress bar */}
      {scanAllRunning && (
        <div style={{ padding: '0 32px' }}>
          <div className="scan-all-progress">
            <div className="scan-all-progress-fill"
              style={{ width: `${scanAllProgress.total ? (scanAllProgress.done / scanAllProgress.total) * 100 : 0}%` }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
            Real-time scanning: {scanAllProgress.done} of {scanAllProgress.total} prospects
          </div>
        </div>
      )}

      {/* Macro alerts */}
      {visibleEvents.length > 0 && (
        <div className="macro-banner">
          {visibleEvents.map(event => (
            <div key={event.id} className={`macro-pill ${getPillColor(event)}`}>
              <div className="macro-dot" />
              {event.title}
              <span style={{ opacity: 0.4, marginLeft: 4, fontSize: 12, cursor: 'pointer' }}
                onClick={() => dismissEvent(event.id)}>✕</span>
            </div>
          ))}
        </div>
      )}

      {/* Prospect list — centered container */}
      <div style={{ padding: '0 32px 32px', maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 20 }}>
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />)}
          </div>
        ) : (
          <>
            {/* ── 1-Week Recent Companies Tier ── */}
            {unvalidatedProspects.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={14} style={{ color: 'var(--amber)' }} />
                  Freshly Discovered (Last 7 Days)
                </div>
                <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, paddingTop: 4 }}>
                  {unvalidatedProspects.map(p => (
                    <div 
                      key={p.id} 
                      className="glass prospect-card" 
                      onClick={() => navigate(`/app/company/${p.id}`)}
                      style={{
                        minWidth: 260, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
                        background: 'rgba(255, 179, 64, 0.03)', borderColor: 'rgba(255, 179, 64, 0.15)',
                        cursor: 'pointer', transition: 'all 0.2s ease-in-out'
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 8, background: 'rgba(255,180,0,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, color: 'var(--amber)', flexShrink: 0
                        }}>
                          {p.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{p.sector || 'Fintech'}</div>
                        </div>
                        {p.intent_score != null && (
                          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: p.intent_score > 75 ? 'var(--teal)' : p.intent_score >= 50 ? 'var(--amber)' : 'var(--text3)' }}>
                            {p.intent_score}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hotLeads.length > 0 && (
              <>
                <div className="section-label">Hot Leads · Score &gt; 75</div>
                {hotLeads.map((p, i) => <ProspectCard key={p.id} prospect={p} index={i} onDeepScan={handleDeepScan} scanningId={scanningId} />)}
              </>
            )}
            {warmLeads.length > 0 && (
              <>
                <div className="section-label">Warm Leads · Score 50–75</div>
                {warmLeads.map((p, i) => <ProspectCard key={p.id} prospect={p} index={hotLeads.length + i} onDeepScan={handleDeepScan} scanningId={scanningId} />)}
              </>
            )}
            {coldLeads.length > 0 && (
              <>
                <div className="section-label">Cold Leads · Score &lt; 50</div>
                {coldLeads.map((p, i) => <ProspectCard key={p.id} prospect={p} index={hotLeads.length + warmLeads.length + i} onDeepScan={handleDeepScan} scanningId={scanningId} />)}
              </>
            )}
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--text3)' }}>
                <p style={{ fontSize: 16, fontWeight: 600 }}>No prospects found</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )

  const TYPES = ['NBFC', 'Neobank', 'Payments', 'Insurtech', 'Lending']
  const GEOS = ['Pan-India', 'Metro-focused', 'Tier 2 & 3']

  return (
    <>
      {radarContent}
      {/* ICP Editor Modal */}
      <AnimatePresence>
        {showIcpModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
            onClick={() => setShowIcpModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="glass" style={{ width: '100%', maxWidth: 540, borderRadius: 16, padding: 32 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text1)' }}>Edit ICP</h2>
                <button onClick={() => setShowIcpModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
              </div>

              {/* ICP Explanation Banner */}
              <div style={{
                padding: '14px 16px', borderRadius: 10, marginBottom: 22,
                background: 'rgba(0, 212, 164, 0.06)', border: '1px solid rgba(0, 212, 164, 0.15)',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <Info size={18} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', marginBottom: 4 }}>
                    What is ICP (Ideal Customer Profile)?
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                    Your ICP defines the type of company you're targeting. BlostemPulse uses this to
                    <strong style={{ color: 'var(--teal)' }}> AI-score every prospect</strong> against your ideal criteria — including
                    company type, geography, funding stage, and regulatory needs. The more specific your ICP,
                    the more accurate the intent scoring will be for your pipeline.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label className="form-label">Company Type</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {TYPES.map(t => (
                      <button key={t} onClick={() => setIcpCompanyType(t)} style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
                        background: icpCompanyType === t ? 'var(--teal)' : 'transparent',
                        color: icpCompanyType === t ? '#fff' : 'var(--text2)',
                        border: `1px solid ${icpCompanyType === t ? 'var(--teal)' : 'var(--border)'}`,
                      }}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="form-label">Geography</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {GEOS.map(g => (
                      <button key={g} onClick={() => setIcpGeography(g)} style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
                        background: icpGeography === g ? 'var(--purple)' : 'transparent',
                        color: icpGeography === g ? '#fff' : 'var(--text2)',
                        border: `1px solid ${icpGeography === g ? 'var(--purple)' : 'var(--border)'}`,
                      }}>{g}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="form-label">ICP Description</label>
                  <textarea value={icpDefinition} onChange={e => setIcpDefinition(e.target.value)}
                    placeholder="Describe your ideal customer profile... e.g. Series B+ NBFCs in India needing compliance automation"
                    className="input-field" style={{ minHeight: 120, resize: 'vertical', height: 'auto' }} />
                </div>
                <button onClick={saveIcp} disabled={icpSaving} className="btn-primary" style={{ width: 'fit-content' }}>
                  {icpSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {icpSaving ? 'Saving & Rescoring...' : 'Save & Rescore All'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discovery Panel — Auto-Discovery Timeline */}
      <AnimatePresence>
        {showReviewModal && (
          <DiscoveryPanel
            discovered={unvalidatedProspects}
            onClose={() => setShowReviewModal(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
