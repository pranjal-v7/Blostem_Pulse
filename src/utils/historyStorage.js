import { supabase } from '../lib/supabase'

const HISTORY_KEY = 'blostempulse_scan_history_v1'

/**
 * Saves a scan log record to localStorage and Supabase scan_history table (if accessible).
 */
export async function recordScanHistory({
  company_id,
  company_name,
  sector,
  stage,
  hq_city,
  intent_score,
  pillar_scores,
  ai_analysis,
  signal_count,
  source = 'deep-scan',
}) {
  const timestamp = new Date().toISOString()

  const entry = {
    id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    company_id,
    company_name,
    sector: sector || 'Fintech',
    stage: stage || 'Unknown',
    hq_city: hq_city || 'India',
    scanned_at: timestamp,
    intent_score: Number(intent_score) || 0,
    pillar_scores: pillarScoresOrDefault(pillar_scores, intent_score),
    ai_analysis: ai_analysis || null,
    signal_count: Number(signal_count) || 0,
    source,
  }

  // 1. Save to LocalStorage
  try {
    const existing = getLocalHistory()
    const updated = [entry, ...existing]
    // Keep max 200 history items locally
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated.slice(0, 200)))
  } catch (err) {
    console.warn('LocalStorage save history error:', err)
  }

  // 2. Try saving to Supabase scan_history (best-effort)
  try {
    await supabase.from('scan_history').insert({
      company_id,
      company_name,
      scanned_at: timestamp,
      intent_score: entry.intent_score,
      pillar_scores: entry.pillar_scores,
      ai_analysis: entry.ai_analysis,
      signal_count: entry.signal_count,
      source,
    })
  } catch (_) {
    // Non-fatal if table not created
  }

  return entry
}

/**
 * Returns raw array of all local scan history entries.
 */
export function getLocalHistory() {
  try {
    const data = localStorage.getItem(HISTORY_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

/**
 * Retrieves the latest scan record for a company (used when API quota is reached).
 */
export function getLatestScanHistory(companyIdOrName) {
  const history = getLocalHistory()
  if (!history || history.length === 0) return null

  const key = String(companyIdOrName).toLowerCase().trim()
  return history.find(
    h => (h.company_id && String(h.company_id).toLowerCase() === key) ||
         (h.company_name && h.company_name.toLowerCase().trim() === key)
  ) || null
}

/**
 * Returns deduplicated companies with their chronological scan history.
 */
export function getDeduplicatedHistory(searchQuery = '') {
  const history = getLocalHistory()
  const q = searchQuery.toLowerCase().trim()

  const companyMap = new Map()

  for (const log of history) {
    const key = (log.company_name || log.company_id || 'Unknown').toLowerCase().trim()

    if (q) {
      const matchesName = (log.company_name || '').toLowerCase().includes(q)
      const matchesSector = (log.sector || '').toLowerCase().includes(q)
      const matchesCity = (log.hq_city || '').toLowerCase().includes(q)
      if (!matchesName && !matchesSector && !matchesCity) continue
    }

    if (!companyMap.has(key)) {
      companyMap.set(key, {
        company_id: log.company_id,
        company_name: log.company_name,
        sector: log.sector,
        stage: log.stage,
        hq_city: log.hq_city,
        latest_score: log.intent_score,
        latest_scanned_at: log.scanned_at,
        latest_pillar_scores: log.pillar_scores,
        latest_ai_analysis: log.ai_analysis,
        total_scans: 1,
        scan_logs: [log],
      })
    } else {
      const comp = companyMap.get(key)
      comp.total_scans += 1
      comp.scan_logs.push(log)
    }
  }

  return Array.from(companyMap.values()).sort((a, b) => new Date(b.latest_scanned_at) - new Date(a.latest_scanned_at))
}

/**
 * Groups scan logs Date-Wise (Today, Yesterday, This Week, Older).
 */
export function getScanHistoryGroupedByDate(searchQuery = '') {
  const deduped = getDeduplicatedHistory(searchQuery)
  const now = new Date()

  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfThisWeek = new Date(startOfToday)
  startOfThisWeek.setDate(startOfThisWeek.getDate() - 7)

  for (const comp of deduped) {
    const scanDate = new Date(comp.latest_scanned_at)
    if (scanDate >= startOfToday) {
      groups.today.push(comp)
    } else if (scanDate >= startOfYesterday) {
      groups.yesterday.push(comp)
    } else if (scanDate >= startOfThisWeek) {
      groups.thisWeek.push(comp)
    } else {
      groups.older.push(comp)
    }
  }

  return groups
}

function pillarScoresOrDefault(pillars, totalScore) {
  if (pillars && typeof pillars === 'object' && pillars.regulatory_urgency) {
    return pillars
  }
  const score = Number(totalScore) || 70
  return {
    regulatory_urgency: Math.min(35, Math.round(score * 0.35)),
    expansion_velocity: Math.min(25, Math.round(score * 0.25)),
    capital_trajectory: Math.min(20, Math.round(score * 0.20)),
    icp_fit: Math.min(20, Math.round(score * 0.20)),
  }
}
