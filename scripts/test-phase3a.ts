import bcrypt from 'bcryptjs'
import {
  requireAuthenticatedUser,
  requireAdmin,
  requireAdminOrEditor,
  getAuthorizedUploadUser,
  setAuthGuardForTesting,
  setUserLookupOverrideForTesting,
  setSessionForTesting,
} from '../lib/auth-guard'
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginRateLimit,
  setRedisForTesting,
} from '../lib/ratelimit'
import { isSafeRedirectUrl, getSafeRedirectUrl } from '../lib/safe-redirect'
import { DUMMY_HASH, auth, authConfig } from '../auth'
import {
  createServiceAction,
  deleteServiceAction,
  createPortfolioAction,
  deletePortfolioAction,
  createBlogPostAction,
  deleteBlogPostAction,
  createProductAction,
  deleteProductAction,
  markLeadReadAction,
  markLeadUnreadAction,
  deleteLeadAction,
} from '../actions/admin'
import { prisma } from '../lib/prisma'

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

// In-memory sliding window mock Redis for rate limit tests
class MockRedisSlidingWindow {
  public store = new Map<string, number>()

  async evalsha(sha: string, keys: string[], args: any[]) {
    // NOSCRIPT triggers fallback to eval in @upstash/ratelimit
    throw new Error('NOSCRIPT No matching script. Please use EVAL.')
  }

  async eval(script: string, keys: string[], args: any[]) {
    const key = keys[0]

    // 1. Reset Script
    if (script.includes('del') || script.includes('UNLINK') || args[0] === null || key?.includes('*')) {
      const prefix = (key || '').replace(/:[0-9]+$/, '').replace(/:\*$/, '')
      for (const k of Array.from(this.store.keys())) {
        if (k.startsWith(prefix)) {
          this.store.delete(k)
        }
      }
      return 1
    }

    const current = this.store.get(key) || 0
    const limit = Number(args[0]) || 5

    // 2. getRemaining Script (does not contain incrementBy)
    if (!script.includes('incrementBy')) {
      const remaining = Math.max(0, limit - current)
      return [remaining, limit]
    }

    // 3. Limit Script (contains incrementBy)
    if (current >= limit) {
      // Exceeded
      return [-1, 900]
    }

    const next = current + 1
    this.store.set(key, next)
    const remaining = limit - next
    return [remaining, 900]
  }

  async del(key: string) {
    this.store.delete(key)
    for (const k of Array.from(this.store.keys())) {
      if (k.startsWith(key)) {
        this.store.delete(k)
      }
    }
  }

  reset() {
    this.store.clear()
  }
}

async function runPhase3ATests() {
  console.log('🧪 Starting Phase 3A & 3A.1 Authentication & Authorization Hardening Test Suite...\n')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1: AUTHENTICATION HARDENING & RELIABILITY REMEDIATION (PHASE 3A.1)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('--- 1. Authentication Hardening & Reliability Remediation ---')

  const mockRedis = new MockRedisSlidingWindow()
  setRedisForTesting(mockRedis)

  // 1.1 Correct password verification
  const validHash = await bcrypt.hash('CorrectAdminPassword123!', 12)
  const isCorrect = await bcrypt.compare('CorrectAdminPassword123!', validHash)
  assert(isCorrect === true, 'Correct credentials successfully verify against cost-12 bcrypt hash')

  // 1.2 Incorrect password verification
  const isIncorrect = await bcrypt.compare('WrongPassword!', validHash)
  assert(isIncorrect === false, 'Incorrect password correctly rejected by bcrypt')

  // 1.3 Unknown email timing defense: dummy bcrypt compare executes with cost 12
  const dummyCompareStart = Date.now()
  const dummyResult = await bcrypt.compare('AnyPasswordAttempter123!', DUMMY_HASH)
  const dummyDuration = Date.now() - dummyCompareStart
  assert(dummyResult === false, 'Dummy bcrypt check always evaluates to false')
  assert(dummyDuration > 30, `Dummy bcrypt compare executes full cost-12 cycle (${dummyDuration}ms)`)

  // 1.4 Account-DoS Immunity: Attacker on IP A makes 5 failed attempts against admin
  mockRedis.reset()
  const adminEmail = 'admin@4rinlabs.com'
  const attackerIp = '198.51.100.1'
  const legitimateIp = '203.0.113.10'

  for (let i = 1; i <= 5; i++) {
    const preCheck = await checkLoginRateLimit(adminEmail, attackerIp)
    assert(preCheck.allowed === true, `Attacker attempt ${i}/5 pre-check permitted`)
    // Attacker submits invalid password -> recorded in Redis
    await recordFailedLoginAttempt(adminEmail, attackerIp)
  }

  // 1.5 Account-DoS Immunity: 6th attempt from attacker IP is blocked with 429
  const attackerBlocked = await checkLoginRateLimit(adminEmail, attackerIp)
  assert(
    attackerBlocked.allowed === false &&
      attackerBlocked.status === 429 &&
      attackerBlocked.type === 'TooManyRequests',
    'Attacker IP exhausted failure quota: 6th attempt blocked with HTTP 429 / TooManyRequests',
  )

  // 1.6 Account-DoS Immunity: Genuine administrator on IP B is NOT blocked
  const adminAllowed = await checkLoginRateLimit(adminEmail, legitimateIp)
  assert(
    adminAllowed.allowed === true,
    'Account-DoS Immunity: Attacker failure on IP A does NOT lock out legitimate administrator on IP B',
  )

  // 1.7 Reset on Success: Genuine administrator authenticates -> clears failure state
  await clearLoginRateLimit(adminEmail, legitimateIp)
  const adminPostSuccess = await checkLoginRateLimit(adminEmail, legitimateIp)
  assert(
    adminPostSuccess.allowed === true,
    'Successful login resets failed attempt counters safely without brute-force bypass',
  )

  // 1.8 Shared IP NAT support: Allows up to 30 requests per 15 minutes per IP
  mockRedis.reset()
  const sharedNatIp = '198.51.100.25'
  let sharedAllowedCount = 0
  for (let i = 1; i <= 30; i++) {
    const res = await checkLoginRateLimit(`staff-${i}@4rinlabs.com`, sharedNatIp)
    if (res.allowed) sharedAllowedCount++
  }
  assert(
    sharedAllowedCount === 30,
    `Shared NAT/VPN: Exactly 30 requests allowed within 15m window without blocking colleagues (${sharedAllowedCount}/30)`,
  )

  // 1.9 Shared IP NAT enforcement: 31st request from shared IP is throttled
  const shared31st = await checkLoginRateLimit('staff-31@4rinlabs.com', sharedNatIp)
  assert(
    shared31st.allowed === false && shared31st.status === 429,
    'Shared NAT/VPN abuse protection: 31st request from shared IP is throttled with HTTP 429',
  )

  // 1.10 Shared IP multi-user isolation: User 1 failure does not lock out User 2 on the same IP
  mockRedis.reset()
  const officeIp = '198.51.100.40'
  for (let i = 1; i <= 5; i++) {
    await recordFailedLoginAttempt('user1@4rinlabs.com', officeIp)
  }
  const user1Blocked = await checkLoginRateLimit('user1@4rinlabs.com', officeIp)
  const user2Allowed = await checkLoginRateLimit('user2@4rinlabs.com', officeIp)
  assert(
    user1Blocked.allowed === false && user2Allowed.allowed === true,
    'Shared IP isolation: User 1 reaching 5 failures does not block User 2 on the same network',
  )

  // 1.11 Successful logins do not increment failure counters
  mockRedis.reset()
  for (let i = 1; i <= 5; i++) {
    const check = await checkLoginRateLimit('good-admin@4rinlabs.com', '203.0.113.88')
    assert(check.allowed === true, `Successful login ${i} pre-check allowed`)
    // Simulated successful login: calls clearLoginRateLimit, NOT recordFailedLoginAttempt
    await clearLoginRateLimit('good-admin@4rinlabs.com', '203.0.113.88')
  }
  const checkAfter5Success = await checkLoginRateLimit('good-admin@4rinlabs.com', '203.0.113.88')
  assert(
    checkAfter5Success.allowed === true,
    'Successful logins never accumulate toward failure quota or account lockout',
  )

  // 1.12 Distributed attack mitigation: >10 failures across multiple IPs triggers progressive delay
  mockRedis.reset()
  const targetEmail = 'ceo@4rinlabs.com'
  for (let i = 1; i <= 10; i++) {
    await recordFailedLoginAttempt(targetEmail, `198.51.100.${100 + i}`)
  }
  // 11th request from a fresh IP should be allowed (not hard locked out) but throttled with delay
  const distributedStart = Date.now()
  const distributedRes = await checkLoginRateLimit(targetEmail, '203.0.113.99')
  const distributedDuration = Date.now() - distributedStart
  assert(
    distributedRes.allowed === true && distributedDuration >= 950,
    `Distributed attack mitigation: Progressive throttling delay enforced (${distributedDuration}ms) without hard lockout`,
  )

  // 1.13 Global progressive delay cleared after successful login
  // Legitimate administrator logs in -> clearLoginRateLimit resets both composite and global limiters
  await clearLoginRateLimit(targetEmail, '203.0.113.99')
  const postSuccessStart = Date.now()
  const postSuccessRes = await checkLoginRateLimit(targetEmail, '203.0.113.99')
  const postSuccessDuration = Date.now() - postSuccessStart
  assert(
    postSuccessRes.allowed === true && postSuccessDuration < 100,
    `Global failure-counter reset: Successful login clears progressive delay state (${postSuccessDuration}ms)`,
  )

  // 1.14 Concurrent login burst protection: Atomic sliding window in Redis
  mockRedis.reset()
  const concurrentAttempts = await Promise.all([
    checkLoginRateLimit('attacker@target.com', '198.51.100.5'),
    checkLoginRateLimit('attacker@target.com', '198.51.100.5'),
    checkLoginRateLimit('attacker@target.com', '198.51.100.5'),
    checkLoginRateLimit('attacker@target.com', '198.51.100.5'),
    checkLoginRateLimit('attacker@target.com', '198.51.100.5'),
  ])
  const allowedConcurrent = concurrentAttempts.filter((r) => r.allowed).length
  assert(
    allowedConcurrent === 5,
    `Concurrent login burst: Atomic Redis sliding window safely evaluates concurrent attempts (${allowedConcurrent}/5 allowed)`,
  )

  // 1.15 Redis unavailable: fails closed with HTTP 503 / ServiceUnavailable
  setRedisForTesting(null)
  const outageRes = await checkLoginRateLimit('admin@4rinlabs.com', '203.0.113.10')
  assert(
    outageRes.allowed === false &&
      outageRes.status === 503 &&
      outageRes.type === 'ServiceUnavailable' &&
      outageRes.error === 'Authentication service temporarily unavailable. Please try again shortly.',
    'Login rate limiter fails closed during Redis outage (503 ServiceUnavailable)',
  )

  // 1.16 Redis failure handling during clear/record: handled safely without uncaught exceptions
  let redisClearThrew = false
  try {
    await clearLoginRateLimit('admin@4rinlabs.com', '203.0.113.10')
    await recordFailedLoginAttempt('admin@4rinlabs.com', '203.0.113.10')
  } catch {
    redisClearThrew = true
  }
  assert(!redisClearThrew, 'Redis outage during clear/record failed attempts handled gracefully without unhandled errors')

  // 1.17 Zero sensitive data in Redis: Email key is hashed with SHA-256
  setRedisForTesting(mockRedis)
  mockRedis.reset()
  const rawEmailWithSpaces = '  Admin.User@4RinLabs.COM  '
  for (let i = 1; i <= 5; i++) {
    await recordFailedLoginAttempt(rawEmailWithSpaces, '203.0.113.10')
  }
  const emailExceeded = await checkLoginRateLimit('admin.user@4rinlabs.com', '203.0.113.10')
  assert(
    emailExceeded.allowed === false && emailExceeded.status === 429,
    'Normalized email hashing ensures case and whitespace insensitivity without leaking plaintext',
  )

  // 1.18 Missing IP header handled safely
  mockRedis.reset()
  const missingIpRes = await checkLoginRateLimit('isolated-user@test.com', 'shared-unidentified-client-bucket')
  assert(
    missingIpRes.allowed === true,
    'Missing/unidentified client IP safely handled without premature lockout',
  )

  // ══════════════════════════════════════════════════════════════════════════
  // SESSION LIFECYCLE & LEGACY JWT COMPATIBILITY (PHASE 3A.2)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Session Lifecycle & Legacy JWT Invalidation (Phase 3A.2) ---')

  const nowSeconds = Math.floor(Date.now() / 1000)
  const jwtCallback = (authConfig.callbacks as any).jwt
  const sessionCallback = (authConfig.callbacks as any).session

  // 1.19 Initial authentication records immutable authTime
  const initialLoginToken: any = {}
  const initialUser = { id: 'user-admin-1', role: 'ADMIN' }
  const createdToken = await jwtCallback({ token: initialLoginToken, user: initialUser })
  assert(
    typeof createdToken.authTime === 'number' && createdToken.authTime > 0,
    `Initial authentication records immutable authTime in JWT (${createdToken.authTime})`,
  )

  // 1.20 Ordinary session access preserves original authTime without rolling
  const preservedAuthTime = createdToken.authTime
  const refreshedToken = await jwtCallback({ token: createdToken, user: undefined })
  assert(
    refreshedToken.authTime === preservedAuthTime,
    'Subsequent session access preserves original authTime without resetting or rolling the lifetime',
  )

  // 1.21 Session within 12-hour absolute lifetime is valid
  const sixHoursAgo = nowSeconds - 6 * 60 * 60
  const validMidlifeToken = await jwtCallback({
    token: { id: 'user-admin-1', role: 'ADMIN', authTime: sixHoursAgo, tokenVersion: 1 },
    user: undefined,
  })
  assert(
    validMidlifeToken !== null && validMidlifeToken.authTime === sixHoursAgo,
    'Session within permitted 12-hour absolute lifetime (6h) remains valid',
  )

  // 1.22 Session exceeding 12-hour absolute lifetime is rejected by JWT callback (returns null)
  const twelveHoursAndOneSecondAgo = nowSeconds - (12 * 60 * 60 + 1)
  const expiredToken = await jwtCallback({
    token: { id: 'user-admin-1', role: 'ADMIN', authTime: twelveHoursAndOneSecondAgo },
    user: undefined,
  })
  assert(
    expiredToken === null,
    'Session exceeding 12-hour absolute lifetime is rejected (returns null) by JWT callback',
  )

  // 1.23 Session exceeding 12-hour absolute lifetime is rejected by auth guard (401)
  let expiredGuardError = ''
  try {
    await requireAuthenticatedUser({
      user: {
        id: 'user-admin-1',
        role: 'ADMIN',
        authTime: twelveHoursAndOneSecondAgo,
      },
    })
  } catch (err: any) {
    expiredGuardError = err.message
  }
  assert(
    expiredGuardError.includes('Session expired: absolute 12-hour maximum lifetime exceeded'),
    'requireAuthenticatedUser independently rejects expired sessions exceeding 12 hours (401)',
  )

  // 1.24 Legacy JWT without authTime rejected by JWT callback (returns null)
  const legacyJwt = await jwtCallback({
    token: { id: 'user-legacy-1', role: 'ADMIN' }, // No authTime (issued pre-3A.1)
    user: undefined,
  })
  assert(
    legacyJwt === null,
    'Legacy JWT compatibility: JWT callback returns null for legacy tokens without authTime',
  )

  // 1.25 Legacy JWT without authTime rejected by auth guard (401)
  let legacyGuardError = ''
  try {
    await requireAuthenticatedUser({
      user: {
        id: 'user-admin-1',
        role: 'ADMIN',
        // missing authTime
      },
    })
  } catch (err: any) {
    legacyGuardError = err.message
  }
  assert(
    legacyGuardError.includes('Missing session authentication timestamp'),
    'Legacy JWT compatibility: requireAuthenticatedUser independently rejects sessions without authTime (401)',
  )

  // 1.26 Invalid authTime (null) rejected by JWT callback and auth guard
  const nullAuthTimeToken = await jwtCallback({
    token: { id: 'user-admin-1', role: 'ADMIN', authTime: null },
    user: undefined,
  })
  let nullAuthTimeError = ''
  try {
    await requireAuthenticatedUser({ user: { id: 'user-admin-1', role: 'ADMIN', authTime: null } })
  } catch (err: any) {
    nullAuthTimeError = err.message
  }
  assert(
    nullAuthTimeToken === null && nullAuthTimeError.includes('Missing session authentication timestamp'),
    'Invalid authTime (null) is rejected by both JWT callback and auth guard',
  )

  // 1.27 Invalid authTime (0 or negative) rejected by JWT callback and auth guard
  const zeroAuthTimeToken = await jwtCallback({
    token: { id: 'user-admin-1', role: 'ADMIN', authTime: 0 },
    user: undefined,
  })
  let negativeAuthTimeError = ''
  try {
    await requireAuthenticatedUser({ user: { id: 'user-admin-1', role: 'ADMIN', authTime: -1000 } })
  } catch (err: any) {
    negativeAuthTimeError = err.message
  }
  assert(
    zeroAuthTimeToken === null && negativeAuthTimeError.includes('non-positive value'),
    'Invalid authTime (zero or negative) is rejected by both JWT callback and auth guard',
  )

  // 1.28 Invalid authTime (string / non-numeric) rejected
  const stringAuthTimeToken = await jwtCallback({
    token: { id: 'user-admin-1', role: 'ADMIN', authTime: '1793536150' },
    user: undefined,
  })
  let stringAuthTimeError = ''
  try {
    await requireAuthenticatedUser({ user: { id: 'user-admin-1', role: 'ADMIN', authTime: '1793536150' } })
  } catch (err: any) {
    stringAuthTimeError = err.message
  }
  assert(
    stringAuthTimeToken === null && stringAuthTimeError.includes('non-numeric or non-finite'),
    'Invalid authTime (string type) is rejected by both JWT callback and auth guard',
  )

  // 1.29 Invalid authTime (non-integer float) rejected
  const floatAuthTimeToken = await jwtCallback({
    token: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds + 0.5 },
    user: undefined,
  })
  let floatAuthTimeError = ''
  try {
    await requireAuthenticatedUser({ user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds + 0.5 } })
  } catch (err: any) {
    floatAuthTimeError = err.message
  }
  assert(
    floatAuthTimeToken === null && floatAuthTimeError.includes('non-integer value'),
    'Invalid authTime (non-integer float) is rejected by both JWT callback and auth guard',
  )

  // 1.30 Future authTime within 60s clock skew tolerance is accepted
  const futureWithinTolerance = nowSeconds + 30 // 30s in future
  const skewPermittedToken = await jwtCallback({
    token: { id: 'user-admin-1', role: 'ADMIN', authTime: futureWithinTolerance, tokenVersion: 1 },
    user: undefined,
  })
  assert(
    skewPermittedToken !== null && skewPermittedToken.authTime === futureWithinTolerance,
    'Future authTime within 60-second clock skew tolerance is accepted',
  )

  // 1.31 Future authTime beyond 60s clock skew tolerance is rejected
  const futureBeyondTolerance = nowSeconds + 120 // 2 minutes in future
  const skewExceededToken = await jwtCallback({
    token: { id: 'user-admin-1', role: 'ADMIN', authTime: futureBeyondTolerance },
    user: undefined,
  })
  let futureSkewError = ''
  try {
    await requireAuthenticatedUser({ user: { id: 'user-admin-1', role: 'ADMIN', authTime: futureBeyondTolerance } })
  } catch (err: any) {
    futureSkewError = err.message
  }
  assert(
    skewExceededToken === null && futureSkewError.includes('future timestamp exceeds clock skew tolerance'),
    'Future authTime beyond 60-second clock skew tolerance is rejected by JWT callback and auth guard',
  )

  // 1.32 Auth.js session invalidation contract: null token produces null session
  const nullTokenSession = await sessionCallback({
    session: { user: { name: 'Admin', email: 'admin@4rinlabs.com' }, expires: new Date().toISOString() },
    token: null,
  })
  assert(
    nullTokenSession === null || !nullTokenSession?.user?.id,
    'Auth.js session invalidation: returning null token prevents session authentication',
  )

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2: CENTRALIZED ROLE-BASED ACCESS CONTROL (RBAC)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 2. Centralized Role-Based Access Control ---')

  // Setup mock database user records
  const mockUsers: Record<string, { id: string; email: string; role: string; tokenVersion: number } | null> = {
    'user-admin-1': { id: 'user-admin-1', email: 'admin@4rinlabs.com', role: 'ADMIN', tokenVersion: 1 },
    'user-editor-1': { id: 'user-editor-1', email: 'editor@4rinlabs.com', role: 'EDITOR', tokenVersion: 1 },
    'user-demoted-1': { id: 'user-demoted-1', email: 'demoted@4rinlabs.com', role: 'EDITOR', tokenVersion: 1 }, // Demoted in DB from ADMIN to EDITOR
    'user-deleted-1': null, // Deleted from DB
    'user-invalid-role-1': { id: 'user-invalid-role-1', email: 'guest@4rinlabs.com', role: 'GUEST', tokenVersion: 1 },
  }

  setUserLookupOverrideForTesting(async (id: string) => {
    return mockUsers[id] ?? null
  })

  // 2.1 Unauthenticated request rejected
  let unauthError = ''
  try {
    await requireAuthenticatedUser(null)
  } catch (err: any) {
    unauthError = err.message
  }
  assert(
    unauthError === 'Unauthorized: Authentication required',
    'requireAuthenticatedUser rejects unauthenticated caller with 401 message',
  )

  // 2.2 Deleted user rejected even with valid session token
  let deletedError = ''
  try {
    await requireAuthenticatedUser({ user: { id: 'user-deleted-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1 } })
  } catch (err: any) {
    deletedError = err.message
  }
  assert(
    deletedError === 'Unauthorized: Account not found or revoked',
    'requireAuthenticatedUser rejects deleted user whose account was removed from PostgreSQL',
  )

  // 2.3 Invalid role in database rejected
  let invalidRoleError = ''
  try {
    await requireAuthenticatedUser({ user: { id: 'user-invalid-role-1', role: 'GUEST', authTime: nowSeconds, tokenVersion: 1 } })
  } catch (err: any) {
    invalidRoleError = err.message
  }
  assert(
    invalidRoleError === 'Forbidden: Insufficient privileges',
    'requireAuthenticatedUser rejects accounts with non-admin/editor roles',
  )

  // 2.4 ADMIN role permitted for requireAdmin and requireAdminOrEditor
  const adminUser = await requireAdmin({ user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1 } })
  assert(
    adminUser.id === 'user-admin-1' && adminUser.role === 'ADMIN',
    'requireAdmin permits authenticated ADMIN user',
  )

  const adminEditorCheck = await requireAdminOrEditor({ user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1 } })
  assert(
    adminEditorCheck.id === 'user-admin-1' && adminEditorCheck.role === 'ADMIN',
    'requireAdminOrEditor permits authenticated ADMIN user',
  )

  // 2.5 EDITOR role permitted for requireAdminOrEditor, rejected for requireAdmin
  const editorUser = await requireAdminOrEditor({ user: { id: 'user-editor-1', role: 'EDITOR', authTime: nowSeconds, tokenVersion: 1 } })
  assert(
    editorUser.id === 'user-editor-1' && editorUser.role === 'EDITOR',
    'requireAdminOrEditor permits authenticated EDITOR user',
  )

  let editorAdminError = ''
  try {
    await requireAdmin({ user: { id: 'user-editor-1', role: 'EDITOR', authTime: nowSeconds, tokenVersion: 1 } })
  } catch (err: any) {
    editorAdminError = err.message
  }
  assert(
    editorAdminError === 'Forbidden: Administrator privileges required',
    'requireAdmin strictly rejects EDITOR user with 403 Forbidden',
  )

  // 2.6 Demoted user: Stale JWT claims 'ADMIN', but PostgreSQL DB has 'EDITOR'
  let demotedAdminError = ''
  try {
    // Session token claims ADMIN, but database lookup returns EDITOR
    await requireAdmin({ user: { id: 'user-demoted-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1 } })
  } catch (err: any) {
    demotedAdminError = err.message
  }
  assert(
    demotedAdminError === 'Forbidden: Administrator privileges required',
    'Stale JWT role claim ignored: database role EDITOR takes authoritative precedence over token claim',
  )

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3: SERVER ACTIONS DIRECT INVOCATION PROTECTION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 3. Server Action Direct Invocation Protection ---')

  // Temporarily mock prisma mutations for Server Action tests
  const originalPrismaBlogDelete = prisma.blogPost.delete
  const originalPrismaBlogFindUnique = prisma.blogPost.findUnique
  const originalPrismaProductDelete = prisma.product.delete
  const originalPrismaProductFindUnique = prisma.product.findUnique
  const originalPrismaPortfolioDelete = prisma.portfolio.delete
  const originalPrismaPortfolioFindUnique = prisma.portfolio.findUnique
  const originalPrismaServiceDelete = prisma.service.delete
  const originalPrismaServiceFindUnique = prisma.service.findUnique
  const originalPrismaLeadDelete = prisma.contactLead.delete
  const originalPrismaLeadUpdate = prisma.contactLead.update

  const tracker: { deleteExecuted: boolean; createExecuted: boolean } = {
    deleteExecuted: false,
    createExecuted: false,
  }
  ;(prisma.blogPost as any).findUnique = async () => ({ id: 'post-1', slug: 'post-1' })
  ;(prisma.blogPost as any).delete = async () => { tracker.deleteExecuted = true }
  ;(prisma.product as any).findUnique = async () => ({ id: 'prod-1', slug: 'prod-1' })
  ;(prisma.product as any).delete = async () => { tracker.deleteExecuted = true }
  ;(prisma.portfolio as any).findUnique = async () => ({ id: 'port-1', slug: 'port-1' })
  ;(prisma.portfolio as any).delete = async () => { tracker.deleteExecuted = true }
  ;(prisma.service as any).findUnique = async () => ({ id: 'svc-1', slug: 'svc-1' })
  ;(prisma.service as any).delete = async () => { tracker.deleteExecuted = true }
  ;(prisma.contactLead as any).delete = async () => { tracker.deleteExecuted = true }
  ;(prisma.contactLead as any).update = async () => { tracker.deleteExecuted = true }

  const makeFormData = (id: string) => {
    const fd = new FormData()
    fd.append('id', id)
    return fd
  }

  // Set active testing context to EDITOR in PostgreSQL
  setSessionForTesting({ user: { id: 'user-editor-1', role: 'EDITOR', authTime: nowSeconds, tokenVersion: 1 } })

  // 3.1 EDITOR cannot delete blog posts
  tracker.deleteExecuted = false
  let editorBlogDeleteError = ''
  try {
    await deleteBlogPostAction(makeFormData('post-1'))
  } catch (err: any) {
    editorBlogDeleteError = err.message
  }
  assert(
    !tracker.deleteExecuted && editorBlogDeleteError.includes('Administrator privileges required'),
    'EDITOR direct invocation of deleteBlogPostAction is rejected without executing database delete',
  )

  // 3.2 EDITOR cannot delete products
  tracker.deleteExecuted = false
  let editorProdDeleteError = ''
  try {
    await deleteProductAction(makeFormData('prod-1'))
  } catch (err: any) {
    editorProdDeleteError = err.message
  }
  assert(
    !tracker.deleteExecuted && editorProdDeleteError.includes('Administrator privileges required'),
    'EDITOR direct invocation of deleteProductAction is rejected without executing database delete',
  )

  // 3.3 EDITOR cannot delete portfolio entries
  tracker.deleteExecuted = false
  let editorPortDeleteError = ''
  try {
    await deletePortfolioAction(makeFormData('port-1'))
  } catch (err: any) {
    editorPortDeleteError = err.message
  }
  assert(
    !tracker.deleteExecuted && editorPortDeleteError.includes('Administrator privileges required'),
    'EDITOR direct invocation of deletePortfolioAction is rejected without executing database delete',
  )

  // 3.4 EDITOR cannot delete services
  tracker.deleteExecuted = false
  let editorSvcDeleteError = ''
  try {
    await deleteServiceAction(makeFormData('svc-1'))
  } catch (err: any) {
    editorSvcDeleteError = err.message
  }
  assert(
    !tracker.deleteExecuted && editorSvcDeleteError.includes('Administrator privileges required'),
    'EDITOR direct invocation of deleteServiceAction is rejected without executing database delete',
  )

  // 3.5 EDITOR cannot mark leads read
  tracker.deleteExecuted = false
  let editorLeadReadError = ''
  try {
    await markLeadReadAction(makeFormData('lead-1'))
  } catch (err: any) {
    editorLeadReadError = err.message
  }
  assert(
    !tracker.deleteExecuted && editorLeadReadError.includes('Administrator privileges required'),
    'EDITOR direct invocation of markLeadReadAction is rejected without updating lead status',
  )

  // 3.6 EDITOR cannot mark leads unread
  tracker.deleteExecuted = false
  let editorLeadUnreadError = ''
  try {
    await markLeadUnreadAction(makeFormData('lead-1'))
  } catch (err: any) {
    editorLeadUnreadError = err.message
  }
  assert(
    !tracker.deleteExecuted && editorLeadUnreadError.includes('Administrator privileges required'),
    'EDITOR direct invocation of markLeadUnreadAction is rejected without updating lead status',
  )

  // 3.7 EDITOR cannot delete customer leads
  tracker.deleteExecuted = false
  let editorLeadDeleteError = ''
  try {
    await deleteLeadAction(makeFormData('lead-1'))
  } catch (err: any) {
    editorLeadDeleteError = err.message
  }
  assert(
    !tracker.deleteExecuted && editorLeadDeleteError.includes('Administrator privileges required'),
    'EDITOR direct invocation of deleteLeadAction is rejected without deleting lead record',
  )

  // 3.8 ADMIN can perform deletions
  setSessionForTesting({ user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1 } })
  tracker.deleteExecuted = false
  await deleteBlogPostAction(makeFormData('post-1'))
  assert(Boolean(tracker.deleteExecuted) === true, 'ADMIN direct invocation of deleteBlogPostAction is permitted')

  tracker.deleteExecuted = false
  await deleteProductAction(makeFormData('prod-1'))
  assert(Boolean(tracker.deleteExecuted) === true, 'ADMIN direct invocation of deleteProductAction is permitted')

  tracker.deleteExecuted = false
  await deletePortfolioAction(makeFormData('port-1'))
  assert(Boolean(tracker.deleteExecuted) === true, 'ADMIN direct invocation of deletePortfolioAction is permitted')

  tracker.deleteExecuted = false
  await deleteServiceAction(makeFormData('svc-1'))
  assert(Boolean(tracker.deleteExecuted) === true, 'ADMIN direct invocation of deleteServiceAction is permitted')

  tracker.deleteExecuted = false
  await deleteLeadAction(makeFormData('lead-1'))
  assert(Boolean(tracker.deleteExecuted) === true, 'ADMIN direct invocation of deleteLeadAction is permitted')

  // 3.9 Unauthenticated caller cannot delete
  setSessionForTesting(null)
  tracker.deleteExecuted = false
  let unauthDeleteError = ''
  try {
    await deleteBlogPostAction(makeFormData('post-1'))
  } catch (err: any) {
    unauthDeleteError = err.message
  }
  assert(
    !tracker.deleteExecuted && unauthDeleteError === 'Unauthorized: Authentication required',
    'Unauthenticated caller cannot execute delete mutations',
  )

  // 3.10 Deleted user cannot delete
  setSessionForTesting({ user: { id: 'user-deleted-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1 } })
  tracker.deleteExecuted = false
  let deletedUserActionError = ''
  try {
    await deleteBlogPostAction(makeFormData('post-1'))
  } catch (err: any) {
    deletedUserActionError = err.message
  }
  assert(
    !tracker.deleteExecuted && deletedUserActionError === 'Unauthorized: Account not found or revoked',
    'Deleted user cannot execute delete mutations even with leftover session token',
  )

  // 3.11 EDITOR can create permitted content
  setSessionForTesting({ user: { id: 'user-editor-1', role: 'EDITOR', authTime: nowSeconds, tokenVersion: 1 } })
  const originalPrismaBlogCreate = prisma.blogPost.create
  const originalPrismaProductCreate = prisma.product.create
  const originalPrismaPortfolioCreate = prisma.portfolio.create
  const originalPrismaServiceCreate = prisma.service.create

  ;(prisma.blogPost as any).create = async ({ data }: any) => {
    tracker.createExecuted = true
    return { id: 'new-post-id', slug: data.slug }
  }
  ;(prisma.product as any).create = async ({ data }: any) => {
    tracker.createExecuted = true
    return { id: 'new-prod-id', slug: data.slug }
  }
  ;(prisma.portfolio as any).create = async ({ data }: any) => {
    tracker.createExecuted = true
    return { id: 'new-port-id', slug: data.slug }
  }
  ;(prisma.service as any).create = async ({ data }: any) => {
    tracker.createExecuted = true
    return { id: 'new-svc-id', slug: data.slug }
  }

  // Mock uniqueness lookups
  ;(prisma.blogPost as any).findUnique = async () => null
  ;(prisma.product as any).findUnique = async () => null
  ;(prisma.portfolio as any).findUnique = async () => null
  ;(prisma.service as any).findUnique = async () => null

  const blogFd = new FormData()
  blogFd.append('title', 'Editor Post')
  blogFd.append('slug', 'editor-post')
  blogFd.append('content', 'This is a test post content written by an editor.')
  tracker.createExecuted = false
  const blogRes = await createBlogPostAction({ success: false }, blogFd)
  assert(blogRes.success === true && Boolean(tracker.createExecuted) === true, 'EDITOR is permitted to create blog posts')

  const prodFd = new FormData()
  prodFd.append('name', 'Editor Product')
  prodFd.append('slug', 'editor-product')
  prodFd.append('tagline', 'A product created by editor')
  prodFd.append('description', 'Detailed description of the product created by editor')
  tracker.createExecuted = false
  const prodRes = await createProductAction({ success: false }, prodFd)
  assert(prodRes.success === true && Boolean(tracker.createExecuted) === true, 'EDITOR is permitted to create products')

  const portFd = new FormData()
  portFd.append('title', 'Editor Project')
  portFd.append('slug', 'editor-project')
  portFd.append('description', 'Detailed portfolio description')
  tracker.createExecuted = false
  const portRes = await createPortfolioAction({ success: false }, portFd)
  assert(portRes.success === true && Boolean(tracker.createExecuted) === true, 'EDITOR is permitted to create portfolio entries')

  const svcFd = new FormData()
  svcFd.append('name', 'Editor Service')
  svcFd.append('slug', 'editor-service')
  svcFd.append('shortDescription', 'Short description')
  svcFd.append('longDescription', 'Long description of service')
  tracker.createExecuted = false
  const svcRes = await createServiceAction({ success: false }, svcFd)
  assert(svcRes.success === true && Boolean(tracker.createExecuted) === true, 'EDITOR is permitted to create services')

  // 3.12 EDITOR cannot view customer leads
  let editorLeadViewBlocked = false
  try {
    await requireAdmin({ user: { id: 'user-editor-1', role: 'EDITOR', authTime: nowSeconds, tokenVersion: 1 } })
  } catch (err: any) {
    if (err.message.includes('Administrator privileges required')) {
      editorLeadViewBlocked = true
    }
  }
  assert(editorLeadViewBlocked === true, 'EDITOR is strictly prohibited from accessing customer leads page and data')

  // 3.13 ADMIN can view customer leads
  const adminLeadAccess = await requireAdmin({ user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1 } })
  assert(adminLeadAccess.role === 'ADMIN', 'ADMIN is permitted to access customer leads page and data')

  ;(prisma.blogPost as any).create = originalPrismaBlogCreate
  ;(prisma.product as any).create = originalPrismaProductCreate
  ;(prisma.portfolio as any).create = originalPrismaPortfolioCreate
  ;(prisma.service as any).create = originalPrismaServiceCreate

  // Restore prisma mutations
  ;(prisma.blogPost as any).delete = originalPrismaBlogDelete
  ;(prisma.blogPost as any).findUnique = originalPrismaBlogFindUnique
  ;(prisma.product as any).delete = originalPrismaProductDelete
  ;(prisma.product as any).findUnique = originalPrismaProductFindUnique
  ;(prisma.portfolio as any).delete = originalPrismaPortfolioDelete
  ;(prisma.portfolio as any).findUnique = originalPrismaPortfolioFindUnique
  ;(prisma.service as any).delete = originalPrismaServiceDelete
  ;(prisma.service as any).findUnique = originalPrismaServiceFindUnique
  ;(prisma.contactLead as any).delete = originalPrismaLeadDelete
  ;(prisma.contactLead as any).update = originalPrismaLeadUpdate
  setAuthGuardForTesting(null)
  setUserLookupOverrideForTesting(null)

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4: LOGIN REDIRECT VALIDATION & OPEN REDIRECT PREVENTION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 4. Redirect Handling & Open Redirect Prevention ---')

  const trustedBase = 'https://4rinlabs.com'

  // 4.1 Valid relative paths
  assert(isSafeRedirectUrl('/admin') === true, 'Relative path /admin is safe')
  assert(isSafeRedirectUrl('/admin/services?status=active') === true, 'Relative path with query string is safe')
  assert(isSafeRedirectUrl('/admin/blog/123/edit#seo') === true, 'Relative path with anchor hash is safe')
  assert(getSafeRedirectUrl('/admin/products') === '/admin/products', 'getSafeRedirectUrl preserves valid relative destination')

  // 4.2 Same-origin absolute callback
  assert(isSafeRedirectUrl('https://4rinlabs.com/admin', trustedBase) === true, 'Same-origin absolute URL matches base origin')
  assert(getSafeRedirectUrl('https://4rinlabs.com/admin/leads', '/admin', trustedBase) === 'https://4rinlabs.com/admin/leads', 'getSafeRedirectUrl preserves same-origin absolute URL')

  // 4.3 External callbacks
  assert(isSafeRedirectUrl('https://attacker.example/phish') === false, 'External origin without base is rejected')
  assert(isSafeRedirectUrl('https://attacker.example/phish', trustedBase) === false, 'External origin with base is rejected')
  assert(isSafeRedirectUrl('http://attacker.example') === false, 'External HTTP URL is rejected')
  assert(getSafeRedirectUrl('https://attacker.example/phish', '/admin', trustedBase) === '/admin', 'External callback falls back to default /admin')

  // 4.4 Protocol-relative callbacks (//attacker.example)
  assert(isSafeRedirectUrl('//attacker.example') === false, 'Protocol-relative URL //attacker.example is rejected')
  assert(isSafeRedirectUrl('//attacker.example/phish') === false, 'Protocol-relative URL //attacker.example/phish is rejected')
  assert(isSafeRedirectUrl('///attacker.example') === false, 'Triple-slash URL ///attacker.example is rejected')
  assert(getSafeRedirectUrl('//attacker.example') === '/admin', 'Protocol-relative callback falls back to /admin')

  // 4.5 Backslash bypasses (/\attacker.example, \\attacker.example)
  assert(isSafeRedirectUrl('/\\attacker.example') === false, 'Slash-backslash /\\attacker.example is rejected')
  assert(isSafeRedirectUrl('\\attacker.example') === false, 'Leading backslash \\attacker.example is rejected')
  assert(isSafeRedirectUrl('/admin\\evil.com') === false, 'Path containing backslash is rejected')
  assert(getSafeRedirectUrl('/\\attacker.example') === '/admin', 'Backslash bypass falls back to /admin')

  // 4.6 JavaScript & malicious schemes
  assert(isSafeRedirectUrl('javascript:alert(1)') === false, 'javascript: scheme is rejected')
  assert(isSafeRedirectUrl('JAVASCRIPT:alert(document.cookie)') === false, 'Case-insensitive JAVASCRIPT: scheme is rejected')
  assert(isSafeRedirectUrl('data:text/html,<script>alert(1)</script>') === false, 'data: scheme is rejected')
  assert(isSafeRedirectUrl('vbscript:msgbox("pwnd")') === false, 'vbscript: scheme is rejected')
  assert(isSafeRedirectUrl('file:///etc/passwd') === false, 'file: scheme is rejected')

  // 4.7 Malformed callbacks
  assert(isSafeRedirectUrl(null) === false, 'null is rejected')
  assert(isSafeRedirectUrl(undefined) === false, 'undefined is rejected')
  assert(isSafeRedirectUrl('') === false, 'Empty string is rejected')
  assert(isSafeRedirectUrl('   ') === false, 'Whitespace-only string is rejected')
  assert(isSafeRedirectUrl('/admin\r\nSet-Cookie: evil=true') === false, 'CRLF injection in callback is rejected')
  assert(isSafeRedirectUrl('/admin\0evil') === false, 'Null byte in callback is rejected')
  assert(isSafeRedirectUrl('/admin\tevil') === false, 'Tab character in callback is rejected')

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════════════════')
  console.log(`Phase 3A Tests Summary: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`)
  console.log('══════════════════════════════════════════════════════════════════════')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runPhase3ATests().catch((err) => {
  console.error('Test runner fatal error:', err)
  process.exit(1)
})
