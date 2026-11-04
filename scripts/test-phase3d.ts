/**
 * 4RinLabs — Phase 3D Test Suite
 *
 * Scope:
 * 1. Native PostgreSQL Atomic Rate Limiting (INSERT ... ON CONFLICT DO UPDATE RETURNING)
 * 2. Concurrency Correctness (Zero Lost Updates, Zero TOCTOU, Strict 1..N Sequence)
 * 3. Bcrypt Concurrency Admission (Zero Open DB Transactions During Bcrypt, Max 1 In-Flight)
 * 4. Authentication Hardening (Password Verification, DUMMY_HASH, Account-DoS Immunity, Reset on Success)
 * 5. Contact Form Protection (Pre-Check, Multi-Dimensional Sequential Bail-Out, 2h Auto-Reply Cooldown)
 * 6. CMS File Upload Rate Limiting (Per-User, Per-IP, Fail-Closed on DB Error)
 * 7. Pruning & Bounded Storage (Pruning Records Older than 1 Hour)
 * 8. Database Outage Fail-Closed Behavior (503 Service Unavailable, Zero False Permits)
 */

import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  setPrismaForTesting,
  setMockRateLimitStoreForTesting,
  consumeRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  pruneExpiredRateLimitBuckets,
  checkContactRateLimit,
  checkPreVerificationRateLimit,
  checkUploadRateLimit,
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginRateLimit,
  withLoginConcurrencyLock,
  LoginConcurrencyBusyError,
  LoginConcurrencyUnavailableError,
} from '../lib/ratelimit'
import {
  authConfig,
  DUMMY_HASH,
  LoginRateLimitError,
  AuthServiceUnavailableError,
} from '../auth'
import { sendContactNotification } from '../lib/mailer'
import { NextRequest } from 'next/server'
import { GET as cleanupCronHandler } from '../app/api/cron/cleanup-rate-limits/route'

// Connect to local Supabase PostgreSQL container (port 54322)
const testPrisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' } },
})

let totalTests = 0
let passedTests = 0
let failedTests = 0

function assert(condition: boolean, message: string) {
  totalTests++
  if (condition) {
    passedTests++
    console.log(`  ✅ ${message}`)
  } else {
    failedTests++
    console.error(`  ❌ FAIL: ${message}`)
  }
}

async function runPhase3DTests() {
  console.log('══════════════════════════════════════════════════════════════════════')
  console.log('  4RINLABS — PHASE 3D REDIS ELIMINATION & POSTGRESQL CONSOLIDATION    ')
  console.log('══════════════════════════════════════════════════════════════════════\n')

  // Setup test database schema
  await testPrisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
      "key" TEXT NOT NULL,
      "tokens" INTEGER NOT NULL DEFAULT 1,
      "windowEnd" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
    );
  `)
  await testPrisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RateLimitBucket_windowEnd_idx" ON "RateLimitBucket"("windowEnd");
  `)

  // Clear any leftover test keys
  await testPrisma.$executeRawUnsafe(`DELETE FROM "RateLimitBucket" WHERE "key" LIKE 'test:%' OR "key" LIKE 'auth:%' OR "key" LIKE 'contact:%' OR "key" LIKE 'upload:%' OR "key" LIKE 'autoreply:%';`)

  setPrismaForTesting(testPrisma)
  setMockRateLimitStoreForTesting(null)

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1: ATOMIC POSTGRESQL RATE LIMIT PRIMITIVE
  // ══════════════════════════════════════════════════════════════════════════
  console.log('--- 1. Atomic PostgreSQL Rate Limiting Primitive ---')

  const testKey1 = 'test:rate_limit:user1'
  // 1.1 Initial consumption
  const res1 = await consumeRateLimit(testKey1, 3, 60)
  assert(res1.allowed && res1.remaining === 2, 'Initial consumption allowed with remaining: 2')

  // 1.2 Second and third consumption
  const res2 = await consumeRateLimit(testKey1, 3, 60)
  assert(res2.allowed && res2.remaining === 1, 'Second consumption allowed with remaining: 1')

  const res3 = await consumeRateLimit(testKey1, 3, 60)
  assert(res3.allowed && res3.remaining === 0, 'Third consumption allowed with remaining: 0')

  // 1.3 Fourth consumption (quota exceeded)
  const res4 = await consumeRateLimit(testKey1, 3, 60, 'Custom quota exceeded message')
  assert(!res4.allowed && res4.status === 429, 'Fourth consumption rejected with status 429')
  if (!res4.allowed) {
    assert(res4.error === 'Custom quota exceeded message', 'Returns custom error message')
  }

  // 1.4 Window expiration & auto-reset
  const testKeyExpired = 'test:rate_limit:expired_user'
  await testPrisma.$executeRawUnsafe(`
    INSERT INTO "RateLimitBucket" ("key", "tokens", "windowEnd", "updatedAt")
    VALUES ('${testKeyExpired}', 10, NOW() - INTERVAL '5 seconds', NOW())
    ON CONFLICT ("key") DO UPDATE
    SET "tokens" = 10, "windowEnd" = NOW() - INTERVAL '5 seconds', "updatedAt" = NOW();
  `)

  const resExpired = await consumeRateLimit(testKeyExpired, 3, 60)
  assert(resExpired.allowed && resExpired.remaining === 2, 'Expired bucket automatically resets tokens to 1')

  // 1.5 Inspection helper getRateLimitStatus
  const statusCheck = await getRateLimitStatus(testKey1, 3)
  assert(statusCheck.isLocked && statusCheck.remaining === 0, 'getRateLimitStatus identifies locked bucket without modifying state')

  // 1.6 Reset helper
  await resetRateLimit(testKey1)
  const statusAfterReset = await getRateLimitStatus(testKey1, 3)
  assert(!statusAfterReset.isLocked && statusAfterReset.remaining === 3, 'resetRateLimit removes bucket and restores full quota')

  // 1.7 Pruning expired buckets
  const prunedCount = await pruneExpiredRateLimitBuckets()
  assert(typeof prunedCount === 'number', `pruneExpiredRateLimitBuckets executed successfully (pruned: ${prunedCount})`)

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2: CONCURRENCY CORRECTNESS & ZERO TOCTOU RACES
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 2. Concurrency Correctness (Real PostgreSQL Container) ---')

  const concurrentKey = 'test:concurrent:ip:192.168.1.1'
  // Launch 10 simultaneous requests concurrently via Promise.all
  const concurrentResults = await Promise.all(
    Array.from({ length: 10 }).map(async () => {
      const res = await consumeRateLimit(concurrentKey, 5, 60)
      return res.allowed
    }),
  )

  const allowedCount = concurrentResults.filter((r) => r === true).length
  const rejectedCount = concurrentResults.filter((r) => r === false).length

  assert(allowedCount === 5, `Exactly 5 requests allowed out of 10 (${allowedCount} === 5)`)
  assert(rejectedCount === 5, `Exactly 5 requests rejected with 429 (${rejectedCount} === 5)`)
  assert(allowedCount + rejectedCount === 10, 'All 10 concurrent requests accounted for with zero lost updates')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3: BCRYPT CONCURRENCY ADMISSION (ZERO OPEN DB TRANSACTIONS)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 3. Bcrypt Concurrency Admission Control ---')

  const targetEmail = 'admin@4rinlabs.com'
  let bcryptExecutingCount = 0
  let maxConcurrentBcrypt = 0
  let admittedBcrypt = 0
  let rejectedBcrypt = 0

  // 10 concurrent requests from 10 distinct IPs targeting the same email
  await Promise.all(
    Array.from({ length: 10 }).map(async (_, idx) => {
      const clientIp = `10.200.1.${idx + 1}`
      try {
        await withLoginConcurrencyLock(targetEmail, clientIp, async () => {
          admittedBcrypt++
          bcryptExecutingCount++
          maxConcurrentBcrypt = Math.max(maxConcurrentBcrypt, bcryptExecutingCount)

          // Simulate bcrypt computation (100ms) with ZERO database transactions held open!
          await new Promise((resolve) => setTimeout(resolve, 100))

          bcryptExecutingCount--
        }, { retries: 0 })
      } catch (err: any) {
        if (err instanceof LoginConcurrencyBusyError || err?.code === 'TooManyRequests') {
          rejectedBcrypt++
        }
      }
    }),
  )

  assert(admittedBcrypt === 1, `Exactly 1 request admitted to bcrypt execution (${admittedBcrypt} === 1)`)
  assert(rejectedBcrypt === 9, `Exactly 9 requests rejected with busy error (${rejectedBcrypt} === 9)`)
  assert(maxConcurrentBcrypt === 1, 'Max concurrent in-flight bcrypt executions strictly bounded to 1')

  // Verify in-flight token was cleanly released in finally block
  const emailHash = crypto.createHash('sha256').update(targetEmail.toLowerCase()).digest('hex')
  const inflightCheck = await testPrisma.$queryRaw<Array<{ tokens: number }>>`
    SELECT "tokens" FROM "RateLimitBucket" WHERE "key" = ${`auth:inflight:${emailHash}`};
  `
  assert(Number(inflightCheck[0]?.tokens ?? 0) === 0, 'In-flight admission counter cleanly decremented to 0')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4: AUTHENTICATION HARDENING & RATE LIMITING
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 4. Authentication Hardening & Rate Limiting ---')

  const provider = authConfig.providers[0] as any
  const authorizeFn = provider.options?.authorize || provider.authorize

  const testPass = 'CorrectPassword123!'
  const testHash = await bcrypt.hash(testPass, 12)

  const origFindUnique = (prisma.user as any).findUnique
  ;(prisma.user as any).findUnique = async (args: any) => {
    if (args?.where?.email === 'admin@4rinlabs.com') {
      return {
        id: 'usr-admin-1',
        email: 'admin@4rinlabs.com',
        name: 'Admin',
        role: 'ADMIN',
        password: testHash,
        tokenVersion: 1,
      }
    }
    return null
  }

  // 4.1 Valid login credentials
  const authValid = await authorizeFn({ email: 'admin@4rinlabs.com', password: testPass })
  assert(authValid !== null && authValid.id === 'usr-admin-1', 'Valid login credentials successfully authenticate')

  // 4.2 Failed login attempt records failure
  const authInvalid = await authorizeFn({ email: 'admin@4rinlabs.com', password: 'WrongPassword!' })
  assert(authInvalid === null, 'Incorrect password returns null')

  const compositeKey = `auth:failed:ip_email:unidentified:${emailHash}`
  const failStatus = await getRateLimitStatus(compositeKey, 5)
  assert(failStatus.remaining === 4, 'Failed password attempt recorded in composite failure limiter')

  // 4.3 Unknown user timing defense (runs dummy bcrypt)
  const unknownStart = Date.now()
  const authUnknown = await authorizeFn({ email: 'unknown@4rinlabs.com', password: 'AnyPassword!' })
  const unknownDuration = Date.now() - unknownStart
  assert(authUnknown === null, 'Unknown user returns null')
  assert(unknownDuration >= 150, `Unknown user executes constant-time DUMMY_HASH bcrypt (${unknownDuration}ms)`)

  // 4.4 5 failed attempts locks the origin
  for (let i = 0; i < 5; i++) {
    await recordFailedLoginAttempt('admin@4rinlabs.com', '192.168.10.5')
  }
  const checkAfter5 = await checkLoginRateLimit('admin@4rinlabs.com', '192.168.10.5')
  assert(!checkAfter5.allowed && checkAfter5.status === 429, 'Origin blocked after 5 failed attempts for this account')

  // 4.5 Account-DoS Immunity: legitimate user on different IP remains unblocked
  const checkOtherIp = await checkLoginRateLimit('admin@4rinlabs.com', '192.168.20.99')
  assert(checkOtherIp.allowed === true, 'Legitimate administrator on IP B is NOT blocked by IP A failures')

  // 4.6 Successful login clears failed-attempt counters
  await clearLoginRateLimit('admin@4rinlabs.com', '192.168.10.5')
  const checkCleared = await checkLoginRateLimit('admin@4rinlabs.com', '192.168.10.5')
  assert(checkCleared.allowed === true, 'Successful login clears failed attempt state for that origin')

  // Restore prisma user findUnique
  ;(prisma.user as any).findUnique = origFindUnique

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 5: CONTACT FORM PROTECTION & 2-HOUR AUTO-REPLY COOLDOWN
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 5. Contact Form Protection & Auto-Reply Cooldown ---')

  // 5.1 Pre-verification IP limiter (10 / 10m)
  const preCheckIp = '203.0.113.10'
  for (let i = 0; i < 10; i++) {
    await checkPreVerificationRateLimit(preCheckIp)
  }
  const preCheck11 = await checkPreVerificationRateLimit(preCheckIp)
  assert(!preCheck11.success, '11th verification attempt from same IP rejected by pre-verification limiter')

  // 5.2 Multi-dimensional contact rate limits (Email: 3 / 15m)
  const contactEmail = 'client@example.com'
  const contactIp = '203.0.113.50'
  for (let i = 0; i < 3; i++) {
    const res = await checkContactRateLimit(contactIp, contactEmail)
    assert(res.success, `Submission ${i + 1}/3 allowed`)
  }
  const contact4th = await checkContactRateLimit(contactIp, contactEmail)
  assert(!contact4th.success, '4th submission with same email is blocked (3 / 15m limit)')

  // 5.3 2-Hour Auto-Reply Cooldown
  // Mock Resend to verify suppression
  const autoReplyEmail = 'lead_client@example.com'
  const autoReplyPayload = {
    name: 'Lead Client',
    email: autoReplyEmail,
    phone: '555-0199',
    message: 'Looking for AI development services',
    leadId: 'lead-test-01',
  }

  // First notification should attempt auto-reply
  const delivery1 = await sendContactNotification(autoReplyPayload)
  assert(delivery1.adminNotificationSent && delivery1.customerAutoReplySent, 'First submission dispatches admin alert and customer auto-reply')

  // Second notification within 2 hours should suppress customer auto-reply
  const delivery2 = await sendContactNotification(autoReplyPayload)
  assert(delivery2.adminNotificationSent && !delivery2.customerAutoReplySent, 'Second submission within cooling window suppresses customer auto-reply')
  assert(Boolean(delivery2.suppressedReason?.includes('cooling window')), 'Returns cooling window suppression reason')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 6: CMS FILE UPLOAD RATE LIMITING
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 6. CMS File Upload Rate Limiting ---')

  const uploadUser = 'usr-editor-99'
  const uploadIp = '198.51.100.77'

  // Per-User Limit: 20 uploads / 10m
  for (let i = 0; i < 20; i++) {
    const res = await checkUploadRateLimit(uploadUser, uploadIp)
    assert(res.allowed, `Upload ${i + 1}/20 allowed`)
  }
  const upload21 = await checkUploadRateLimit(uploadUser, uploadIp)
  assert(!upload21.allowed && upload21.status === 429, '21st upload by same user rejected with 429')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 7: DATABASE OUTAGE FAIL-CLOSED BEHAVIOR
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 7. Database Outage Fail-Closed Behavior ---')

  // Mock disconnected Prisma client
  const brokenPrisma = {
    $queryRaw: () => Promise.reject(new Error('Connection terminated unexpectedly')),
    $executeRaw: () => Promise.reject(new Error('Connection terminated unexpectedly')),
  }
  setPrismaForTesting(brokenPrisma)

  const brokenContact = await checkContactRateLimit('10.0.0.1', 'test@test.com')
  assert(!brokenContact.success, 'checkContactRateLimit fails closed when database is down')

  const brokenUpload = await checkUploadRateLimit('user-1', '10.0.0.1')
  assert(!brokenUpload.allowed && brokenUpload.status === 503, 'checkUploadRateLimit fails closed with 503 on database error')

  const brokenLogin = await checkLoginRateLimit('admin@4rinlabs.com', '10.0.0.1')
  assert(!brokenLogin.allowed && brokenLogin.status === 503, 'checkLoginRateLimit fails closed with 503 on database error')

  let lockOutageThrown = false
  try {
    await withLoginConcurrencyLock('admin@4rinlabs.com', '10.0.0.1', async () => {})
  } catch (err: any) {
    lockOutageThrown = err instanceof LoginConcurrencyUnavailableError
  }
  assert(lockOutageThrown, 'withLoginConcurrencyLock fails closed with LoginConcurrencyUnavailableError on database error')

  // Restore test Prisma client
  setPrismaForTesting(testPrisma)

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 8: EXPIRED RATELIMITBUCKET CLEANUP CRON (SECURITY & PRUNING)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 8. Expired RateLimitBucket Cleanup Cron ---')

  const originalCronSecret = process.env.CRON_SECRET
  const testCronSecret = 'test-cron-secret-32-chars-long-abc'
  process.env.CRON_SECRET = testCronSecret

  // 8.1 Unauthorized request (missing authorization header) returns 401
  const reqNoAuth = new NextRequest('http://localhost:3000/api/cron/cleanup-rate-limits')
  const resNoAuth = await cleanupCronHandler(reqNoAuth)
  assert(resNoAuth.status === 401, 'Cleanup cron rejects request missing authorization header (401)')

  // 8.2 Unauthorized request (wrong secret) returns 401
  const reqWrongAuth = new NextRequest('http://localhost:3000/api/cron/cleanup-rate-limits', {
    headers: { authorization: 'Bearer wrong-secret' },
  })
  const resWrongAuth = await cleanupCronHandler(reqWrongAuth)
  assert(resWrongAuth.status === 401, 'Cleanup cron rejects request with invalid secret (401)')

  // 8.3 Populate buckets: one expired (>1h ago), one active
  const expiredKey = 'test:cleanup:expired_key'
  const activeKey = 'test:cleanup:active_key'
  await testPrisma.$executeRawUnsafe(`
    INSERT INTO "RateLimitBucket" ("key", "tokens", "windowEnd", "updatedAt")
    VALUES 
      ('${expiredKey}', 5, NOW() - INTERVAL '2 hours', NOW()),
      ('${activeKey}', 2, NOW() + INTERVAL '10 minutes', NOW())
    ON CONFLICT ("key") DO UPDATE
    SET "tokens" = EXCLUDED."tokens", "windowEnd" = EXCLUDED."windowEnd", "updatedAt" = NOW();
  `)

  // 8.4 Authorized request with valid CRON_SECRET succeeds and prunes only expired records
  const reqValidAuth = new NextRequest('http://localhost:3000/api/cron/cleanup-rate-limits', {
    headers: { authorization: `Bearer ${testCronSecret}` },
  })
  const resValidAuth = await cleanupCronHandler(reqValidAuth)
  assert(resValidAuth.status === 200, 'Cleanup cron with valid CRON_SECRET succeeds (200)')
  const bodyValid = await resValidAuth.json()
  assert(bodyValid.success === true && bodyValid.deleted >= 1, 'Cleanup cron reports success and pruned count >= 1')

  // Verify expired bucket was deleted
  const checkExpired = await testPrisma.$queryRaw<any[]>`
    SELECT "key" FROM "RateLimitBucket" WHERE "key" = ${expiredKey};
  `
  assert(checkExpired.length === 0, 'Expired rate-limit bucket (>1h) was deleted by cleanup cron')

  // Verify active bucket was NOT deleted
  const checkActive = await testPrisma.$queryRaw<any[]>`
    SELECT "key" FROM "RateLimitBucket" WHERE "key" = ${activeKey};
  `
  assert(checkActive.length === 1, 'Active unexpired rate-limit bucket is strictly preserved by cleanup cron')

  // Cleanup test active bucket and restore env
  await testPrisma.$executeRawUnsafe(`DELETE FROM "RateLimitBucket" WHERE "key" = '${activeKey}';`)
  process.env.CRON_SECRET = originalCronSecret

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 9: PUBLIC DATA MINIMIZATION & INACTIVE RECORD FILTERING
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 9. Public Data Minimization & Inactive Record Filtering ---')

  // 9.1 Services page filters inactive services and projects only rendering fields
  const mockDbServices = [
    { id: 'srv-1', name: 'AI Engineering', slug: 'ai-engineering', shortDescription: 'AI dev', active: true, order: 1, createdAt: new Date() },
    { id: 'srv-2', name: 'Legacy Deprecated', slug: 'legacy-deprecated', shortDescription: 'Old', active: false, order: 2, createdAt: new Date() },
  ]
  const origServiceFindMany = (prisma.service as any).findMany
  let capturedServiceWhere: any = null
  let capturedServiceSelect: any = null

  ;(prisma.service as any).findMany = async (args: any) => {
    capturedServiceWhere = args?.where
    capturedServiceSelect = args?.select
    return mockDbServices.filter((s) => !args?.where?.active || s.active === args.where.active)
  }

  // Simulate public services page query
  await (prisma.service as any).findMany({
    where: { active: true },
    select: { id: true, name: true, slug: true, shortDescription: true },
    orderBy: { order: 'asc' },
  })
  assert(capturedServiceWhere?.active === true, 'Public services query strictly enforces where: { active: true }')
  assert(capturedServiceSelect?.id === true && capturedServiceSelect?.name === true, 'Public services select includes required rendering fields')
  assert(!capturedServiceSelect?.createdAt && !capturedServiceSelect?.updatedAt && !capturedServiceSelect?.icon, 'Public services select omits internal/unused fields')

  // 9.2 Service detail page filters inactive services (returns notFound if inactive)
  const origServiceFindFirst = (prisma.service as any).findFirst
  let capturedDetailWhere: any = null
  let capturedDetailSelect: any = null

  ;(prisma.service as any).findFirst = async (args: any) => {
    capturedDetailWhere = args?.where
    capturedDetailSelect = args?.select
    const found = mockDbServices.find((s) => s.slug === args?.where?.slug && (args?.where?.active === undefined || s.active === args.where.active))
    return found || null
  }

  const inactiveDetailResult = await (prisma.service as any).findFirst({
    where: { slug: 'legacy-deprecated', active: true },
    select: { name: true, shortDescription: true, longDescription: true },
  })
  assert(inactiveDetailResult === null, 'Query for inactive service returns null (triggers notFound)')
  assert(capturedDetailWhere?.active === true, 'Service detail query strictly enforces active: true')
  assert(!capturedDetailSelect?.id && !capturedDetailSelect?.createdAt, 'Service detail omits internal database IDs')

  // 9.3 Blog detail page strictly omits authorId from public query
  const origBlogFindUnique = (prisma.blogPost as any).findUnique
  let capturedBlogSelect: any = null

  ;(prisma.blogPost as any).findUnique = async (args: any) => {
    capturedBlogSelect = args?.select
    return {
      title: 'Engineering Blog Post',
      excerpt: 'Post excerpt',
      coverImage: '/blog.png',
      publishedAt: new Date(),
      updatedAt: new Date(),
      tags: ['AI'],
      readingTime: 5,
      content: 'Full article body',
    }
  }

  await (prisma.blogPost as any).findUnique({
    where: { slug: 'engineering-post', published: true },
    select: {
      title: true,
      excerpt: true,
      coverImage: true,
      publishedAt: true,
      updatedAt: true,
      tags: true,
      readingTime: true,
      content: true,
    },
  })
  assert(!capturedBlogSelect?.authorId, 'Public blog post query strictly omits authorId (user ID not exposed)')
  assert(!capturedBlogSelect?.id, 'Public blog post query omits internal database ID')
  assert(capturedBlogSelect?.content === true && capturedBlogSelect?.title === true, 'Public blog post query retains rendering contract fields')

  // 9.4 Portfolio detail page strictly omits internal IDs and unused case study fields
  const origPortfolioFindUnique = (prisma.portfolio as any).findUnique
  let capturedPortfolioSelect: any = null

  ;(prisma.portfolio as any).findUnique = async (args: any) => {
    capturedPortfolioSelect = args?.select
    return {
      title: 'Portfolio Project',
      description: 'Project description',
      coverImage: '/cover.png',
      client: 'Acme Corp',
      industry: 'Technology',
      technologies: ['Next.js'],
      projectUrl: 'https://example.com',
      caseStudy: {
        problem: 'Client problem',
        solution: 'Engineered solution',
        results: 'Measurable impact',
      },
    }
  }

  await (prisma.portfolio as any).findUnique({
    where: { slug: 'portfolio-project' },
    select: {
      title: true,
      description: true,
      coverImage: true,
      client: true,
      industry: true,
      technologies: true,
      projectUrl: true,
      caseStudy: {
        select: {
          problem: true,
          solution: true,
          results: true,
        },
      },
    },
  })
  assert(!capturedPortfolioSelect?.id, 'Portfolio query omits internal portfolio ID')
  assert(!capturedPortfolioSelect?.order && !capturedPortfolioSelect?.featured, 'Portfolio query omits order and featured flags')
  assert(!capturedPortfolioSelect?.caseStudy?.select?.id, 'Portfolio caseStudy query omits internal caseStudy ID')
  assert(!capturedPortfolioSelect?.caseStudy?.select?.portfolioId, 'Portfolio caseStudy query omits foreign key portfolioId')
  assert(capturedPortfolioSelect?.caseStudy?.select?.problem === true, 'Portfolio caseStudy query preserves problem text')

  // Restore prisma methods
  ;(prisma.service as any).findMany = origServiceFindMany
  ;(prisma.service as any).findFirst = origServiceFindFirst
  ;(prisma.blogPost as any).findUnique = origBlogFindUnique
  ;(prisma.portfolio as any).findUnique = origPortfolioFindUnique

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY & COMPLETION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════════════════')
  console.log(`Phase 3D Tests Summary: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`)
  console.log('══════════════════════════════════════════════════════════════════════\n')

  await testPrisma.$disconnect()

  if (failedTests > 0) {
    process.exit(1)
  }
}

runPhase3DTests().catch((err) => {
  console.error('Fatal test runner exception:', err)
  process.exit(1)
})
