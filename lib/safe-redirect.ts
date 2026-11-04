/**
 * Safe Redirect Validation Helper
 * 
 * Protects administrative authentication and navigation from open redirect vulnerabilities.
 * 
 * Rules:
 * 1. Must be a non-empty string without whitespace padding.
 * 2. Reject control characters (CR, LF, tabs, null bytes).
 * 3. Reject dangerous protocols: javascript:, data:, vbscript:, file:, etc.
 * 4. Reject protocol-relative URLs (e.g. //attacker.example).
 * 5. Reject backslash bypasses (e.g. /\\attacker.example, \\attacker.example).
 * 6. Allow safe relative paths (e.g. /admin, /admin/services?tab=active).
 * 7. Allow absolute URLs ONLY if their origin strictly matches the trusted application origin.
 */

export function isSafeRedirectUrl(url: string | null | undefined, baseUrl?: string): boolean {
  if (!url || typeof url !== 'string') return false

  const trimmed = url.trim()
  if (!trimmed) return false

  // Reject control characters (CR, LF, tabs, null bytes)
  if (/[\r\n\t\0]/.test(trimmed)) return false

  // Check for schemes (e.g. javascript:, http:, https:, data:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    // Only http: and https: can even be considered
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return false
    }

    // If no baseUrl is provided to verify against, reject all absolute URLs
    if (!baseUrl) return false

    try {
      const parsedUrl = new URL(trimmed)
      const parsedBase = new URL(baseUrl)
      return parsedUrl.origin.toLowerCase() === parsedBase.origin.toLowerCase()
    } catch {
      return false
    }
  }

  // Reject protocol-relative URLs (//) and backslash bypasses (/\, \\)
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.startsWith('\\')
  ) {
    return false
  }

  // Must begin with a single forward slash
  if (!trimmed.startsWith('/')) {
    return false
  }

  // Reject backslashes in the path portion
  const pathPart = trimmed.split('?')[0].split('#')[0]
  if (pathPart.includes('\\')) {
    return false
  }

  return true
}

/**
 * Returns the provided url if safe, or falls back to defaultUrl.
 */
export function getSafeRedirectUrl(
  url: string | null | undefined,
  defaultUrl = '/admin',
  baseUrl?: string,
): string {
  if (isSafeRedirectUrl(url, baseUrl)) {
    return url!.trim()
  }
  return defaultUrl
}
