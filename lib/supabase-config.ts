import * as fs from 'fs'
import * as path from 'path'

/**
 * Attempts to load NEXT_PUBLIC_SUPABASE_URL from local .env if not yet populated in process.env.
 * Ensures standalone scripts and test runners have access to local configuration without requiring
 * external dotenv packages.
 */
function loadLocalEnvIfMissing(): void {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) {
    return
  }

  try {
    const envPath = path.resolve(process.cwd(), '.env')
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
          const val = trimmed.slice(25).trim().replace(/^["']|["']$/g, '')
          process.env.NEXT_PUBLIC_SUPABASE_URL = val
          break
        }
      }
    }
  } catch {
    // Ignore read errors and proceed to strict validation
  }
}

/**
 * Configuration validator for the Supabase project origin.
 *
 * Enforces an exact, verified Supabase project hostname for Next.js image
 * optimization and Content Security Policy (CSP).
 *
 * Strictly rejects wildcards (*.supabase.co) and malformed URLs, failing
 * fast with a secure, informative configuration error.
 */
export function resolveSupabaseHostname(explicitUrl?: string): string {
  if (explicitUrl === undefined) {
    loadLocalEnvIfMissing()
  }

  const raw = explicitUrl !== undefined
    ? explicitUrl
    : (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)

  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      'Configuration Error: Missing required environment variable NEXT_PUBLIC_SUPABASE_URL. ' +
      'An exact Supabase project URL is required for image remotePatterns and CSP.'
    )
  }

  const clean = raw.trim().replace(/^["']|["']$/g, '')
  let parsedUrl: URL
  try {
    parsedUrl = new URL(clean)
  } catch {
    throw new Error(
      'Configuration Error: Invalid NEXT_PUBLIC_SUPABASE_URL format. Must be a valid absolute URL (e.g. https://<project-ref>.supabase.co).'
    )
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error(
      'Configuration Error: Insecure NEXT_PUBLIC_SUPABASE_URL protocol. Must use https: protocol.'
    )
  }

  const hostname = parsedUrl.hostname.toLowerCase()

  // Strictly reject wildcards or overly broad domains
  if (!hostname || hostname.includes('*') || hostname === 'supabase.co') {
    throw new Error(
      'Configuration Error: Invalid NEXT_PUBLIC_SUPABASE_URL hostname. Wildcard hostnames and root domains are strictly prohibited.'
    )
  }

  if (!hostname.endsWith('.supabase.co')) {
    throw new Error(
      'Configuration Error: Invalid NEXT_PUBLIC_SUPABASE_URL hostname. Must be an exact project domain ending in .supabase.co.'
    )
  }

  return hostname
}
