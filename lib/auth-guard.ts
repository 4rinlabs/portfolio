import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import {
  validateSessionAuthTime,
  validateTokenVersion,
  MAX_SESSION_LIFETIME_SECONDS,
  MAX_CLOCK_SKEW_SECONDS,
  type SessionValidationResult,
  type TokenVersionValidationResult,
} from '@/lib/session-validator'

export {
  validateSessionAuthTime,
  validateTokenVersion,
  MAX_SESSION_LIFETIME_SECONDS,
  MAX_CLOCK_SKEW_SECONDS,
  type SessionValidationResult,
  type TokenVersionValidationResult,
}

export type AuthorizedUser = {
  id: string
  email: string
  role: 'ADMIN' | 'EDITOR'
  tokenVersion: number
}

export type AuthGuardResult =
  | { authorized: true; user: AuthorizedUser }
  | { authorized: false; status: 401 | 403; error: string }

let authOverrideForTesting: ((session?: any) => Promise<AuthGuardResult> | AuthGuardResult) | null = null
let userLookupOverrideForTesting: ((userId: string) => Promise<{ id: string; email: string; role: string; tokenVersion?: number } | null>) | null = null
let sessionOverrideForTesting: any = undefined

export function setAuthGuardForTesting(override: typeof authOverrideForTesting) {
  authOverrideForTesting = override
}

export function setUserLookupOverrideForTesting(override: typeof userLookupOverrideForTesting) {
  userLookupOverrideForTesting = override
}

export function setSessionForTesting(override: any) {
  sessionOverrideForTesting = override
}

/**
 * Validates the caller's Auth.js session and verifies that the account exists
 * in PostgreSQL.
 * 
 * Security Controls:
 * - Requires an active, authenticated Auth.js session with a valid user ID.
 * - Strictly validates session authTime (rejecting legacy tokens, invalid types, future drift, and expired sessions).
 * - Strictly validates session tokenVersion (rejecting missing, non-integer, or non-positive versions).
 * - Confirms the user currently exists in PostgreSQL (rejecting deleted or revoked accounts).
 * - Queries the database role and tokenVersion directly to ensure stale JWT claims cannot override
 *   the current database state (e.g. if user role was demoted or password was changed).
 * - Validates session tokenVersion against the authoritative PostgreSQL tokenVersion.
 * - Enforces role-based access: only ADMIN and EDITOR roles are permitted.
 * - Throws an Error with 401 / 403 semantics for Server Actions and page loaders.
 */
export async function requireAuthenticatedUser(sessionOverride?: any): Promise<AuthorizedUser> {
  let session = sessionOverride !== undefined ? sessionOverride : sessionOverrideForTesting
  if (session === undefined) {
    try {
      session = await auth()
    } catch {
      throw new Error('Unauthorized: Authentication required')
    }
  }

  if (!session?.user?.id) {
    throw new Error('Unauthorized: Authentication required')
  }

  // 1. Strictly validate session authTime (rejects legacy sessions, invalid types, future drift, and expired sessions)
  const validation = validateSessionAuthTime(session.user?.authTime)
  if (!validation.valid) {
    throw new Error(`Unauthorized: ${validation.reason}`)
  }

  // 2. Authoritative check against PostgreSQL
  let dbUser
  try {
    dbUser = userLookupOverrideForTesting
      ? await userLookupOverrideForTesting(session.user.id)
      : await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { id: true, email: true, role: true, tokenVersion: true },
        })
  } catch (err) {
    console.error('Database lookup failed during session validation:', err)
    throw new Error('Unauthorized: Database verification failed')
  }

  if (!dbUser) {
    throw new Error('Unauthorized: Account not found or revoked')
  }

  if (dbUser.role !== 'ADMIN' && dbUser.role !== 'EDITOR') {
    throw new Error('Forbidden: Insufficient privileges')
  }

  // 3. Strictly validate session tokenVersion against schema policy
  const tokenVersionValidation = validateTokenVersion(session.user?.tokenVersion)
  if (!tokenVersionValidation.valid) {
    throw new Error(`Unauthorized: ${tokenVersionValidation.reason}`)
  }

  // 4. Validate session tokenVersion against authoritative database tokenVersion
  const expectedTokenVersion = typeof dbUser.tokenVersion === 'number' ? dbUser.tokenVersion : 1
  if (tokenVersionValidation.tokenVersion !== expectedTokenVersion) {
    throw new Error('Unauthorized: Session revoked or superseded')
  }

  return {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role as 'ADMIN' | 'EDITOR',
    tokenVersion: expectedTokenVersion,
  }
}

/**
 * Enforces that the caller is authenticated AND possesses the ADMIN role in the database.
 * Stale JWT claims are ignored; role is authoritative from PostgreSQL.
 */
export async function requireAdmin(sessionOverride?: any): Promise<AuthorizedUser> {
  const user = await requireAuthenticatedUser(sessionOverride)
  if (user.role !== 'ADMIN') {
    throw new Error('Forbidden: Administrator privileges required')
  }
  return user
}

/**
 * Enforces that the caller is authenticated AND possesses either the ADMIN or EDITOR role.
 */
export async function requireAdminOrEditor(sessionOverride?: any): Promise<AuthorizedUser> {
  return requireAuthenticatedUser(sessionOverride)
}

/**
 * Validates file upload permissions (ADMIN and EDITOR permitted).
 * Preserves compatibility with Phase 2 CMS file upload pipeline.
 */
export async function getAuthorizedUploadUser(sessionOverride?: any): Promise<AuthGuardResult> {
  if (authOverrideForTesting) {
    return authOverrideForTesting(sessionOverride)
  }

  try {
    const user = await requireAdminOrEditor(sessionOverride)
    return {
      authorized: true,
      user,
    }
  } catch (err: any) {
    const message = err?.message || 'Unauthorized: Authentication required'
    const status: 401 | 403 = message.includes('Forbidden') ? 403 : 401
    return {
      authorized: false,
      status,
      error: message,
    }
  }
}
