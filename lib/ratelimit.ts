import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { prisma } from '@/lib/prisma'

const hasUpstashConfig = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
)

export let redis: Redis | null = hasUpstashConfig
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null

/**
 * Testing hook allowing integration tests to inject an isolated mock Redis client.
 */
export function setRedisForTesting(client: any) {
  redis = client
  cachedClient = null
  cachedLimiters = null
  cachedUploadLimiters = null
}

// ─── Rate Limiters (When Redis is Available) ──────────────────────────────────
let cachedClient: any = null
let cachedLimiters: {
  preVerificationLimiter: Ratelimit
  ipLimiter: Ratelimit
  emailLimiter: Ratelimit
  globalLimiter: Ratelimit
} | null = null

function getActiveLimiters() {
  if (!redis) return null
  if (cachedClient === redis && cachedLimiters) return cachedLimiters

  cachedClient = redis
  cachedLimiters = {
    // 0. Preliminary IP Limiter (Pre-verification): 10 requests per 10 minutes
    // Protects outbound Siteverify from socket exhaustion before verification
    preVerificationLimiter: new Ratelimit({
      redis: redis as any,
      limiter: Ratelimit.slidingWindow(10, '10 m'),
      prefix: 'ratelimit:contact:precheck',
      analytics: false,
    }),
    // 1. Per-IP Submission Limit: 5 requests per 10 minutes
    ipLimiter: new Ratelimit({
      redis: redis as any,
      limiter: Ratelimit.slidingWindow(5, '10 m'),
      prefix: 'ratelimit:contact:ip',
      analytics: false,
    }),
    // 2. Per-Email Submission Limit: 3 requests per 15 minutes
    emailLimiter: new Ratelimit({
      redis: redis as any,
      limiter: Ratelimit.slidingWindow(3, '15 m'),
      prefix: 'ratelimit:contact:email',
      analytics: false,
    }),
    // 3. Global Contact Form Volume: 60 requests per 10 minutes
    globalLimiter: new Ratelimit({
      redis: redis as any,
      limiter: Ratelimit.slidingWindow(60, '10 m'),
      prefix: 'ratelimit:contact:global',
      analytics: false,
    }),
  }
  return cachedLimiters
}

/**
 * Extracts and sanitizes the client IP address from trusted infrastructure headers.
 * 
 * In Vercel serverless deployments:
 * - `x-real-ip` is the primary authoritative header: Vercel's Edge network terminates
 *   the TCP connection, strips incoming client `x-real-ip` headers, and injects the
 *   verified client IP from the socket connection.
 * - `x-forwarded-for` is checked as a fallback for other reverse proxies (using the
 *   leftmost IP only after strict IP format verification).
 * - Non-existent headers like `x-vercel-ip` are NEVER trusted to prevent client-spoofed
 *   header injection attacks.
 * - Never defaults to 127.0.0.1 in production; falls back to an explicitly pooled shared bucket.
 */
export function getClientIp(headersList: Headers): string {
  // 1. Authoritative Vercel edge IP header (sanitized and injected by Vercel edge proxy)
  const realIp = headersList.get('x-real-ip')
  if (realIp && isValidIp(realIp)) return realIp.trim()

  // 2. Secondary proxy header: leftmost hop
  const forwardedFor = headersList.get('x-forwarded-for')
  if (forwardedFor) {
    const candidate = forwardedFor.split(',')[0].trim()
    if (isValidIp(candidate)) return candidate
  }

  // 3. Safe shared fallback bucket for untrusted/unidentified proxies
  return 'shared-unidentified-client-bucket'
}

function isValidIp(ip: string): boolean {
  const trimmed = ip.trim()
  if (!trimmed || trimmed.length > 45) return false
  // IPv4 simple regex or IPv6 basic check
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6 = /^[a-fA-F0-9:]+$/
  return ipv4.test(trimmed) || ipv6.test(trimmed)
}

export type PreCheckResult = {
  success: boolean
  message?: string
}

/**
 * Preliminary IP-based rate limiter executed BEFORE outbound Turnstile Siteverify network calls.
 * 
 * Protects against attackers submitting repeated requests with fake tokens to force
 * unlimited outbound Siteverify requests and exhaust serverless concurrency.
 * 
 * - Atomic under the Redis path (sliding window of 10 requests / 10 minutes per IP).
 * - Operates under a separate namespace ('ratelimit:contact:precheck') to avoid double-counting
 *   against the visitor's legitimate submission allowance (5 requests / 10 minutes).
 * - FAILS CLOSED ON REDIS OUTAGE: If the preliminary rate limiter cannot establish a rate-limit
 *   decision, the submission is rejected with a generic temporary-unavailability response.
 *   This ensures unlimited unmetered outbound Siteverify requests are strictly prevented.
 */
export async function checkPreVerificationRateLimit(ip: string): Promise<PreCheckResult> {
  const activeLimiters = getActiveLimiters()

  if (!redis || !activeLimiters?.preVerificationLimiter) {
    console.warn('Pre-verification rate limiter unavailable: Redis connection not established. Failing closed.')
    return {
      success: false,
      message: 'Our verification service is temporarily unavailable. Please try again in a few minutes or reach out directly at 4rinlabs@gmail.com.',
    }
  }

  try {
    const res = await activeLimiters.preVerificationLimiter.limit(ip)
    if (!res.success) {
      return {
        success: false,
        message: 'Too many verification attempts from this connection. Please try again in a few minutes.',
      }
    }
    return { success: true }
  } catch (err) {
    console.error('Pre-verification rate limiter exception. Failing closed:', err)
    return {
      success: false,
      message: 'Our verification service is temporarily unavailable. Please try again in a few minutes or reach out directly at 4rinlabs@gmail.com.',
    }
  }
}

export type RateLimitResult = {
  success: boolean
  message?: string
  redisAvailable: boolean
}

/**
 * Atomic multi-dimensional rate limiter with safe database fallback.
 */
export async function checkContactRateLimit(
  ip: string,
  email: string,
): Promise<RateLimitResult> {
  const normalizedEmail = email.trim().toLowerCase()

  const activeLimiters = getActiveLimiters()

  if (redis && activeLimiters) {
    try {
      // 1. Check Global limit (60 req / 10 min)
      const globalRes = await activeLimiters.globalLimiter.limit('contact_global')
      if (!globalRes.success) {
        return {
          success: false,
          message: 'Our contact system is experiencing heavy traffic. Please try again shortly.',
          redisAvailable: true,
        }
      }

      // 2. Check IP limit (5 req / 10 min)
      const ipRes = await activeLimiters.ipLimiter.limit(ip)
      if (!ipRes.success) {
        return {
          success: false,
          message: 'Too many requests from this connection. Please try again in a few minutes.',
          redisAvailable: true,
        }
      }

      // 3. Check Email limit (3 req / 15 min)
      const emailRes = await activeLimiters.emailLimiter.limit(normalizedEmail)
      if (!emailRes.success) {
        return {
          success: false,
          message: 'Too many messages sent with this email. Please wait a few minutes before trying again.',
          redisAvailable: true,
        }
      }

      return { success: true, redisAvailable: true }
    } catch (redisError) {
      console.warn('Upstash Redis check failed, falling back to database rate limiting:', redisError)
      // Fall through to database fallback policy
    }
  }

  // ─── Explicit Safe Fallback Policy (When Redis is Unavailable) ───────────────
  //
  // ARCHITECTURAL LIMITATIONS OF THE POSTGRESQL FALLBACK:
  // 1. NON-EQUIVALENT PROTECTION: The database fallback does NOT provide equivalent
  //    protection to Upstash Redis.
  // 2. NO IP RATE LIMITING: The `ContactLead` schema does not store client IP addresses;
  //    therefore, IP-based limits cannot be evaluated in this fallback.
  // 3. NON-ATOMIC (TOCTOU): The count-then-insert pattern is subject to concurrency race
  //    conditions under heavy burst traffic. Multiple concurrent requests can pass
  //    the count check simultaneously before records are written.
  // 4. PRESERVATION PRIORITY: This fallback exists as a best-effort degradation layer
  //    to preserve legitimate customer inquiries during a temporary Redis outage.
  // 5. RELAY PROTECTION: When this fallback activates, `redisAvailable: false` is returned,
  //    which instructs `mailer.ts` to strictly suppress customer auto-replies, preventing
  //    unmetered relay abuse while still saving the lead and notifying the admin team.
  // 6. SAFE REJECTION: If both Redis and PostgreSQL fail, the system fails closed (rejects submission).
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)

    // Check recent submissions for this specific email
    const emailCount = await prisma.contactLead.count({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        createdAt: { gte: fifteenMinutesAgo },
      },
    })

    if (emailCount >= 3) {
      return {
        success: false,
        message: 'Too many messages sent with this email. Please wait a few minutes before trying again.',
        redisAvailable: false,
      }
    }

    // Check overall volume in the last 10 minutes
    const globalCount = await prisma.contactLead.count({
      where: { createdAt: { gte: tenMinutesAgo } },
    })

    if (globalCount >= 60) {
      return {
        success: false,
        message: 'Our contact system is experiencing heavy traffic. Please try again shortly.',
        redisAvailable: false,
      }
    }

    // Fallback allows lead submission, but flags redisAvailable: false
    // so customer auto-replies will be suppressed to avoid unmetered outgoing relays.
    return { success: true, redisAvailable: false }
  } catch (dbError) {
    console.error('Fallback rate limiting database check failed:', dbError)
    // Fail safe: reject if we cannot verify limits
    return {
      success: false,
      message: 'Service temporarily unavailable. Please try again or reach out directly at 4rinlabs@gmail.com.',
      redisAvailable: false,
    }
  }
}

// ─── Phase 2: CMS Image Upload Rate Limiting ──────────────────────────────────

export type UploadRateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429 | 503; error: string }

let cachedUploadLimiters: {
  userUploadLimiter: Ratelimit
  ipUploadLimiter: Ratelimit
} | null = null

function getActiveUploadLimiters() {
  if (!redis) return null
  if (cachedClient === redis && cachedUploadLimiters) return cachedUploadLimiters

  cachedUploadLimiters = {
    // 20 uploads per 10 minutes per authenticated user ID
    userUploadLimiter: new Ratelimit({
      redis: redis as any,
      limiter: Ratelimit.slidingWindow(20, '10 m'),
      prefix: 'ratelimit:admin:upload:user',
      analytics: false,
    }),
    // 30 uploads per 10 minutes per verified client IP
    ipUploadLimiter: new Ratelimit({
      redis: redis as any,
      limiter: Ratelimit.slidingWindow(30, '10 m'),
      prefix: 'ratelimit:admin:upload:ip',
      analytics: false,
    }),
  }
  return cachedUploadLimiters
}

/**
 * Enforces per-user and per-IP rate limits on CMS file uploads.
 * 
 * Policy:
 * - 20 uploads per 10 minutes per authenticated user ID.
 * - 30 uploads per 10 minutes per verified client IP (when present).
 * - Fails closed with HTTP 503 if Redis is unavailable or unconfigured,
 *   preventing unmetered storage bucket consumption during infrastructure outages.
 * - Returns HTTP 429 when quota is exceeded.
 */
export async function checkUploadRateLimit(
  userId: string,
  clientIp?: string,
): Promise<UploadRateLimitResult> {
  if (!redis) {
    // Fail closed when Redis is unavailable
    return {
      allowed: false,
      status: 503,
      error: 'Upload service temporarily unavailable. Please try again shortly.',
    }
  }

  const limiters = getActiveUploadLimiters()
  if (!limiters) {
    return {
      allowed: false,
      status: 503,
      error: 'Upload service temporarily unavailable. Please try again shortly.',
    }
  }

  try {
    // 1. Enforce Per-User Upload Limit (20 uploads / 10m)
    const userRes = await limiters.userUploadLimiter.limit(userId)
    if (!userRes.success) {
      return {
        allowed: false,
        status: 429,
        error: 'Upload limit exceeded. You can upload up to 20 images per 10 minutes.',
      }
    }

    // 2. Enforce Per-IP Burst Limit if verified IP is provided
    if (clientIp && clientIp !== 'shared-unidentified-client-bucket') {
      const ipRes = await limiters.ipUploadLimiter.limit(clientIp)
      if (!ipRes.success) {
        return {
          allowed: false,
          status: 429,
          error: 'Too many upload requests from this connection. Please try again later.',
        }
      }
    }

    return { allowed: true }
  } catch (error) {
    console.error('Upload rate limiter error (failing closed):', error)
    return {
      allowed: false,
      status: 503,
      error: 'Upload service temporarily unavailable. Please try again shortly.',
    }
  }
}
