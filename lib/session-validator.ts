export const MAX_SESSION_LIFETIME_SECONDS = 12 * 60 * 60 // 12 hours (43,200 seconds)
export const MAX_CLOCK_SKEW_SECONDS = 60 // 60 seconds tolerance for server clock drift

export type SessionValidationResult =
  | { valid: true; authTime: number }
  | { valid: false; reason: string }

export type TokenVersionValidationResult =
  | { valid: true; tokenVersion: number }
  | { valid: false; reason: string }

/**
 * Validates a session authentication timestamp against strict lifetime and integrity policies.
 * 
 * Security Policies (Phase 3A.2):
 * 1. Must be present and defined (strictly rejects legacy Phase 3A tokens issued without authTime).
 * 2. Must be a finite, positive, integer number (epoch seconds).
 * 3. Cannot be in the future beyond a 60-second clock skew tolerance window.
 * 4. Cannot exceed the absolute 12-hour maximum session lifetime from initial authentication.
 */
export function validateSessionAuthTime(
  authTime: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionValidationResult {
  // 1. Missing or undefined check (rejects legacy sessions issued before Phase 3A.1)
  if (authTime === undefined || authTime === null) {
    return { valid: false, reason: 'Missing session authentication timestamp (legacy session invalidated)' }
  }

  // 2. Type and validity check: must be a finite, positive integer
  if (typeof authTime !== 'number' || !Number.isFinite(authTime)) {
    return { valid: false, reason: 'Invalid session timestamp: non-numeric or non-finite' }
  }

  if (authTime <= 0) {
    return { valid: false, reason: 'Invalid session timestamp: non-positive value' }
  }

  if (!Number.isInteger(authTime)) {
    return { valid: false, reason: 'Invalid session timestamp: non-integer value' }
  }

  // 3. Future timestamp check with justified clock-skew tolerance:
  // Allows up to 60 seconds of clock drift between distributed serverless instances and databases.
  if (authTime > nowSeconds + MAX_CLOCK_SKEW_SECONDS) {
    return { valid: false, reason: 'Invalid session timestamp: future timestamp exceeds clock skew tolerance' }
  }

  // 4. Absolute maximum lifetime check: exactly 12 hours (43,200 seconds)
  const ageSeconds = nowSeconds - authTime
  if (ageSeconds > MAX_SESSION_LIFETIME_SECONDS) {
    return { valid: false, reason: 'Session expired: absolute 12-hour maximum lifetime exceeded' }
  }

  return { valid: true, authTime }
}

/**
 * Validates a token version number against strict integrity policies.
 * 
 * Security Policies (Phase 3C.2):
 * 1. Must be present and defined (strictly rejects legacy JWT tokens issued without tokenVersion).
 * 2. Must be a finite, positive, integer number >= 1.
 */
export function validateTokenVersion(tokenVersion: unknown): TokenVersionValidationResult {
  if (tokenVersion === undefined || tokenVersion === null) {
    return { valid: false, reason: 'Missing token version (legacy token invalidated)' }
  }

  if (typeof tokenVersion !== 'number' || !Number.isFinite(tokenVersion)) {
    return { valid: false, reason: 'Invalid token version: non-numeric or non-finite' }
  }

  if (!Number.isInteger(tokenVersion)) {
    return { valid: false, reason: 'Invalid token version: non-integer value' }
  }

  if (tokenVersion < 1) {
    return { valid: false, reason: 'Invalid token version: value must be at least 1' }
  }

  return { valid: true, tokenVersion }
}

