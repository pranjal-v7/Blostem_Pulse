// CORS headers for Edge Functions
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Strip markdown fences from AI JSON responses and extract valid JSON.
// Gemini often wraps in ``` or adds preamble text before/after the JSON.
export function parseJSON(text: string) {
  // Step 1: strip markdown fences
  let clean = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  // Step 2: try direct parse
  try {
    return JSON.parse(clean)
  } catch (_) {
    // Step 3: try to extract the first JSON object or array
    const objStart = clean.indexOf('{')
    const arrStart = clean.indexOf('[')

    let start = -1
    let openChar = '{'
    let closeChar = '}'

    if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
      start = objStart
      openChar = '{'
      closeChar = '}'
    } else if (arrStart >= 0) {
      start = arrStart
      openChar = '['
      closeChar = ']'
    }

    if (start >= 0) {
      // Find the matching closing bracket
      let depth = 0
      let inString = false
      let escape = false
      for (let i = start; i < clean.length; i++) {
        const ch = clean[i]
        if (escape) { escape = false; continue }
        if (ch === '\\' && inString) { escape = true; continue }
        if (ch === '"' && !escape) { inString = !inString; continue }
        if (inString) continue
        if (ch === openChar) depth++
        if (ch === closeChar) depth--
        if (depth === 0) {
          return JSON.parse(clean.slice(start, i + 1))
        }
      }
    }

    throw new Error(`parseJSON: could not extract valid JSON from AI response: ${clean.slice(0, 200)}`)
  }
}
