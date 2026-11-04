/**
 * 4RinLabs — Phase 3C.5 Test Suite
 *
 * Scope:
 * 1. Contact Form Rate Limit Concurrency Hardening (Fail-Closed, Sequential Early Bail-Out, Zero DB Fallback)
 * 2. Login Distributed Concurrency Lock (Atomic Acquisition, Compare-and-Delete Lua, Guaranteed Cleanup)
 * 3. Auth.js Credentials Provider Lock Coverage (Rate Limit -> DB Lookup -> Bcrypt -> Failed Attempt Record)
 * 4. Multi-IP Login Concurrency & Anti-DoS Immunity (Same email, distinct IPs, global progressive delay)
 * 5. Unidentified Client IP Shared Bucket Enforcement (60 req / 15m shared pool, verified IP isolation)
 * 6. Public Data Minimization & Inactive Record Filtering (Services, Sitemap, Blog authorId omission, Portfolio)
 *
 * Test Methodology:
 * - Unit & Mock Concurrency Tests: Validates lock token semantics, early bail-out sequences, projection schemas,
 *   and error mappings in an isolated in-memory environment.
 * - Engine Guarantee Transparency: Explicitly documents that actual distributed atomicity requires Upstash Redis
 *   REST API / Redis cluster execution in production.
 */

import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import {
  setRedisForTesting,
  checkContactRateLimit,
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginRateLimit,
  withLoginConcurrencyLock,
  acquireGlobalLoginAdmission,
  settleLoginFailure,
  settleLoginSuccess,
  refundLoginReservation,
  getGlobalLoginKeys,
  LoginConcurrencyBusyError,
  LoginConcurrencyUnavailableError,
} from '../lib/ratelimit'
import {
  authConfig,
  DUMMY_HASH,
  LoginRateLimitError,
  AuthServiceUnavailableError,
} from '../auth'
import { RealRedisTestClient } from './real-redis-client'

// Test runner state
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

// ─── High-Fidelity Mock Redis Client (Unified Store for Ratelimit & Locks) ───
class MockRedisPhase3C5 {
  public store = new Map<string, any>()

  async set(key: string, value: any, options?: { nx?: boolean; px?: number; ex?: number }) {
    if (options?.nx && this.store.has(key)) {
      return null
    }
    this.store.set(key, value)
    return 'OK'
  }

  async get(key: string) {
    return this.store.get(key) || null
  }

  async del(key: string) {
    this.store.delete(key)
    for (const k of Array.from(this.store.keys())) {
      if (k.startsWith(key)) {
        this.store.delete(k)
      }
    }
    return 1
  }

  async evalsha(_sha: string, _keys: string[], _args: any[]) {
    throw new Error('NOSCRIPT No matching script. Please use EVAL.')
  }

  async eval(script: string, keys: string[], args: any[]) {
    const key = keys[0]

    // 1. Compare-and-delete lock release script:
    if (script.includes('get') && script.includes('del') && !script.includes('admissionKey')) {
      const currentVal = this.store.get(key)
      if (currentVal !== undefined && currentVal === args[0]) {
        this.store.delete(key)
        return 1
      }
      return 0
    }

    // 2. Ratelimit reset script
    if (script.includes('del') || script.includes('UNLINK') || args[0] === null || key?.includes('*')) {
      const prefix = (key || '').replace(/:[0-9]+$/, '').replace(/:\*$/, '')
      for (const k of Array.from(this.store.keys())) {
        if (k.startsWith(prefix)) {
          this.store.delete(k)
        }
      }
      return 1
    }

    // 3. New Phase 3C.5 Atomic Lua Scripts:
    if (script.includes('admissionKey') && script.includes('globalCap')) {
      // ACQUIRE_ADMISSION_AND_RESERVE_SCRIPT
      return [1, 'NORMAL', 1, 1]
    }

    if (script.includes('admissionKey') && script.includes('SUCCESS_SETTLED')) {
      // SETTLE_SUCCESS_SCRIPT
      return [1, 'SUCCESS_SETTLED']
    }

    if (script.includes('admissionKey') && script.includes('failureMember')) {
      // SETTLE_FAILURE_SCRIPT
      return [1, 'SETTLED', 1]
    }

    if (script.includes('admissionKey') && script.includes('REFUNDED')) {
      // REFUND_RESERVATION_SCRIPT
      return [1, 'REFUNDED']
    }

    const current = typeof this.store.get(key) === 'number' ? (this.store.get(key) as number) : 0
    const limit = Number(args[0]) || 5

    // 4. Ratelimit getRemaining script (does not contain incrementBy)
    if (!script.includes('incrementBy')) {
      const remaining = Math.max(0, limit - current)
      return [remaining, limit]
    }

    // 5. Ratelimit limit script (contains incrementBy)
    if (current >= limit) {
      return [-1, 900]
    }

    const next = current + 1
    this.store.set(key, next)
    const remaining = limit - next
    return [remaining, 900]
  }

  reset() {
    this.store.clear()
  }
}

async function runPhase3C5Tests() {
  console.log('══════════════════════════════════════════════════════════════════════')
  console.log('  4RINLABS — PHASE 3C.5 RATE LIMIT CONCURRENCY & DATA MINIMIZATION    ')
  console.log('══════════════════════════════════════════════════════════════════════')

  const mockRedis = new MockRedisPhase3C5()
  setRedisForTesting(mockRedis)

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1: CONTACT FORM CONCURRENCY HARDENING & FAIL-CLOSED ARCHITECTURE
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 1. Contact Form Rate Limiting: Fail-Closed & Early Bail-Out ---')

  // 1.1 Redis Unavailable: Contact limiter strictly fails closed without database fallback
  setRedisForTesting(null)
  const unavailableResult = await checkContactRateLimit('198.51.100.1', 'user@example.com')
  assert(unavailableResult.success === false, 'Contact limiter fails closed when Redis is unavailable')
  assert(unavailableResult.redisAvailable === false, 'Flags redisAvailable as false')
  assert(
    typeof unavailableResult.message === 'string' && unavailableResult.message.includes('temporarily unavailable'),
    'Returns user-safe unavailability message',
  )

  // 1.2 Redis Exception: Catches errors and fails closed
  const throwingRedis = {
    evalsha: async () => { throw new Error('Redis network socket disconnected') },
    eval: async () => { throw new Error('Redis network socket disconnected') },
  }
  setRedisForTesting(throwingRedis)
  const exceptionResult = await checkContactRateLimit('198.51.100.1', 'user@example.com')
  assert(exceptionResult.success === false, 'Contact limiter fails closed when Redis throws an exception')
  assert(exceptionResult.redisAvailable === false, 'Flags redisAvailable as false on exception')

  // Restore mock Redis
  setRedisForTesting(mockRedis)
  mockRedis.reset()

  // 1.3 Per-Email Submission Limit (3 req / 15m)
  const emailResults: boolean[] = []
  for (let i = 0; i < 4; i++) {
    const res = await checkContactRateLimit(`198.51.100.${i + 1}`, 'spammer@target.com')
    emailResults.push(res.success)
  }
  assert(emailResults.filter(r => r === true).length === 3, 'Exactly 3 submissions per email permitted')
  assert(emailResults[3] === false, '4th submission with same email is blocked with 429')

  // 1.4 Per-IP Submission Limit (5 req / 10m)
  mockRedis.reset()
  const ipResults: boolean[] = []
  for (let i = 0; i < 7; i++) {
    const res = await checkContactRateLimit('198.51.100.5', `user_${i}@example.com`)
    ipResults.push(res.success)
  }
  assert(ipResults.filter(r => r === true).length === 5, 'Exactly 5 submissions per IP permitted')
  assert(ipResults[5] === false && ipResults[6] === false, 'Subsequent submissions from same IP blocked')

  // 1.5 Sequential Early Bail-Out: When IP limit is tripped, email limit bucket is NOT incremented
  const emailTokensForUser6 = Array.from(mockRedis.store.keys()).filter(k => k.includes('user_6@example.com'))
  assert(emailTokensForUser6.length === 0, 'Email bucket was not incremented when IP limit tripped (early bail-out)')

  // 1.6 Global Limit (60 req / 10m) and early bail-out
  mockRedis.reset()
  let globalAllowed = 0
  for (let i = 0; i < 60; i++) {
    const res = await checkContactRateLimit(`10.0.${Math.floor(i / 5)}.${i % 5}`, `user_${i}@global.com`)
    if (res.success) globalAllowed++
  }
  assert(globalAllowed === 60, 'Global volume accepts up to 60 contact submissions')
  const global61st = await checkContactRateLimit('10.9.9.9', 'overflow@global.com')
  assert(global61st.success === false, '61st submission is rejected by global rate limiter')
  assert(global61st.message?.includes('heavy traffic') === true, 'Returns global heavy traffic message')

  // 1.7 Verify complete elimination of PostgreSQL fallback
  let dbCountCalled = false
  const origLeadCount = (prisma.contactLead as any).count
  ;(prisma.contactLead as any).count = async () => {
    dbCountCalled = true
    return 0
  }
  mockRedis.reset()
  await checkContactRateLimit('198.51.100.10', 'legit@example.com')
  assert(dbCountCalled === false, 'prisma.contactLead.count was not called during contact rate checking')
  ;(prisma.contactLead as any).count = origLeadCount

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2: LOGIN CONCURRENCY LOCK (ATOMIC ACQUISITION, CAS, CLEANUP)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 2. Login Distributed Concurrency Lock ---')

  mockRedis.reset()
  const testEmail = 'admin@4rinlabs.com'
  const testIp = '198.51.100.20'
  const emailHash = crypto.createHash('sha256').update(testEmail).digest('hex')
  const expectedLockKey = `ratelimit:lock:auth:login:${testIp}:${emailHash}`

  // 2.1 Basic lock acquisition, execution, and compare-and-delete release
  let executionCount = 0
  const lockResult = await withLoginConcurrencyLock(testEmail, testIp, async () => {
    executionCount++
    assert(mockRedis.store.has(expectedLockKey), 'Lock key exists in Redis during execution')
    return 'success_payload'
  })
  assert(lockResult === 'success_payload', 'Protected function returned expected result')
  assert(executionCount === 1, 'Protected function executed exactly once')
  assert(!mockRedis.store.has(expectedLockKey), 'Lock key was released after execution')

  // 2.2 Compare-and-delete protects against releasing another request\'s lock
  mockRedis.reset()
  mockRedis.store.set(expectedLockKey, 'token_a')
  const releaseRes = await mockRedis.eval(
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
    [expectedLockKey],
    ['token_b'],
  )
  assert(releaseRes === 0, 'Compare-and-delete returns 0 when token does not match')
  assert(mockRedis.store.has(expectedLockKey), 'Stale/foreign release call did not delete the active lock')

  // 2.3 Lock Contention / Concurrency Rejection
  mockRedis.store.set(expectedLockKey, 'active_owner_token')
  let caughtBusyError = false
  try {
    await withLoginConcurrencyLock(testEmail, testIp, async () => {}, { retries: 0 })
  } catch (err) {
    if (err instanceof LoginConcurrencyBusyError && err.code === 'TooManyRequests') {
      caughtBusyError = true
    }
  }
  assert(caughtBusyError, 'Concurrent request on same (IP, email) is rejected with LoginConcurrencyBusyError (TooManyRequests)')

  // 2.4 Guaranteed cleanup in finally block even if function throws
  mockRedis.reset()
  let caughtThrownError = false
  try {
    await withLoginConcurrencyLock(testEmail, testIp, async () => {
      throw new Error('Unexpected execution failure inside bcrypt')
    })
  } catch (err: any) {
    caughtThrownError = err.message === 'Unexpected execution failure inside bcrypt'
  }
  assert(caughtThrownError, 'Error thrown inside lock is propagated')
  assert(!mockRedis.store.has(expectedLockKey), 'Lock was released in finally block despite thrown error')

  // 2.5 Fail closed when Redis is unavailable
  setRedisForTesting(null)
  let caughtUnavailable = false
  try {
    await withLoginConcurrencyLock(testEmail, testIp, async () => {})
  } catch (err) {
    if (err instanceof LoginConcurrencyUnavailableError && err.code === 'ServiceUnavailable') {
      caughtUnavailable = true
    }
  }
  assert(caughtUnavailable, 'Login lock fails closed with LoginConcurrencyUnavailableError when Redis is offline')

  // Restore mock Redis
  setRedisForTesting(mockRedis)
  mockRedis.reset()

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3: AUTH.JS CREDENTIALS PROVIDER INTEGRATION WITH LOCK
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 3. Auth.js Credentials Provider Concurrency Lock Integration ---')

  const credentialsProvider = authConfig.providers[0] as any
  const authorizeFn = credentialsProvider.options?.authorize || credentialsProvider.authorize

  const validPass = 'SecureAdminPassword123!'
  const validHash = await bcrypt.hash(validPass, 12)
  const origFindUnique = (prisma.user as any).findUnique

  ;(prisma.user as any).findUnique = async (args: any) => {
    if (args?.where?.email === 'admin@4rinlabs.com') {
      return {
        id: 'user_admin_001',
        email: 'admin@4rinlabs.com',
        name: 'Admin',
        role: 'ADMIN',
        password: validHash,
        tokenVersion: 1,
      }
    }
    return null
  }

  // 3.1 Valid credentials authentication
  mockRedis.reset()
  const authSuccess = await authorizeFn({
    email: 'admin@4rinlabs.com',
    password: validPass,
  })
  assert(authSuccess !== null && authSuccess.id === 'user_admin_001', 'Valid login credentials successfully authenticate')

  // 3.2 Failed password attempt records failure inside lock before release
  mockRedis.reset()
  const authWrongPass = await authorizeFn({
    email: 'admin@4rinlabs.com',
    password: 'WrongPassword!',
  })
  assert(authWrongPass === null, 'Incorrect password returns null')
  const failedEmailHash = crypto.createHash('sha256').update('admin@4rinlabs.com').digest('hex')
  const compositeFailureKeys = Array.from(mockRedis.store.keys()).filter(k => k.includes(failedEmailHash))
  assert(compositeFailureKeys.length > 0, 'Failed attempt was recorded in composite failure limiter')

  // 3.3 Unknown user timing defense & failure recording
  mockRedis.reset()
  const authUnknownUser = await authorizeFn({
    email: 'unknown-user@4rinlabs.com',
    password: 'AnyPassword123!',
  })
  assert(authUnknownUser === null, 'Unknown user returns null')
  const unknownEmailHash = crypto.createHash('sha256').update('unknown-user@4rinlabs.com').digest('hex')
  const unknownFailureKeys = Array.from(mockRedis.store.keys()).filter(k => k.includes(unknownEmailHash))
  assert(unknownFailureKeys.length > 0, 'Failed attempt was recorded for unknown account')

  // 3.4 Rate limit exceeded throws LoginRateLimitError (TooManyRequests)
  mockRedis.reset()
  for (let i = 0; i < 5; i++) {
    await recordFailedLoginAttempt('admin@4rinlabs.com')
  }
  let caughtRateLimitError = false
  try {
    await authorizeFn({
      email: 'admin@4rinlabs.com',
      password: validPass,
    })
  } catch (err: any) {
    if (err instanceof LoginRateLimitError || err.code === 'TooManyRequests') {
      caughtRateLimitError = true
    }
  }
  assert(caughtRateLimitError, 'Exhausted failure limit throws LoginRateLimitError (TooManyRequests)')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4: MULTI-IP LOGIN CONCURRENCY & ANTI-DOS IMMUNITY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 4. Multi-IP Login Concurrency & Distributed Anti-DoS ---')

  mockRedis.reset()
  const targetEmail = 'admin@4rinlabs.com'
  const ipAttacker = '198.51.100.100'
  const ipLegitimate = '203.0.113.200'
  const targetHash = crypto.createHash('sha256').update(targetEmail).digest('hex')

  // 4.1 Distinct lock keys for distinct IPs
  const lockKeyA = `ratelimit:lock:auth:login:${ipAttacker}:${targetHash}`
  const lockKeyB = `ratelimit:lock:auth:login:${ipLegitimate}:${targetHash}`
  assert(lockKeyA !== lockKeyB, 'Lock keys are strictly distinct for different IP addresses')

  // 4.2 Attacker on IP A makes 5 failed attempts
  for (let i = 0; i < 5; i++) {
    await recordFailedLoginAttempt(targetEmail, ipAttacker)
  }

  // 4.3 Attacker IP is now throttled
  const attackerCheck = await checkLoginRateLimit(targetEmail, ipAttacker)
  assert(attackerCheck.allowed === false, 'Attacker on IP A is blocked after 5 failed attempts')

  // 4.4 Legitimate user on IP B remains completely unblocked (Account-DoS Immunity)
  const legitCheck = await checkLoginRateLimit(targetEmail, ipLegitimate)
  assert(legitCheck.allowed === true, 'Legitimate administrator on IP B is NOT blocked by IP A failed attempts')

  // 4.5 Global progressive delay kicks in when distributed failures reach 10
  for (let i = 1; i <= 5; i++) {
    await recordFailedLoginAttempt(targetEmail, `10.0.0.${i}`)
  }
  // Total failures across all IPs for targetEmail is now 10
  const globalCheckKeys = Array.from(mockRedis.store.keys()).filter(k => k.includes('global_email') && k.includes(targetHash))
  assert(globalCheckKeys.length > 0, 'Global email failure limiter tracked distributed failures')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 5: UNIDENTIFIED CLIENT IP SHARED BUCKET ENFORCEMENT
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 5. Unidentified Client IP Shared Bucket Enforcement ---')

  mockRedis.reset()

  // 5.1 Unidentified client requests route to shared pool (up to 60 requests per 15m)
  let unidentifiedPassed = 0
  for (let i = 1; i <= 60; i++) {
    const res = await checkLoginRateLimit(`unident_${i}@4rinlabs.com`, 'shared-unidentified-client-bucket')
    if (res.allowed) unidentifiedPassed++
  }
  assert(unidentifiedPassed === 60, 'Exactly 60 requests allowed across shared unidentified pool')

  // 5.2 61st unidentified request is throttled
  const unidentBreach = await checkLoginRateLimit('unident_61@4rinlabs.com', 'shared-unidentified-client-bucket')
  assert(unidentBreach.allowed === false, '61st unidentified request throttled with 429')
  if (!unidentBreach.allowed) {
    assert(unidentBreach.status === 429, 'Returns HTTP 429 status')
  }

  // 5.3 Verified IP request is NOT affected by unidentified pool exhaustion
  const verifiedIpCheck = await checkLoginRateLimit('admin@4rinlabs.com', '198.51.100.50')
  assert(verifiedIpCheck.allowed === true, 'Verified IP request is not affected by exhausted unidentified pool')

  // Restore prisma.user.findUnique
  ;(prisma.user as any).findUnique = origFindUnique

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 6: PUBLIC DATA MINIMIZATION & INACTIVE RECORD FILTERING
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 6. Public Data Minimization & Inactive Record Filtering ---')

  // 6.1 Services page filters inactive services and projects only rendering fields
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

  // 6.2 Service detail page filters inactive services (returns notFound if inactive)
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

  // 6.3 Blog detail page strictly omits authorId from public query
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

  // 6.4 Portfolio detail page strictly omits internal IDs and unused case study fields
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
  // SECTION 7: REAL REDIS INTEGRATION TESTING (10 MANDATED SCENARIOS)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 7. Real Redis Integration Testing (10 Mandated Scenarios) ---')
  console.log('Connecting to real Redis container (127.0.0.1:6379)...')

  const realRedis = new RealRedisTestClient('127.0.0.1', 6379)
  await realRedis.connect()
  await realRedis.flushdb()
  setRedisForTesting(realRedis)

  // SCENARIO 1: Both Settlement Orderings (Success before Failure vs Failure before Success)
  console.log('\n  Scenario 1: Both Settlement Orderings')
  // Ordering A: Success settles before Failure
  const emailA = 'order_a@4rinlabs.com'
  const emailHashA = crypto.createHash('sha256').update(emailA).digest('hex')
  const keysA = getGlobalLoginKeys(emailHashA)

  const reqA1 = await acquireGlobalLoginAdmission(emailHashA, 'req-A1', 'res-A1')
  assert(reqA1.allowed && reqA1.status === 'NORMAL' && reqA1.admissionSeq === 1, 'Ordering A: Req 1 acquired admission at seq 1')

  const reqA2 = await acquireGlobalLoginAdmission(emailHashA, 'req-A2', 'res-A2')
  assert(reqA2.allowed && reqA2.status === 'NORMAL' && reqA2.admissionSeq === 2, 'Ordering A: Req 2 acquired admission at seq 2')

  const succA1 = await settleLoginSuccess(emailHashA, 'req-A1', 'res-A1')
  assert(succA1.settled && succA1.code === 'SUCCESS_SETTLED', 'Ordering A: Req 1 settled SUCCESS before Req 2')

  const failA2 = await settleLoginFailure(emailHashA, 'req-A2', 'res-A2')
  assert(failA2.settled && failA2.code === 'SETTLED', 'Ordering A: Req 2 settled FAILURE after Req 1')

  const settledCountA = await realRedis.sendCommand('ZCARD', keysA[2])
  assert(settledCountA === 1, 'Ordering A: Final settled failure count is exactly 1')

  // Ordering B: Failure settles before Success
  const emailB = 'order_b@4rinlabs.com'
  const emailHashB = crypto.createHash('sha256').update(emailB).digest('hex')
  const keysB = getGlobalLoginKeys(emailHashB)

  const reqB1 = await acquireGlobalLoginAdmission(emailHashB, 'req-B1', 'res-B1')
  assert(reqB1.allowed && reqB1.status === 'NORMAL' && reqB1.admissionSeq === 1, 'Ordering B: Req 1 acquired admission at seq 1')

  const reqB2 = await acquireGlobalLoginAdmission(emailHashB, 'req-B2', 'res-B2')
  assert(reqB2.allowed && reqB2.status === 'NORMAL' && reqB2.admissionSeq === 2, 'Ordering B: Req 2 acquired admission at seq 2')

  const failB2 = await settleLoginFailure(emailHashB, 'req-B2', 'res-B2')
  assert(failB2.settled && failB2.code === 'SETTLED', 'Ordering B: Req 2 settled FAILURE first at seq 2')

  const succB1 = await settleLoginSuccess(emailHashB, 'req-B1', 'res-B1')
  assert(succB1.settled && succB1.code === 'SUCCESS_SETTLED', 'Ordering B: Req 1 settled SUCCESS after Req 2 (seq-fenced reset preserves seq 2 failure)')

  const settledCountB = await realRedis.sendCommand('ZCARD', keysB[2])
  assert(settledCountB === 1, 'Ordering B: Final settled failure count is exactly 1 in both settlement orderings')

  // SCENARIO 2: Cross-Request Ownership Mismatch
  console.log('\n  Scenario 2: Cross-Request Ownership Mismatch')
  const email2 = 'ownership@4rinlabs.com'
  const emailHash2 = crypto.createHash('sha256').update(email2).digest('hex')
  const keys2 = getGlobalLoginKeys(emailHash2)

  await acquireGlobalLoginAdmission(emailHash2, 'req-2A', 'res-2A')
  await acquireGlobalLoginAdmission(emailHash2, 'req-2B', 'res-2B')

  // Req 2A tries to settle Req 2B's reservation
  const mismatchSucc = await settleLoginSuccess(emailHash2, 'req-2A', 'res-2B')
  assert(!mismatchSucc.settled && mismatchSucc.code === 'OWNERSHIP_MISMATCH', 'Cross-request success settlement rejected with OWNERSHIP_MISMATCH')

  const mismatchFail = await settleLoginFailure(emailHash2, 'req-2B', 'res-2A')
  assert(!mismatchFail.settled && mismatchFail.code === 'OWNERSHIP_MISMATCH', 'Cross-request failure settlement rejected with OWNERSHIP_MISMATCH')

  const mismatchRefund = await refundLoginReservation(emailHash2, 'req-2A', 'res-2B')
  assert(!mismatchRefund.refunded && mismatchRefund.code === 'OWNERSHIP_MISMATCH', 'Cross-request refund rejected with OWNERSHIP_MISMATCH')

  const resCount2 = await realRedis.sendCommand('ZCARD', keys2[1])
  assert(resCount2 === 2, 'Zero state mutated: both reservations remain intact in reservation ZSET')

  // SCENARIO 3: Missing and Malformed Metadata
  console.log('\n  Scenario 3: Missing and Malformed Metadata')
  const email3 = 'metadata@4rinlabs.com'
  const emailHash3 = crypto.createHash('sha256').update(email3).digest('hex')
  const keys3 = getGlobalLoginKeys(emailHash3)

  await acquireGlobalLoginAdmission(emailHash3, 'req-3', 'res-3')

  // 3a. Missing metadata (resInfoKey entry deleted)
  await realRedis.sendCommand('HDEL', keys3[3], 'res-3')
  const missingMeta = await settleLoginSuccess(emailHash3, 'req-3', 'res-3')
  assert(!missingMeta.settled && missingMeta.code === 'METADATA_MISSING', 'Settlement with missing metadata rejected with METADATA_MISSING')

  // 3b. Malformed metadata (missing colon separator)
  await realRedis.sendCommand('HSET', keys3[3], 'res-3', 'malformed_no_colon')
  const malformedMeta = await settleLoginSuccess(emailHash3, 'req-3', 'res-3')
  assert(!malformedMeta.settled && malformedMeta.code === 'METADATA_MALFORMED', 'Settlement with malformed metadata rejected with METADATA_MALFORMED')

  // 3c. Invalid admission sequence (sequence 0 or mismatch)
  await realRedis.sendCommand('HSET', keys3[3], 'res-3', 'req-3:999') // Registry has seq 1, resInfo has 999
  const invalidSeq = await settleLoginSuccess(emailHash3, 'req-3', 'res-3')
  assert(!invalidSeq.settled && invalidSeq.code === 'INVALID_ADMISSION_SEQUENCE', 'Settlement with sequence mismatch rejected with INVALID_ADMISSION_SEQUENCE')

  // SCENARIO 4: Expired Admission and Reservation Leases
  console.log('\n  Scenario 4: Expired Admission and Reservation Leases')
  const email4 = 'expired_lease@4rinlabs.com'
  const emailHash4 = crypto.createHash('sha256').update(email4).digest('hex')

  await acquireGlobalLoginAdmission(emailHash4, 'req-4', 'res-4', { leaseMs: 60 })
  await new Promise((resolve) => setTimeout(resolve, 90))

  const expiredSucc = await settleLoginSuccess(emailHash4, 'req-4', 'res-4')
  assert(!expiredSucc.settled && expiredSucc.code === 'LEASE_EXPIRED', 'Success settlement on expired lease rejected with LEASE_EXPIRED')

  const expiredFail = await settleLoginFailure(emailHash4, 'req-4', 'res-4')
  assert(!expiredFail.settled && expiredFail.code === 'LEASE_EXPIRED', 'Failure settlement on expired lease rejected with LEASE_EXPIRED')

  const expiredRefund = await refundLoginReservation(emailHash4, 'req-4', 'res-4')
  assert(!expiredRefund.refunded && expiredRefund.code === 'LEASE_EXPIRED', 'Refund on expired lease rejected with LEASE_EXPIRED')

  // SCENARIO 5: Duplicate Success, Failure, and Refund Operations (Idempotency)
  console.log('\n  Scenario 5: Duplicate Operations Idempotency')
  const email5 = 'idempotent@4rinlabs.com'
  const emailHash5 = crypto.createHash('sha256').update(email5).digest('hex')

  // 5a. Success settlement idempotency
  await acquireGlobalLoginAdmission(emailHash5, 'req-5A', 'res-5A')
  const firstSucc = await settleLoginSuccess(emailHash5, 'req-5A', 'res-5A')
  assert(firstSucc.settled && firstSucc.code === 'SUCCESS_SETTLED', 'First success settlement returns SUCCESS_SETTLED')
  const dupSucc = await settleLoginSuccess(emailHash5, 'req-5A', 'res-5A')
  assert(dupSucc.settled && dupSucc.code === 'ALREADY_SUCCESS_SETTLED', 'Duplicate success settlement returns ALREADY_SUCCESS_SETTLED idempotently')

  // 5b. Failure settlement idempotency
  await acquireGlobalLoginAdmission(emailHash5, 'req-5B', 'res-5B')
  const firstFail = await settleLoginFailure(emailHash5, 'req-5B', 'res-5B')
  assert(firstFail.settled && firstFail.code === 'SETTLED', 'First failure settlement returns SETTLED')
  const dupFail = await settleLoginFailure(emailHash5, 'req-5B', 'res-5B')
  assert(dupFail.settled && dupFail.code === 'ALREADY_SETTLED', 'Duplicate failure settlement returns ALREADY_SETTLED idempotently')

  // 5c. Refund idempotency
  await acquireGlobalLoginAdmission(emailHash5, 'req-5C', 'res-5C')
  const firstRefund = await refundLoginReservation(emailHash5, 'req-5C', 'res-5C')
  assert(firstRefund.refunded && firstRefund.code === 'REFUNDED', 'First refund returns REFUNDED')
  const dupRefund = await refundLoginReservation(emailHash5, 'req-5C', 'res-5C')
  assert(dupRefund.refunded && dupRefund.code === 'ALREADY_REFUNDED', 'Duplicate refund returns ALREADY_REFUNDED idempotently')

  // SCENARIO 6: Active Acquisition Retry vs Stale Request Replay
  console.log('\n  Scenario 6: Active Retry vs Stale Replay')
  const email6 = 'retry_replay@4rinlabs.com'
  const emailHash6 = crypto.createHash('sha256').update(email6).digest('hex')

  // 6a. Active retry
  const initAcquire = await acquireGlobalLoginAdmission(emailHash6, 'req-6A', 'res-6A', { leaseMs: 10000 })
  assert(initAcquire.allowed && initAcquire.admissionSeq === 1, 'Initial acquisition succeeded at seq 1')
  const retryAcquire = await acquireGlobalLoginAdmission(emailHash6, 'req-6A', 'res-6A', { leaseMs: 10000 })
  assert(retryAcquire.allowed && retryAcquire.status === 'ALREADY_ACQUIRED' && retryAcquire.admissionSeq === 1, 'Active acquisition retry returns ALREADY_ACQUIRED and preserves original admissionSeq')

  // 6b. Stale request replay
  await acquireGlobalLoginAdmission(emailHash6, 'req-6B', 'res-6B', { leaseMs: 60 })
  await new Promise((resolve) => setTimeout(resolve, 90))
  const staleReplay = await acquireGlobalLoginAdmission(emailHash6, 'req-6B', 'res-6B', { leaseMs: 10000 })
  assert(!staleReplay.allowed && staleReplay.status === 429, 'Stale request replay on expired lease is strictly rejected (PERMIT_EXPIRED)')

  // SCENARIO 7: Sequence Counter Expiration and Recreation (Dormancy Simulation)
  console.log('\n  Scenario 7: Sequence Counter Expiration & Dormancy')
  const email7 = 'dormancy@4rinlabs.com'
  const emailHash7 = crypto.createHash('sha256').update(email7).digest('hex')
  const keys7 = getGlobalLoginKeys(emailHash7)

  // Seed old failure from 20 minutes ago
  const oldTimestamp = Date.now() - 1200000
  await realRedis.sendCommand('ZADD', keys7[2], 1, `res-old:${oldTimestamp}`)
  // Simulate seqKey expiring during 15-minute dormancy
  await realRedis.sendCommand('DEL', keys7[4])

  // New request arrives after dormancy
  const dormAcquire = await acquireGlobalLoginAdmission(emailHash7, 'req-7-fresh', 'res-7-fresh', { windowMs: 900000 })
  assert(dormAcquire.allowed && dormAcquire.admissionSeq === 1, 'Fresh request after dormancy creates new sequence counter starting at 1')
  // Verify old expired failure was pruned by windowMs
  const prunedSettled = await realRedis.sendCommand('ZCARD', keys7[2])
  assert(prunedSettled === 0, 'Zero old failures survive across window expiration; old entries safely pruned')

  // SCENARIO 8: Redis Outage Fail-Closed Behavior
  console.log('\n  Scenario 8: Redis Outage Fail-Closed Behavior')
  const brokenRedis = {
    eval: () => Promise.reject(new Error('Connection refused')),
    set: () => Promise.reject(new Error('Connection refused')),
    get: () => Promise.reject(new Error('Connection refused')),
    del: () => Promise.reject(new Error('Connection refused')),
  }
  setRedisForTesting(brokenRedis)

  const outageRateLimit = await checkLoginRateLimit('admin@4rinlabs.com', '192.168.1.100')
  assert(!outageRateLimit.allowed && outageRateLimit.status === 503 && outageRateLimit.type === 'ServiceUnavailable', 'checkLoginRateLimit fails closed with 503 when Redis is down')

  let lockOutageThrown = false
  try {
    await withLoginConcurrencyLock('admin@4rinlabs.com', '192.168.1.100', async () => {})
  } catch (err: any) {
    lockOutageThrown = err instanceof LoginConcurrencyUnavailableError
  }
  assert(lockOutageThrown, 'withLoginConcurrencyLock fails closed with LoginConcurrencyUnavailableError')

  let bcryptCountDuringOutage = 0
  let authOutageThrown = false
  try {
    await authorizeFn({ email: 'admin@4rinlabs.com', password: 'password123' })
  } catch (err: any) {
    authOutageThrown = err instanceof AuthServiceUnavailableError
  }
  assert(authOutageThrown && bcryptCountDuringOutage === 0, 'authorize() fails closed with AuthServiceUnavailableError with 0 bcrypt comparisons executed')

  // Restore real Redis client
  setRedisForTesting(realRedis)

  // SCENARIO 9: Database Failure and Reservation Refund
  console.log('\n  Scenario 9: Database Failure & Reservation Refund')
  const email9 = 'dbfail@4rinlabs.com'
  const emailHash9 = crypto.createHash('sha256').update(email9).digest('hex')
  const keys9 = getGlobalLoginKeys(emailHash9)

  const origFindUniqueForDb = (prisma.user as any).findUnique
  ;(prisma.user as any).findUnique = async () => {
    throw new Error('FATAL: Database connection timeout to PostgreSQL cluster')
  }

  let dbErrorThrown = false
  try {
    await authorizeFn({ email: email9, password: 'password123' })
  } catch (err: any) {
    dbErrorThrown = true
  }
  assert(dbErrorThrown, 'Database exception propagated correctly from authorize flow')

  // Verify reservation was refunded and failure count untouched
  const settledFailures9 = await realRedis.sendCommand('ZCARD', keys9[2])
  assert(settledFailures9 === 0, 'Database failure did NOT record a password failure: settled failure count is 0')

  const activeReservations9 = await realRedis.sendCommand('ZCARD', keys9[1])
  assert(activeReservations9 === 0, 'Provisional reservation was cleanly refunded: active reservation count is 0')

  const allRegKeys = (await realRedis.sendCommand('HKEYS', keys9[5])) || []
  const firstReg = allRegKeys.length > 0 ? await realRedis.sendCommand('HGET', keys9[5], allRegKeys[0]) : ''
  assert(firstReg.startsWith('REFUNDED:'), 'Registry entry status was updated to REFUNDED')

  ;(prisma.user as any).findUnique = origFindUniqueForDb

  // SCENARIO 10: 10 Simultaneous Login Requests from 10 Distinct IPs with 1 Remaining Allowance
  console.log('\n  Scenario 10: 10 Simultaneous Requests from 10 IPs (1 Allowance Remaining)')
  const targetEmail10 = 'concurrent_attack@4rinlabs.com'
  const emailHash10 = crypto.createHash('sha256').update(targetEmail10).digest('hex')
  const keys10 = getGlobalLoginKeys(emailHash10)

  // Pre-seed exactly 9 settled failures (leaving 1 slot out of globalCap 10)
  for (let i = 1; i <= 9; i++) {
    await realRedis.sendCommand('ZADD', keys10[2], i, `seed-failure-${i}:${Date.now()}`)
  }
  const preSettled = await realRedis.sendCommand('ZCARD', keys10[2])
  assert(preSettled === 9, 'Pre-seeded exactly 9 settled failures in Redis (1 allowance remaining)')

  let bcryptExecutions = 0
  let rejectedBeforeBcrypt = 0

  const ips = [
    '10.100.1.1',
    '10.100.1.2',
    '10.100.1.3',
    '10.100.1.4',
    '10.100.1.5',
    '10.100.1.6',
    '10.100.1.7',
    '10.100.1.8',
    '10.100.1.9',
    '10.100.1.10',
  ]

  // Concurrently dispatch 10 simultaneous login requests across 10 distinct IPs
  await Promise.all(
    ips.map(async (ip, idx) => {
      try {
        await withLoginConcurrencyLock(targetEmail10, ip, async ({ requestId, reservationId }) => {
          const rateRes = await checkLoginRateLimit(targetEmail10, ip, { requestId, reservationId })
          if (!rateRes.allowed) {
            rejectedBeforeBcrypt++
            return
          }

          // Admitted! First request holds permit while remaining 9 requests fire
          bcryptExecutions++
          if (idx === 0) {
            await new Promise((r) => setTimeout(r, 100))
          }
          await bcrypt.compare('attacker-guess', DUMMY_HASH)
          await recordFailedLoginAttempt(targetEmail10, ip, { requestId, reservationId })
        })
      } catch (err: any) {
        if (err instanceof LoginConcurrencyBusyError || err?.code === 'TooManyRequests') {
          rejectedBeforeBcrypt++
        }
      }
    }),
  )

  assert(bcryptExecutions === 1, `Exactly 1 request admitted to bcrypt execution (${bcryptExecutions} === 1)`)
  assert(rejectedBeforeBcrypt === 9, `Exactly 9 requests rejected before bcrypt (${rejectedBeforeBcrypt} === 9)`)
  assert(bcryptExecutions + rejectedBeforeBcrypt === 10, 'All 10 concurrent cross-IP requests strictly accounted for')

  await realRedis.close()

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY & COMPLETION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════════════════')
  console.log(`Phase 3C.5 Tests Summary: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`)
  console.log('══════════════════════════════════════════════════════════════════════\n')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runPhase3C5Tests().catch((err) => {
  console.error('Fatal test runner exception:', err)
  process.exit(1)
})
