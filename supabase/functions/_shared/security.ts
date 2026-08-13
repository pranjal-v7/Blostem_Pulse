/**
 * Centralized Security, Sanitization & SSRF Defense Layer
 * Grounded in: OWASP Top 10 API Security, DPDPA 2023, and Prompt Injection Safeguards
 */

// Whitelisted news and regulatory domains for SSRF protection
const ALLOWED_DOMAIN_PATTERNS = [
  "inc42.com",
  "etbfsi.com",
  "yourstory.com",
  "moneycontrol.com",
  "livemint.com",
  "economictimes.indiatimes.com",
  "economictimes.com",
  "entrackr.com",
  "techcrunch.com",
  "vccircle.com",
  "business-standard.com",
  "financialexpress.com",
  "thehindubusinessline.com",
  "medianama.com",
  "cnbctv18.com",
  "businessworld.in",
  "rbi.org.in",
  "sebi.gov.in",
  "npci.org.in",
  "serpapi.com",
];

/**
 * Strips HTML tags, script elements, event handlers, and control characters to prevent XSS.
 */
export function sanitizeText(input: string, maxLength = 1000): string {
  if (!input || typeof input !== "string") return "";

  let clean = input
    // Remove script and style tags completely along with their content
    .replace(/<script\b[^<]*([\s\S]*?)<\/script>/gi, "")
    .replace(/<style\b[^<]*([\s\S]*?)<\/style>/gi, "")
    .replace(/<iframe\b[^<]*([\s\S]*?)<\/iframe>/gi, "")
    // Remove all HTML tags
    .replace(/<[^>]*>/g, "")
    // Remove event handlers like onerror=, onclick=
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    // Remove null bytes and invisible control characters
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();

  if (clean.length > maxLength) {
    clean = clean.slice(0, maxLength) + "…";
  }

  return clean;
}

/**
 * Sanitizes input text before feeding into Gemini AI to prevent Prompt Injection attacks.
 */
export function sanitizeForAI(text: string): string {
  if (!text) return "";

  let safeText = sanitizeText(text, 2000);

  // Neutralize common prompt injection trigger phrases
  const injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/gi,
    /system\s+prompt/gi,
    /output\s+(admin|system|secret|api)\s+keys?/gi,
    /you\s+are\n+now\s+a/gi,
    /override\s+safety\s+settings/gi,
  ];

  for (const pattern of injectionPatterns) {
    safeText = safeText.replace(pattern, "[sanitized-text]");
  }

  return safeText;
}

/**
 * SSRF Guard: Validates that external HTTP/HTTPS URLs belong to allowed trusted domains
 * and do NOT target internal IP addresses (e.g. 127.0.0.1, 169.254.169.254, localhost).
 */
export function validateExternalURL(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;

  try {
    const parsed = new URL(urlStr);

    // Only allow HTTP/HTTPS
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Prevent internal loopback / cloud metadata IP ranges
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "169.254.169.254" || // AWS/GCP metadata IP
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return false;
    }

    // Check domain whitelist match
    const isWhitelisted = ALLOWED_DOMAIN_PATTERNS.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain)
    );

    return isWhitelisted;
  } catch (_) {
    return false;
  }
}
