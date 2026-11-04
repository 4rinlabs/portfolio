import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { pruneExpiredRateLimitBuckets } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

/**
 * Validates the Authorization header against CRON_SECRET using a timing-safe comparison.
 */
function isValidCronRequest(authHeader: string | null): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !authHeader) return false

  const expectedHeader = `Bearer ${cronSecret}`
  const authBuffer = Buffer.from(authHeader)
  const expectedBuffer = Buffer.from(expectedHeader)

  if (authBuffer.length !== expectedBuffer.length) return false
  return crypto.timingSafeEqual(authBuffer, expectedBuffer)
}

/**
 * Daily cleanup endpoint for expired RateLimitBucket records.
 * Invoked by Vercel Cron according to the schedule configured in vercel.json.
 *
 * Security Controls:
 * - Requires Authorization: Bearer <CRON_SECRET>
 * - Uses crypto.timingSafeEqual to prevent timing attacks
 * - Deletes strictly expired records older than 1 hour (no active quotas affected)
 * - force-dynamic with no-store cache headers
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (!isValidCronRequest(authHeader)) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing cron secret' },
      { status: 401 },
    )
  }

  try {
    const deletedCount = await pruneExpiredRateLimitBuckets()

    return NextResponse.json(
      {
        success: true,
        deleted: deletedCount,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      },
    )
  } catch (err) {
    console.error('Failed to execute rate-limit bucket cleanup cron:', err)
    return NextResponse.json(
      { success: false, error: 'Database pruning failure' },
      { status: 500 },
    )
  }
}
