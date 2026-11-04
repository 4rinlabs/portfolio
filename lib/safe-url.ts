/**
 * Utilities for strictly validating and sanitizing external URLs.
 *
 * Restricts URLs strictly to `http:` and `https:` schemes to prevent
 * Cross-Site Scripting (XSS) via `javascript:`, `data:`, `vbscript:`, or malformed protocols.
 */

/**
 * Checks whether a given string is a valid HTTP or HTTPS URL.
 * Rejects `javascript:`, `data:`, `file:`, `vbscript:`, and protocol-relative `//` URLs.
 */
export function isValidHttpUrl(urlString: string): boolean {
  if (!urlString || typeof urlString !== 'string') return false
  const trimmed = urlString.trim()

  // Strict regex check for http:// or https:// prefix
  if (!/^https?:\/\//i.test(trimmed)) {
    return false
  }

  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Sanitizes an external URL for safe rendering into `<a href="...">` attributes.
 *
 * Returns the valid URL string if it uses `http:` or `https:`.
 * Returns `undefined` if the URL is missing, invalid, or uses an unauthorized protocol.
 */
export function sanitizeExternalUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== 'string') return undefined
  const trimmed = url.trim()
  if (!isValidHttpUrl(trimmed)) {
    return undefined
  }
  return trimmed
}
