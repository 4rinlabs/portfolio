import NextAuth, { AuthError, CredentialsSignin } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { headers } from 'next/headers'
import {
  checkLoginRateLimit,
  getClientIp,
  recordFailedLoginAttempt,
  clearLoginRateLimit,
  settleLoginSuccess,
  withLoginConcurrencyLock,
  LoginConcurrencyBusyError,
  LoginConcurrencyUnavailableError,
} from '@/lib/ratelimit'
import { getSafeRedirectUrl } from '@/lib/safe-redirect'
import { validateSessionAuthTime, validateTokenVersion } from '@/lib/session-validator'

export class LoginRateLimitError extends CredentialsSignin {
  code = 'TooManyRequests'
}

export class AuthServiceUnavailableError extends CredentialsSignin {
  code = 'ServiceUnavailable'
}

// Precomputed cost-12 bcrypt hash for timing attack mitigation on non-existent accounts
export const DUMMY_HASH = '$2a$12$l.ePazYcVJt62mebObgN6eDNrME2Dz4ZHSNci9TC2JcuNyvCmkCxS'

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt' as const,
    maxAge: 12 * 60 * 60, // Explicit 12-hour administrative session lifetime
  },
  jwt: {
    maxAge: 12 * 60 * 60, // 12 hours
  },
  pages: {
    signIn: '/admin/login',
    error: '/admin/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const rawEmail = typeof credentials.email === 'string' ? credentials.email.trim() : ''
        const rawPassword = typeof credentials.password === 'string' ? credentials.password : ''

        if (!rawEmail || !rawPassword) return null

        // 1. Extract Client IP safely from trusted reverse proxy headers
        let clientIp = 'shared-unidentified-client-bucket'
        try {
          const headersList = await headers()
          clientIp = getClientIp(headersList)
        } catch {
          // Outside active request context (e.g. testing)
        }

        // 2. Concurrency-protected credential evaluation
        // Scopes an atomic distributed lock per (clientIp, emailHash) covering rate checking,
        // user lookup, bcrypt password comparison, and failed attempt recording.
        try {
          return await withLoginConcurrencyLock(rawEmail, clientIp, async ({ requestId, reservationId }) => {
            // 2a. Atomic Redis Login Rate Limiter (IP abuse, composite origin, and global failure reservation)
            const rateLimitResult = await checkLoginRateLimit(rawEmail, clientIp, { requestId, reservationId })
            if (!rateLimitResult.allowed) {
              if (rateLimitResult.type === 'ServiceUnavailable') {
                throw new AuthServiceUnavailableError(rateLimitResult.error)
              }
              throw new LoginRateLimitError(rateLimitResult.error)
            }

            // 2b. User lookup by normalized email
            const user = await prisma.user.findUnique({
              where: { email: rawEmail.toLowerCase() },
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                password: true,
                tokenVersion: true,
              },
            })

            // 2c. Timing-attack mitigation: perform constant-time cost-12 bcrypt check on unknown email
            if (!user || !user.password) {
              await bcrypt.compare(rawPassword, DUMMY_HASH)
              await recordFailedLoginAttempt(rawEmail, clientIp, { requestId, reservationId })
              return null
            }

            // 2d. Password verification
            const valid = await bcrypt.compare(rawPassword, user.password)
            if (!valid) {
              await recordFailedLoginAttempt(rawEmail, clientIp, { requestId, reservationId })
              return null
            }

            // 2e. Mandatory: Atomic Success Settlement in Redis BEFORE session issuance
            const normalizedEmail = rawEmail.trim().toLowerCase()
            const emailHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex')
            const settlement = await settleLoginSuccess(emailHash, requestId, reservationId)
            if (!settlement.settled) {
              console.error(`Success settlement verification failed for ${emailHash}:`, settlement.code)
              throw new AuthServiceUnavailableError('Authentication settlement could not be verified. Please try again.')
            }

            // 2f. Authentication succeeded and verified: reset local composite failed-attempt state for this origin
            await clearLoginRateLimit(rawEmail, clientIp)

            return {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role as string,
              tokenVersion: typeof user.tokenVersion === 'number' ? user.tokenVersion : 1,
            }
          })
        } catch (err) {
          if (err instanceof LoginRateLimitError || err instanceof AuthServiceUnavailableError) {
            throw err
          }
          if (err instanceof LoginConcurrencyBusyError || (err as any)?.code === 'TooManyRequests') {
            throw new LoginRateLimitError((err as Error).message)
          }
          if (err instanceof LoginConcurrencyUnavailableError || (err as any)?.code === 'ServiceUnavailable') {
            throw new AuthServiceUnavailableError((err as Error).message)
          }
          throw err
        }
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      return getSafeRedirectUrl(url, `${baseUrl}/admin`, baseUrl)
    },
    async jwt({ token, user }: { token: any; user?: any }) {
      // 1. Initial authentication: capture authoritative ID, role, tokenVersion, and immutable authTime
      if (user) {
        token.role = (user as { role: string }).role
        token.id = user.id
        token.tokenVersion = typeof (user as { tokenVersion?: number }).tokenVersion === 'number'
          ? (user as { tokenVersion: number }).tokenVersion
          : 1
        token.authTime = Math.floor(Date.now() / 1000)
        return token
      }

      // 2. Subsequent session access: strictly validate authTime
      // Every JWT must possess a valid, non-expired, non-future authTime.
      // Missing authTime (legacy pre-3A.1 tokens), invalid types, future drift (>60s), or expired (>12h)
      // cause the callback to return null, invalidating the session in Auth.js.
      const validation = validateSessionAuthTime(token.authTime)
      if (!validation.valid) {
        return null
      }

      // 3. Subsequent session access: strictly validate tokenVersion
      // Rejects legacy JWTs without tokenVersion, or non-integer / non-positive versions
      const tokenVersionValidation = validateTokenVersion(token.tokenVersion)
      if (!tokenVersionValidation.valid) {
        return null
      }

      // 4. Preserve original timestamp and tokenVersion untouched during ordinary JWT re-encoding
      return token
    },
    async session({ session, token }: { session: any; token: any }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as 'ADMIN' | 'EDITOR'
        session.user.authTime = token.authTime as number
        session.user.tokenVersion = typeof token.tokenVersion === 'number' ? token.tokenVersion : undefined
      }
      return session
    },
  },
}

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig)
