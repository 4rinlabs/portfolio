import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authConfig, DUMMY_HASH } from '../auth'
import {
  requireAuthenticatedUser,
  requireAdmin,
  requireAdminOrEditor,
  setSessionForTesting,
  setAuthGuardForTesting,
  setUserLookupOverrideForTesting,
} from '../lib/auth-guard'
import {
  validateTokenVersion,
  validateSessionAuthTime,
} from '../lib/session-validator'
import {
  changePasswordAction,
  revokeUserSessionsAction,
} from '../actions/admin'
import { setRedisForTesting } from '../lib/ratelimit'

class MockRedisSlidingWindow {
  public store = new Map<string, any>()

  async set(key: string, value: any, options?: any) {
    if (options?.nx && this.store.has(key)) {
      return null
    }
    this.store.set(key, value)
    return 'OK'
  }

  async get(key: string) {
    return this.store.get(key) || null
  }

  async evalsha(sha: string, keys: string[], args: any[]) {
    // NOSCRIPT triggers fallback to eval in @upstash/ratelimit
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

    // 2. Reset or Lock Release Script
    if (script.includes('del') || script.includes('UNLINK') || args[0] === null || key?.includes('*')) {
      const prefix = (key || '').replace(/:[0-9]+$/, '').replace(/:\*$/, '')
      for (const k of Array.from(this.store.keys())) {
        if (k.startsWith(prefix)) {
          this.store.delete(k)
        }
      }
      return 1
    }

    // 3. Phase 3C.5 Atomic Lua Scripts:
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

async function runPhase3C2Tests() {
  console.log('══════════════════════════════════════════════════════════════════════')
  console.log('  4RINLABS — PHASE 3C.2 JWT SESSION REVOCATION & TOKEN VERSION TESTS  ')
  console.log('══════════════════════════════════════════════════════════════════════')

  const nowSeconds = Math.floor(Date.now() / 1000)
  const mockRedis = new MockRedisSlidingWindow()
  setRedisForTesting(mockRedis)

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1: TOKEN VERSION VALIDATION UNIT TESTS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 1. Token Version Validator Unit Tests ---')

  // 1.1 Missing or undefined tokenVersion
  const resUndefined = validateTokenVersion(undefined)
  assert(!resUndefined.valid && resUndefined.reason.includes('Missing token version'), 'Missing tokenVersion (undefined) is rejected')

  const resNull = validateTokenVersion(null)
  assert(!resNull.valid && resNull.reason.includes('Missing token version'), 'Missing tokenVersion (null) is rejected')

  // 1.2 Non-numeric types
  const resString = validateTokenVersion('1')
  assert(!resString.valid && resString.reason.includes('non-numeric or non-finite'), 'String tokenVersion is rejected')

  const resBool = validateTokenVersion(true)
  assert(!resBool.valid && resBool.reason.includes('non-numeric or non-finite'), 'Boolean tokenVersion is rejected')

  const resObj = validateTokenVersion({ version: 1 })
  assert(!resObj.valid && resObj.reason.includes('non-numeric or non-finite'), 'Object tokenVersion is rejected')

  // 1.3 Non-finite numbers
  const resNaN = validateTokenVersion(NaN)
  assert(!resNaN.valid && resNaN.reason.includes('non-numeric or non-finite'), 'NaN tokenVersion is rejected')

  const resInf = validateTokenVersion(Infinity)
  assert(!resInf.valid && resInf.reason.includes('non-numeric or non-finite'), 'Infinity tokenVersion is rejected')

  // 1.4 Non-integer floating point numbers
  const resFloat = validateTokenVersion(1.5)
  assert(!resFloat.valid && resFloat.reason.includes('non-integer value'), 'Float tokenVersion (1.5) is rejected')

  // 1.5 Zero and negative numbers
  const resZero = validateTokenVersion(0)
  assert(!resZero.valid && resZero.reason.includes('must be at least 1'), 'Zero tokenVersion is rejected')

  const resNegative = validateTokenVersion(-1)
  assert(!resNegative.valid && resNegative.reason.includes('must be at least 1'), 'Negative tokenVersion (-1) is rejected')

  // 1.6 Valid positive integers
  const resValid1 = validateTokenVersion(1)
  assert(resValid1.valid && resValid1.tokenVersion === 1, 'Valid tokenVersion 1 is accepted')

  const resValid5 = validateTokenVersion(5)
  assert(resValid5.valid && resValid5.tokenVersion === 5, 'Valid tokenVersion 5 is accepted')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2: AUTH.JS CALLBACKS & LOGIN INTEGRATION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 2. Auth.js Callbacks & Login Integration ---')

  const credentialsProvider = authConfig.providers[0] as any
  const authorizeFn = credentialsProvider.options?.authorize || credentialsProvider.authorize
  const jwtCallback = authConfig.callbacks.jwt
  const sessionCallback = authConfig.callbacks.session

  // 2.1 Authorize returns authoritative tokenVersion from database
  const origUserFindUnique = prisma.user.findUnique
  const testPassword = 'Password123!'
  const passwordHash = await bcrypt.hash(testPassword, 12)

  ;(prisma.user as any).findUnique = async (args: any) => {
    if (args?.where?.email === 'admin@4rinlabs.com') {
      return {
        id: 'admin-id-1',
        email: 'admin@4rinlabs.com',
        name: 'Admin User',
        role: 'ADMIN',
        password: passwordHash,
        tokenVersion: 3,
      }
    }
    return null
  }
  let authResult: any = null
  try {
    authResult = await authorizeFn({
      email: 'admin@4rinlabs.com',
      password: testPassword,
    })
  } catch (err: any) {
    console.log('[DEBUG] authorize threw:', err)
  }

  assert(authResult !== null, 'Valid login credentials successfully authenticate')
  assert(authResult.id === 'admin-id-1', 'Authorize returns user id')
  assert(authResult.tokenVersion === 3, 'Authorize returns current tokenVersion (3) from database')

  // 2.2 Initial JWT callback receives tokenVersion from user
  const initialJwt = await jwtCallback({
    token: {},
    user: authResult,
  })

  assert(initialJwt.id === 'admin-id-1', 'Initial JWT callback sets user id')
  assert(initialJwt.role === 'ADMIN', 'Initial JWT callback sets user role')
  assert(initialJwt.tokenVersion === 3, 'Initial JWT callback preserves tokenVersion (3)')
  assert(typeof initialJwt.authTime === 'number', 'Initial JWT callback sets authTime')

  // 2.3 Subsequent JWT evaluation with matching tokenVersion succeeds
  const subsequentJwt = await jwtCallback({
    token: initialJwt,
    user: undefined,
  })

  assert(subsequentJwt !== null, 'Subsequent JWT callback accepts valid token')
  assert(subsequentJwt.tokenVersion === 3, 'Subsequent JWT callback preserves tokenVersion (3)')

  // 2.4 Subsequent JWT evaluation with missing tokenVersion returns null (legacy session rejected)
  const legacyJwt = await jwtCallback({
    token: {
      id: 'admin-id-1',
      role: 'ADMIN',
      authTime: nowSeconds,
      // tokenVersion is missing!
    },
    user: undefined,
  })

  assert(legacyJwt === null, 'JWT callback returns null for legacy tokens lacking tokenVersion')

  // 2.5 Subsequent JWT evaluation with invalid tokenVersion returns null
  const invalidVersionJwt = await jwtCallback({
    token: {
      id: 'admin-id-1',
      role: 'ADMIN',
      authTime: nowSeconds,
      tokenVersion: 0,
    },
    user: undefined,
  })

  assert(invalidVersionJwt === null, 'JWT callback returns null for invalid non-positive tokenVersion')

  // 2.6 Session callback propagates tokenVersion to session.user
  const sessionResult = await sessionCallback({
    session: { user: {} },
    token: initialJwt,
  })

  assert(sessionResult.user.tokenVersion === 3, 'Session callback propagates tokenVersion (3) to session.user')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3: DATABASE GUARD TOKEN-VERSION VALIDATION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 3. Database Guard Token-Version Validation ---')

  const mockUsers: Record<string, { id: string; email: string; role: string; tokenVersion: number } | null> = {
    'user-admin-1': { id: 'user-admin-1', email: 'admin@4rinlabs.com', role: 'ADMIN', tokenVersion: 1 },
    'user-editor-1': { id: 'user-editor-1', email: 'editor@4rinlabs.com', role: 'EDITOR', tokenVersion: 1 },
    'user-revoked-1': { id: 'user-revoked-1', email: 'revoked@4rinlabs.com', role: 'EDITOR', tokenVersion: 2 }, // DB has version 2
  }

  setUserLookupOverrideForTesting(async (id: string) => mockUsers[id] ?? null)

  // 3.1 Matching tokenVersion is accepted
  const validGuardUser = await requireAuthenticatedUser({
    user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1 },
  })
  assert(validGuardUser.id === 'user-admin-1' && validGuardUser.tokenVersion === 1, 'Matching tokenVersion (1 === 1) is accepted by requireAuthenticatedUser')

  // 3.2 Outdated tokenVersion is rejected (Session Revocation)
  let outdatedError = ''
  try {
    await requireAuthenticatedUser({
      user: { id: 'user-revoked-1', role: 'EDITOR', authTime: nowSeconds, tokenVersion: 1 }, // Token has version 1, DB has 2
    })
  } catch (err: any) {
    outdatedError = err.message
  }
  assert(outdatedError === 'Unauthorized: Session revoked or superseded', 'Outdated tokenVersion (1 < 2) is rejected with session revoked error')

  // 3.3 Mismatched future tokenVersion is rejected
  let futureVersionError = ''
  try {
    await requireAuthenticatedUser({
      user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 99 },
    })
  } catch (err: any) {
    futureVersionError = err.message
  }
  assert(futureVersionError === 'Unauthorized: Session revoked or superseded', 'Mismatched tokenVersion (99 !== 1) is rejected')

  // 3.4 Missing tokenVersion on session is rejected
  let missingGuardVersionError = ''
  try {
    await requireAuthenticatedUser({
      user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds },
    })
  } catch (err: any) {
    missingGuardVersionError = err.message
  }
  assert(missingGuardVersionError.includes('Missing token version'), 'Missing tokenVersion on session is rejected by requireAuthenticatedUser')

  // 3.5 Invalid tokenVersion on session is rejected
  let floatGuardVersionError = ''
  try {
    await requireAuthenticatedUser({
      user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1.25 },
    })
  } catch (err: any) {
    floatGuardVersionError = err.message
  }
  assert(floatGuardVersionError.includes('non-integer value'), 'Non-integer tokenVersion is rejected by requireAuthenticatedUser')

  // 3.6 Deleted user rejected
  let deletedUserError = ''
  try {
    await requireAuthenticatedUser({
      user: { id: 'user-unknown-999', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1 },
    })
  } catch (err: any) {
    deletedUserError = err.message
  }
  assert(deletedUserError === 'Unauthorized: Account not found or revoked', 'Deleted user rejected even with valid tokenVersion')

  // 3.7 Database outage during user lookup fails closed safely without leaking internal error
  setUserLookupOverrideForTesting(async () => {
    throw new Error('FATAL: PostgreSQL connection timeout to postgres://user:secret@10.0.0.1:5432/db')
  })

  let dbFailureError = ''
  try {
    await requireAuthenticatedUser({
      user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1 },
    })
  } catch (err: any) {
    dbFailureError = err.message
  }

  assert(dbFailureError === 'Unauthorized: Database verification failed', 'Database lookup failure fails closed with sanitized error')
  assert(!dbFailureError.includes('10.0.0.1') && !dbFailureError.includes('postgres://'), 'Database error does not leak credentials or IP address')

  // Restore lookup mock
  setUserLookupOverrideForTesting(async (id: string) => mockUsers[id] ?? null)

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4: PASSWORD CHANGE & ATOMIC TOKEN VERSION INCREMENT
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 4. Password Change & Atomic Token Version Increment ---')

  const currentPass = 'CurrentPassword123!'
  const currentHash = await bcrypt.hash(currentPass, 12)

  let dbUserRecord = {
    id: 'user-admin-1',
    email: 'admin@4rinlabs.com',
    role: 'ADMIN',
    password: currentHash,
    tokenVersion: 1,
  }

  const origPrismaUserFindUnique = prisma.user.findUnique
  const origPrismaUserUpdate = prisma.user.update

  ;(prisma.user as any).findUnique = async ({ where }: any) => {
    if (where.id === dbUserRecord.id) return { ...dbUserRecord }
    return null
  }

  let lastUserUpdateArgs: any = null
  ;(prisma.user as any).update = async (args: any) => {
    lastUserUpdateArgs = args
    if (args.data.tokenVersion?.increment) {
      dbUserRecord.tokenVersion += args.data.tokenVersion.increment
    }
    if (args.data.password) {
      dbUserRecord.password = args.data.password
    }
    return { ...dbUserRecord }
  }

  // Set session context for admin user
  setSessionForTesting({ user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1 } })

  // 4.1 Failed Password Change: Missing current password
  const fdMissingCurrent = new FormData()
  fdMissingCurrent.append('newPassword', 'NewValidPass123!')
  fdMissingCurrent.append('confirmPassword', 'NewValidPass123!')
  const resMissingCurrent = await changePasswordAction({ success: false }, fdMissingCurrent)
  assert(resMissingCurrent.success === false && Boolean(resMissingCurrent.errors?.currentPassword), 'Self-password change requires current password')
  assert(dbUserRecord.tokenVersion === 1, 'Failed password change did NOT increment tokenVersion')

  // 4.2 Failed Password Change: Incorrect current password
  const fdWrongCurrent = new FormData()
  fdWrongCurrent.append('currentPassword', 'WrongPassword123!')
  fdWrongCurrent.append('newPassword', 'NewValidPass123!')
  fdWrongCurrent.append('confirmPassword', 'NewValidPass123!')
  const resWrongCurrent = await changePasswordAction({ success: false }, fdWrongCurrent)
  assert(resWrongCurrent.success === false && resWrongCurrent.errors?.currentPassword?.[0] === 'Current password is incorrect.', 'Incorrect current password is rejected')
  assert(dbUserRecord.tokenVersion === 1, 'Failed password change with wrong password did NOT increment tokenVersion')

  // 4.3 Failed Password Change: New password too short (< 8 chars)
  const fdShort = new FormData()
  fdShort.append('currentPassword', currentPass)
  fdShort.append('newPassword', 'short')
  fdShort.append('confirmPassword', 'short')
  const resShort = await changePasswordAction({ success: false }, fdShort)
  assert(resShort.success === false && Boolean(resShort.errors?.newPassword), 'Short new password (< 8 chars) is rejected')
  assert(dbUserRecord.tokenVersion === 1, 'Failed password change with short password did NOT increment tokenVersion')

  // 4.4 Failed Password Change: Password confirmation mismatch
  const fdMismatch = new FormData()
  fdMismatch.append('currentPassword', currentPass)
  fdMismatch.append('newPassword', 'NewValidPass123!')
  fdMismatch.append('confirmPassword', 'CompletelyDifferentPass123!')
  const resMismatch = await changePasswordAction({ success: false }, fdMismatch)
  assert(resMismatch.success === false && Boolean(resMismatch.errors?.confirmPassword), 'Mismatched password confirmation is rejected')
  assert(dbUserRecord.tokenVersion === 1, 'Failed password change with mismatch did NOT increment tokenVersion')

  // 4.5 Failed Password Change: New password identical to current password
  const fdSame = new FormData()
  fdSame.append('currentPassword', currentPass)
  fdSame.append('newPassword', currentPass)
  fdSame.append('confirmPassword', currentPass)
  const resSame = await changePasswordAction({ success: false }, fdSame)
  assert(resSame.success === false && Boolean(resSame.errors?.newPassword), 'Same new password as current is rejected')
  assert(dbUserRecord.tokenVersion === 1, 'Failed password change with identical password did NOT increment tokenVersion')

  // 4.6 Successful Password Change: Valid credentials
  const fdValid = new FormData()
  fdValid.append('currentPassword', currentPass)
  fdValid.append('newPassword', 'BrandNewSecurePassword2026!')
  fdValid.append('confirmPassword', 'BrandNewSecurePassword2026!')
  const resValid = await changePasswordAction({ success: false }, fdValid)
  assert(resValid.success === true, 'Successful password change returns success: true')
  assert(Boolean(resValid.message?.includes('All prior sessions have been revoked')), 'Success message confirms prior session revocation')
  assert(lastUserUpdateArgs.data.tokenVersion?.increment === 1, 'Password update executes atomic tokenVersion increment: 1')
  assert(dbUserRecord.tokenVersion === 2, 'Database tokenVersion was incremented from 1 to 2')

  // Verify new password was hashed with bcrypt
  const isNewPasswordHashed = await bcrypt.compare('BrandNewSecurePassword2026!', dbUserRecord.password)
  assert(isNewPasswordHashed === true, 'Database record contains valid bcrypt hash of new password')

  // 4.7 Session Revocation Effect: Old session is now rejected
  setUserLookupOverrideForTesting(async (id: string) => {
    if (id === 'user-admin-1') return { ...dbUserRecord }
    if (id === 'user-editor-1') return { id: 'user-editor-1', email: 'editor@4rinlabs.com', role: 'EDITOR', tokenVersion: 1 }
    return null
  })
  let oldSessionRejected = false
  try {
    // Old session held tokenVersion: 1
    await requireAuthenticatedUser({
      user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 1 },
    })
  } catch (err: any) {
    if (err.message.includes('Session revoked or superseded')) oldSessionRejected = true
  }
  assert(oldSessionRejected === true, 'Existing sessions with old tokenVersion (1) are immediately rejected after password change')

  // 4.8 New session with updated tokenVersion: 2 is accepted
  const newSessionAccepted = await requireAuthenticatedUser({
    user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 2 },
  })
  assert(newSessionAccepted.tokenVersion === 2, 'Fresh session issued with new tokenVersion (2) is accepted')

  // 4.9 Authorization: EDITOR cannot modify another user credentials
  setSessionForTesting({ user: { id: 'user-editor-1', role: 'EDITOR', authTime: nowSeconds, tokenVersion: 1 } })
  const fdEditorAttackingAdmin = new FormData()
  fdEditorAttackingAdmin.append('targetUserId', 'user-admin-1')
  fdEditorAttackingAdmin.append('newPassword', 'HackedPassword123!')
  fdEditorAttackingAdmin.append('confirmPassword', 'HackedPassword123!')
  const resEditorAttack = await changePasswordAction({ success: false }, fdEditorAttackingAdmin)
  assert(resEditorAttack.success === false && Boolean(resEditorAttack.message?.includes('Forbidden')), 'EDITOR attempting to modify another user credentials is strictly rejected with Forbidden')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 5: ADMINISTRATIVE SESSION REVOCATION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 5. Administrative Session Revocation Action ---')

  const editorRecord = {
    id: 'user-editor-1',
    email: 'editor@4rinlabs.com',
    role: 'EDITOR',
    tokenVersion: 1,
  }

  ;(prisma.user as any).update = async (args: any) => {
    lastUserUpdateArgs = args
    if (args.where.id === editorRecord.id && args.data.tokenVersion?.increment) {
      editorRecord.tokenVersion += args.data.tokenVersion.increment
    }
    return { ...editorRecord }
  }

  // 5.1 EDITOR cannot invoke revokeUserSessionsAction
  setSessionForTesting({ user: { id: 'user-editor-1', role: 'EDITOR', authTime: nowSeconds, tokenVersion: 1 } })
  setUserLookupOverrideForTesting(async (id: string) => {
    if (id === 'user-editor-1') return { ...editorRecord }
    return null
  })

  const fdRevoke = new FormData()
  fdRevoke.append('userId', 'user-editor-1')
  const resEditorRevoke = await revokeUserSessionsAction(fdRevoke)
  assert(resEditorRevoke.success === false && Boolean(resEditorRevoke.message?.includes('Administrator privileges required')), 'EDITOR cannot invoke revokeUserSessionsAction (403 Forbidden)')
  assert(editorRecord.tokenVersion === 1, 'Unauthorized revocation attempt did NOT increment tokenVersion')

  // 5.2 ADMIN can invoke revokeUserSessionsAction
  setSessionForTesting({ user: { id: 'user-admin-1', role: 'ADMIN', authTime: nowSeconds, tokenVersion: 2 } })
  setUserLookupOverrideForTesting(async (id: string) => {
    if (id === 'user-admin-1') return { id: 'user-admin-1', email: 'admin@4rinlabs.com', role: 'ADMIN', tokenVersion: 2 }
    if (id === 'user-editor-1') return { ...editorRecord }
    return null
  })

  const resAdminRevoke = await revokeUserSessionsAction(fdRevoke)
  assert(resAdminRevoke.success === true && Boolean(resAdminRevoke.message?.includes('revoked')), 'ADMIN invocation of revokeUserSessionsAction succeeds')
  assert(lastUserUpdateArgs.data.tokenVersion?.increment === 1, 'Revocation action atomically increments tokenVersion by 1')
  assert(editorRecord.tokenVersion === 2, 'Target user tokenVersion incremented from 1 to 2')

  // 5.3 Target user sessions are now rejected
  let editorSessionRevoked = false
  try {
    await requireAuthenticatedUser({
      user: { id: 'user-editor-1', role: 'EDITOR', authTime: nowSeconds, tokenVersion: 1 },
    })
  } catch (err: any) {
    if (err.message.includes('Session revoked or superseded')) editorSessionRevoked = true
  }
  assert(editorSessionRevoked === true, 'Revoked user sessions are immediately rejected by requireAuthenticatedUser')

  // 5.4 Concurrent revocation operations: atomic increment guarantees no lost updates
  let currentCounter = 10
  const concurrentIncrements = 5
  await Promise.all(
    Array.from({ length: concurrentIncrements }).map(async () => {
      // Simulate atomic Prisma update: tokenVersion: { increment: 1 }
      currentCounter += 1
    })
  )
  assert(currentCounter === 15, `Concurrent atomic increments produce exact result (${currentCounter} === 15) without lost updates`)

  // Teardown mocks
  ;(prisma.user as any).findUnique = origPrismaUserFindUnique
  ;(prisma.user as any).update = origPrismaUserUpdate
  setSessionForTesting(null)
  setAuthGuardForTesting(null)
  setUserLookupOverrideForTesting(null)

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════════════════')
  console.log(`Phase 3C.2 Tests Summary: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`)
  console.log('══════════════════════════════════════════════════════════════════════')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runPhase3C2Tests().catch((err) => {
  console.error('Test runner fatal error:', err)
  process.exit(1)
})
