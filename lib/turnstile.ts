const CLOUDFLARE_SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Cloudflare's officially documented test secret keys.
 * Used for development testing; strictly prohibited in production.
 */
const CLOUDFLARE_DOCUMENTED_TEST_SECRETS = new Set([
  '1x0000000000000000000000000000000AA', // Always passes
  '2x0000000000000000000000000000000AB', // Always fails
  '3x0000000000000000000000000000000AA', // Yields interactive challenge
])

export type TurnstileVerificationResult = {
  success: boolean
  message?: string
}

export type VerifyTurnstileOptions = {
  token: string | null | undefined
  clientIp?: string
  expectedAction?: string
}

/**
 * Computes the set of trusted hostnames.
 * Strictly limits production to 4rinlabs.com and www.4rinlabs.com.
 * Only allows localhost/127.0.0.1 in non-production environments.
 * 
 * In Vercel preview/staging environments (VERCEL_ENV === 'preview'):
 * Wildcard *.vercel.app is deliberately NOT permitted. Only hostnames explicitly
 * configured in ALLOWED_PREVIEW_HOSTNAMES (comma-separated list) are accepted.
 */
function getAllowedHostnames(isProduction: boolean): Set<string> {
  const allowed = new Set<string>(['4rinlabs.com', 'www.4rinlabs.com'])

  const isVercelPreview = process.env.VERCEL_ENV === 'preview'

  if (!isProduction) {
    allowed.add('localhost')
    allowed.add('127.0.0.1')
  }

  // Safe preview/staging configuration: only explicitly approved hostnames are permitted
  if (!isProduction || isVercelPreview) {
    const rawPreviewHostnames = process.env.ALLOWED_PREVIEW_HOSTNAMES?.split(',')
    if (rawPreviewHostnames) {
      for (const raw of rawPreviewHostnames) {
        const trimmed = raw.trim().toLowerCase()
        // Hostname syntax check: non-empty, alphanumeric + hyphens + dots, no wildcards
        if (trimmed && /^[a-z0-9.-]+$/.test(trimmed) && !trimmed.includes('*')) {
          allowed.add(trimmed)
        }
      }
    }
  }

  // Safely validate NEXT_PUBLIC_SITE_URL if configured
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (siteUrl) {
    try {
      const parsedUrl = new URL(siteUrl)
      const siteHostname = parsedUrl.hostname.toLowerCase()
      // Only permit if it matches the legitimate domain or localhost in dev
      if (
        siteHostname === '4rinlabs.com' ||
        siteHostname.endsWith('.4rinlabs.com') ||
        ((!isProduction || isVercelPreview) && (siteHostname === 'localhost' || siteHostname === '127.0.0.1'))
      ) {
        allowed.add(siteHostname)
      } else {
        console.warn(`Untrusted hostname configured in NEXT_PUBLIC_SITE_URL (${siteHostname}); ignoring.`)
      }
    } catch {
      // Invalid URL format; ignore safely
    }
  }

  return allowed
}

/**
 * Validates a Cloudflare Turnstile token on the server side.
 * Fails safely if production credentials or origins are misconfigured.
 */
export async function verifyTurnstileToken({
  token,
  clientIp,
  expectedAction = 'contact_form',
}: VerifyTurnstileOptions): Promise<TurnstileVerificationResult> {
  const isProduction = process.env.NODE_ENV === 'production'
  let secretKey = process.env.TURNSTILE_SECRET_KEY?.trim()

  // Production check: Reject if secret is missing or using documented test keys
  if (isProduction) {
    if (!secretKey) {
      console.error('SECURITY ALERT: TURNSTILE_SECRET_KEY is missing in production.')
      return {
        success: false,
        message: 'Security verification failed due to configuration. Please contact support.',
      }
    }
    if (CLOUDFLARE_DOCUMENTED_TEST_SECRETS.has(secretKey)) {
      console.error('SECURITY ALERT: Documented Cloudflare test secret key is active in production environment.')
      return {
        success: false,
        message: 'Security verification failed due to configuration. Please contact support.',
      }
    }
  } else {
    // Development fallback to official Cloudflare test key if not explicitly set
    if (!secretKey) {
      secretKey = '1x0000000000000000000000000000000AA'
    }
  }

  // Token presence check
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return {
      success: false,
      message: 'Please complete the verification check before submitting.',
    }
  }

  try {
    const formData = new URLSearchParams()
    formData.append('secret', secretKey)
    formData.append('response', token)
    if (clientIp && clientIp !== 'shared-unidentified-client-bucket') {
      formData.append('remoteip', clientIp)
    }

    const response = await fetch(CLOUDFLARE_SITEVERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      console.error(`Turnstile siteverify HTTP error: ${response.status}`)
      return {
        success: false,
        message: 'Unable to verify security challenge. Please try again.',
      }
    }

    const data = await response.json()

    // 1. Success flag verification
    if (!data.success) {
      const errorCodes = (data['error-codes'] as string[]) || []
      console.warn('Turnstile verification failed with codes:', errorCodes)

      if (errorCodes.includes('timeout-or-duplicate')) {
        return {
          success: false,
          message: 'Security token expired or already used. Please refresh and try again.',
        }
      }

      return {
        success: false,
        message: 'Security verification failed. Please try again.',
      }
    }

    // 2. Strict Hostname Validation
    const allowedHostnames = getAllowedHostnames(isProduction)
    const returnedHostname = typeof data.hostname === 'string' ? data.hostname.toLowerCase().trim() : ''

    if (!returnedHostname || !allowedHostnames.has(returnedHostname)) {
      console.warn(
        `Turnstile hostname validation failed: received "${returnedHostname}", allowed: [${Array.from(allowedHostnames).join(', ')}]`,
      )
      return {
        success: false,
        message: 'Security verification failed: invalid origin.',
      }
    }

    // 3. Strict Action Validation (Exact match required; missing or differing values rejected)
    if (expectedAction) {
      if (!data.action || data.action !== expectedAction) {
        console.warn(`Turnstile action mismatch: expected "${expectedAction}", got "${data.action}"`)
        return {
          success: false,
          message: 'Security token mismatch. Please refresh and try again.',
        }
      }
    }

    // 4. Strict Challenge Timestamp Validation
    // - Must be present (non-empty string)
    // - Must be a valid parseable date
    // - Must not be older than 5 minutes (300,000 ms)
    // - Must not be future-dated beyond documented clock-skew tolerance (60,000 ms / 1 minute)
    const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000
    const MAX_TOKEN_AGE_MS = 5 * 60 * 1000

    if (!data.challenge_ts || typeof data.challenge_ts !== 'string' || data.challenge_ts.trim().length === 0) {
      console.warn('Turnstile verification failed: missing challenge_ts timestamp')
      return {
        success: false,
        message: 'Security token invalid: missing challenge timestamp. Please refresh and try again.',
      }
    }

    const challengeTime = new Date(data.challenge_ts).getTime()
    if (isNaN(challengeTime)) {
      console.warn(`Turnstile verification failed: unparseable challenge_ts "${data.challenge_ts}"`)
      return {
        success: false,
        message: 'Security token invalid: unparseable challenge timestamp. Please refresh and try again.',
      }
    }

    const now = Date.now()
    // Stale check: token older than 5 minutes
    if (now - challengeTime > MAX_TOKEN_AGE_MS) {
      console.warn(`Turnstile token expired: age was ${Math.round((now - challengeTime) / 1000)}s (max 300s)`)
      return {
        success: false,
        message: 'Security token expired. Please refresh and try again.',
      }
    }

    // Future-dated check: token timestamp is in the future beyond allowable clock skew
    if (challengeTime - now > CLOCK_SKEW_TOLERANCE_MS) {
      console.warn(
        `Turnstile token future-dated: timestamp is ${Math.round((challengeTime - now) / 1000)}s in future (max tolerance 60s)`,
      )
      return {
        success: false,
        message: 'Security token invalid: timestamp anomaly detected. Please try again.',
      }
    }

    return { success: true }
  } catch (err) {
    console.error('Turnstile verification exception:', err)
    return {
      success: false,
      message: 'Security verification service temporarily unreachable. Please try again.',
    }
  }
}
