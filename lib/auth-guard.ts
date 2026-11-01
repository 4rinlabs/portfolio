import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export type AuthorizedUser = {
  id: string
  email: string
  role: 'ADMIN' | 'EDITOR'
}

export type AuthGuardResult =
  | { authorized: true; user: AuthorizedUser }
  | { authorized: false; status: 401 | 403; error: string }

let authOverrideForTesting: ((session?: any) => Promise<AuthGuardResult> | AuthGuardResult) | null = null

export function setAuthGuardForTesting(override: typeof authOverrideForTesting) {
  authOverrideForTesting = override
}

/**
 * Validates the user's Auth.js session and verifies their current role
 * against the authoritative PostgreSQL database record.
 * 
 * Security Controls:
 * - Requires an active, authenticated Auth.js session with a valid user ID.
 * - Confirms the user actually exists in PostgreSQL (rejecting deleted or revoked accounts).
 * - Queries the database role directly to ensure a stale JWT role cannot override
 *   the current database role (e.g. if an editor/admin was demoted).
 * - Enforces role-based access: only ADMIN and EDITOR roles are permitted.
 * - Note on Account Status: The Prisma User schema does not define a deactivation/status column.
 *   Account validity is strictly enforced via database existence and role assignment.
 * 
 * Returns:
 * - 401 for unauthenticated requests or non-existent database accounts.
 * - 403 for authenticated users lacking ADMIN or EDITOR privileges.
 */
export async function getAuthorizedUploadUser(sessionOverride?: any): Promise<AuthGuardResult> {
  if (authOverrideForTesting) {
    return authOverrideForTesting(sessionOverride)
  }

  let session = sessionOverride
  if (session === undefined) {
    try {
      session = await auth()
    } catch {
      return {
        authorized: false,
        status: 401,
        error: 'Unauthorized: Authentication required',
      }
    }
  }

  if (!session?.user?.id) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: Authentication required',
    }
  }

  // Authoritative check against PostgreSQL
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true },
  })

  if (!dbUser) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: Account not found or revoked',
    }
  }

  // Role verification from database (ignores stale JWT role)
  if (dbUser.role !== 'ADMIN' && dbUser.role !== 'EDITOR') {
    return {
      authorized: false,
      status: 403,
      error: 'Forbidden: Insufficient privileges for file upload',
    }
  }

  return {
    authorized: true,
    user: {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role as 'ADMIN' | 'EDITOR',
    },
  }
}
