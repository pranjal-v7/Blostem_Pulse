import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getScanHistoryGroupedByDate, getDeduplicatedHistory } from '../utils/historyStorage'
import { useToast } from '../components/Toast'
import {
  History, Search, Clock, ShieldCheck, ShieldAlert, Sparkles,
  ExternalLink, ArrowUpRight, Zap, RefreshCw, ChevronDown, ChevronUp,
  Database, AlertCircle, Building2, TrendingUp, Coins, Target
} from 'lucide-react'

function timeAgo(date) {
  if (!date) return 'Unknown'
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function getHeat(score) {
  if (score > 75) return 'hot'
  if (score >= 50) return 'warm'
  return 'cold'
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCompany, setExpandedCompany] = useState(null)
  const [groupedHistory, setGroupedHistory] = useState({ today: [], yesterday: [], thisWeek: [], older: [] })
  const [totalScanCount, setTotalScanCount] = useState(0)

  useEffect(() => {
    const groups = getScanHistoryGroupedByDate(searchQuery)
    setGroupedHistory(groups)
    const all = getDeduplicatedHistory(searchQuery)
    const count = all.reduce((sum, c) => sum + (c.total_scans || 1), 0)
    setTotalScanCount(count)
  }, [searchQuery])

  const toggleExpand = (companyId) => {
    setExpandedCompany(prev => (prev === companyId ? null : companyId))
  }

  const sections = [
    { title: 'Today', data: groupedHistory.today, icon: Clock, color: 'var(--teal)' },
    { title: 'Yesterday', data: groupedHistory.yesterday, icon: History, color: 'var(--amber)' },
    { title: 'This Week', data: groupedHistory.thisWeek, icon: Sparkles, color: '#A99FFF' },
    { title: 'Older Scans', data: groupedHistory.older, icon: Database, color: 'var(--text3)' },
  ]

  const totalUnique = (groupedHistory.today.length + groupedHistory.yesterday.length + groupedHistory.thisWeek.length + groupedHistory.older.length)

  return (
    <div style={{ padding: '28px 40px', maxWidth: 960, margin: '0 auto', paddingBottom: 100 }}>
      {/* Page Title & Stats */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <History size={24} style={{ color: 'var(--teal)' }} /> Scan History & Quota Vault
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>
            Date-wise historical scan logs with built-in SerpAPI limit protection
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="glass" style={{ padding: '10px 16px', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Total Scans</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{totalScanCount}</div>
          </div>
          <div className="glass" style={{ padding: '10px 16px', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Unique Prospects</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>{totalUnique}</div>
          </div>
        </div>
      </div>

      {/* SerpAPI Quota Protection Banner */}
      <div style={{
        padding: '14px 18px', borderRadius: 12, marginBottom: 24,
        background: 'rgba(0, 212, 164, 0.05)', border: '1px solid rgba(0, 212, 164, 0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck size={20} style={{ color: 'var(--teal)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>
              SerpAPI Quota Protection Active (200 Search Limit Guard)
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
              Cached scores and historical signals are automatically retrieved when live API limits or offline modes trigger.
            </div>
          </div>
        </div>
        <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'var(--teal-glow)', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
          Quota Saver Active
        </span>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', marginBottom: 28 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
        <input
          type="text"
          placeholder="Search history by company name, sector, or city..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="input-field"
          style={{ paddingLeft: 42, height: 44, fontSize: 14 }}
        />
      </div>

      {/* Date-Wise Timeline Sections */}
      {sections.map(sec => {
        if (!sec.data || sec.data.length === 0) return null

        return (
          <div key={sec.title} style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <sec.icon size={16} style={{ color: sec.color }} />
              <h2 style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
                {sec.title} · {sec.data.length} Company{sec.data.length !== 1 ? 'ies' : ''}
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sec.data.map(comp => {
                const isExpanded = expandedCompany === comp.company_id
                const heat = getHeat(comp.latest_score)
                const pb = comp.latest_pillar_scores || {}

                return (
                  <motion.div
                    key={comp.company_id || comp.company_name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass"
                    style={{ borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s', border: '1px solid var(--border)' }}
                  >
                    {/* Company Header Row */}
                    <div
                      onClick={() => toggleExpand(comp.company_id)}
                      style={{
                        padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
                        background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
                      }}
                    >
                      {/* Company Initials Avatar */}
                      <div style={{
                        width: 42, height: 42, borderRadius: 10, background: 'rgba(123,110,255,0.1)',
                        border: '1px solid rgba(123,110,255,0.2)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#A99FFF', flexShrink: 0
                      }}>
                        {(comp.company_name || 'BP').slice(0, 2).toUpperCase()}
                      </div>

                      {/* Company Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <span style={{ fontSize: 16, fontWeight: 600, color: '#ffffff' }}>{comp.company_name}</span>
                          <span className={`heat-tag ${heat}`}>{heat.toUpperCase()}</span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                            {comp.total_scans} scan{comp.total_scans !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{comp.sector}</span>
                          <span>·</span>
                          <span>{comp.stage}</span>
                          <span>·</span>
                          <span>{comp.hq_city}</span>
                          <span>·</span>
                          <span><Clock size={11} style={{ display: 'inline', marginRight: 3 }} /> {timeAgo(comp.latest_scanned_at)}</span>
                        </div>
                      </div>

                      {/* 4-Pillar Mini Badges */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,80,64,0.12)', color: 'var(--coral)', fontFamily: 'var(--font-mono)' }}>
                          Reg {pb.regulatory_urgency || 0}/35
                        </span>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,212,164,0.12)', color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
                          Exp {pb.expansion_velocity || 0}/25
                        </span>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,179,64,0.12)', color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>
                          Cap {pb.capital_trajectory || 0}/20
                        </span>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(123,110,255,0.12)', color: '#A99FFF', fontFamily: 'var(--font-mono)' }}>
                          ICP {pb.icp_fit || 0}/20
                        </span>
                      </div>

                      {/* Intent Score */}
                      <div style={{ textAlign: 'right', minWidth: 55, flexShrink: 0 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: comp.latest_score > 75 ? 'var(--teal)' : comp.latest_score >= 50 ? 'var(--amber)' : 'var(--text3)' }}>
                          {comp.latest_score}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Score</div>
                      </div>

                      {/* Expand Toggle Chevron */}
                      <div style={{ color: 'var(--text3)' }}>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>

                    {/* Expandable Scan Details & Timeline */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          style={{ borderTop: '1px solid var(--border)', padding: '20px', background: 'rgba(0,0,0,0.2)' }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
                            {/* Gemini AI Strategic Pitch */}
                            <div style={{ padding: '14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 6 }}>
                                💡 Saved Strategic Pitch
                              </div>
                              <p style={{ fontSize: 13, color: 'var(--text1)', lineHeight: 1.5 }}>
                                "{comp.latest_ai_analysis?.recommended_pitch || `Pitch Blostem's automated RBI/KYC compliance stack to risk & engineering leads.`}"
                              </p>
                            </div>

                            {/* Buy Window & Regulatory Triggers */}
                            <div style={{ padding: '14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 6 }}>
                                📋 Compliance Triggers & Window
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 500, marginBottom: 4 }}>
                                Buy Window: {comp.latest_ai_analysis?.buy_window || 'Immediate (0-30 days)'}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                                Triggers: {comp.latest_ai_analysis?.regulatory_triggers || 'RBI Digital Lending Guidelines & FLDG Norms'}
                              </div>
                            </div>
                          </div>

                          {/* Historical Scan Logs Timeline */}
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 8 }}>
                              Chronological Scan Logs ({comp.scan_logs?.length || 1})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {comp.scan_logs?.map((log, idx) => (
                                <div key={log.id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text2)' }}>
                                    <Clock size={12} style={{ color: 'var(--teal)' }} />
                                    <span>{new Date(log.scanned_at).toLocaleString()}</span>
                                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'rgba(0,212,164,0.1)', color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
                                      {log.source || 'deep-scan'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: log.intent_score > 75 ? 'var(--teal)' : 'var(--amber)' }}>
                                    {log.intent_score} pts
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Action Button */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                            <button
                              onClick={() => navigate(`/app/company/${comp.company_id}`)}
                              className="btn-primary"
                              style={{ padding: '8px 16px', fontSize: 13 }}
                            >
                              View Full Company Detail <ArrowUpRight size={14} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )
      })}

      {totalUnique === 0 && (
        <div className="glass" style={{ borderRadius: 16, padding: 48, textAlign: 'center' }}>
          <History size={48} style={{ margin: '0 auto 16px', color: 'var(--text3)', opacity: 0.4 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#ffffff', marginBottom: 8 }}>No Scan History Found</h3>
          <p style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 400, margin: '0 auto 20px' }}>
            When you run scans on the Prospect Radar page, your search results and AI scores will automatically be recorded here.
          </p>
          <button onClick={() => navigate('/app/radar')} className="btn-primary">
            Go to Prospect Radar
          </button>
        </div>
      )}
    </div>
  )
}
