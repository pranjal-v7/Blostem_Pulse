/**
 * Client-Side Security & Sanitization Helper
 */

export function sanitizeClientText(text, maxLength = 500) {
  if (!text || typeof text !== 'string') return ''
  let clean = text
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/javascript:/gi, '')
    .replace(/\0/g, '')
    .trim()

  if (clean.length > maxLength) {
    clean = clean.slice(0, maxLength) + '…'
  }
  return clean
}

export function isSafeHttpUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false
  try {
    const parsed = new URL(urlStr)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
