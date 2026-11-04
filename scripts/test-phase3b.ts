import * as fs from 'fs'
import { safeJsonLd } from '../lib/safe-json-ld'
import { isValidHttpUrl, sanitizeExternalUrl } from '../lib/safe-url'
import { PortfolioSchema, ProductSchema } from '../lib/schemas'
import { resolveSupabaseHostname } from '../lib/supabase-config'
import nextConfig from '../next.config'

let totalTests = 0
let passedTests = 0
let failedTests = 0

function assert(condition: boolean, message: string) {
  totalTests++
  if (condition) {
    passedTests++
    console.log(`  ✓ ${message}`)
  } else {
    failedTests++
    console.error(`  ✗ FAIL: ${message}`)
  }
}

async function runTests() {
  console.log('\n========================================')
  console.log('  4RinLabs Phase 3B Test Suite')
  console.log('========================================\n')

  // ─── 1. JSON-LD Serialization & Script Breakout Tests ─────────────────────────
  console.log('1. JSON-LD Serialization & Script Breakout Tests')

  const safePayload = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: 'Standard Blog Post Title',
    articleBody: 'Normal safe text without scripts',
  }
  const serializedSafe = safeJsonLd(safePayload)
  assert(serializedSafe.includes('"Standard Blog Post Title"'), 'Serializes standard objects correctly')
  assert(JSON.parse(serializedSafe).headline === safePayload.headline, 'Round-trip JSON.parse preserves exact headline')

  // Attack fixture: </script> tag injection
  const injectionPayload = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: 'Breaking Title</script><script>alert(1)</script>',
    description: 'Fake description with </SCRIPT>',
  }
  const serializedInjected = safeJsonLd(injectionPayload)
  assert(!serializedInjected.includes('</script>'), 'Eliminates literal </script> sequence from output')
  assert(!serializedInjected.includes('</SCRIPT>'), 'Eliminates literal </SCRIPT> sequence from output')
  assert(serializedInjected.includes('\\u003c/script\\u003e'), 'Replaces < and > with Unicode escape sequences \\u003c and \\u003e')

  // Simulated HTML tokenizer verification
  const simulatedHtml = `<script type="application/ld+json">${serializedInjected}</script>`
  const firstCloseIndex = simulatedHtml.indexOf('</script>')
  const expectedEndIndex = simulatedHtml.length - 9
  assert(
    firstCloseIndex === expectedEndIndex,
    `HTML parser finds no premature </script> tags (ends at exact index ${expectedEndIndex})`
  )

  // Verify search engine crawler data fidelity
  const roundTripParsed = JSON.parse(serializedInjected)
  assert(
    roundTripParsed.headline === injectionPayload.headline,
    'Search engine JSON parser reconstructs exact original headline string including special characters'
  )

  // Special characters & ampersands test
  const specialCharsPayload = {
    title: '<script>alert("XSS")</script>',
    description: 'Tom & Jerry & Co. <info@example.com>',
  }
  const serializedSpecial = safeJsonLd(specialCharsPayload)
  assert(!serializedSpecial.includes('<script>'), 'Eliminates literal <script> opening sequence')
  assert(serializedSpecial.includes('\\u003cscript\\u003e'), 'Escapes <script> to \\u003cscript\\u003e')
  assert(serializedSpecial.includes('\\u0026'), 'Escapes ampersands to \\u0026')
  const roundTripSpecial = JSON.parse(serializedSpecial)
  assert(roundTripSpecial.title === specialCharsPayload.title, 'Preserves title with special characters on parse')
  assert(roundTripSpecial.description === specialCharsPayload.description, 'Preserves description with ampersands on parse')

  // U+2028 and U+2029 line separator escaping
  const separatorPayload = { text: 'Line\u2028Separator\u2029Test' }
  const serializedSeparators = safeJsonLd(separatorPayload)
  assert(
    !serializedSeparators.includes('\u2028') && !serializedSeparators.includes('\u2029'),
    'Escapes U+2028 and U+2029 line separators for legacy JavaScript engine safety'
  )

  // ─── 2. URL Protocol Validation Tests (isValidHttpUrl & sanitizeExternalUrl) ──
  console.log('\n2. URL Protocol Validation & Sanitization Tests')

  const validUrls = [
    'https://example.com',
    'https://www.4rinlabs.com/services',
    'http://localhost:3000',
    'https://sub.domain.org/path?query=1&b=2#hash',
    'http://fysclothing.in/',
  ]
  for (const url of validUrls) {
    assert(isValidHttpUrl(url), `Accepts valid HTTP/HTTPS URL: ${url}`)
    assert(sanitizeExternalUrl(url) === url, `sanitizeExternalUrl preserves valid URL: ${url}`)
  }

  const maliciousUrls = [
    'javascript:alert(document.cookie)',
    'JAVASCRIPT:alert(1)',
    '  javascript:alert(1)',
    '\tjavascript:alert(1)',
    'javascript:/*comment*/alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:application/json;base64,eyJhIjoxfQ==',
    'vbscript:msgbox("XSS")',
    'file:///C:/Windows/System32/calc.exe',
    '//attacker.com/evil.js',
    'ftp://ftp.example.com/file',
    'blob:https://example.com/uuid',
  ]
  for (const url of maliciousUrls) {
    assert(!isValidHttpUrl(url), `Rejects disallowed/dangerous URL: ${url}`)
    assert(sanitizeExternalUrl(url) === undefined, `sanitizeExternalUrl returns undefined for: ${url}`)
  }

  // Edge cases: null, undefined, empty, non-string
  assert(sanitizeExternalUrl(null) === undefined, 'sanitizeExternalUrl handles null safely')
  assert(sanitizeExternalUrl(undefined) === undefined, 'sanitizeExternalUrl handles undefined safely')
  assert(sanitizeExternalUrl('') === undefined, 'sanitizeExternalUrl handles empty string safely')
  assert(sanitizeExternalUrl('   ') === undefined, 'sanitizeExternalUrl handles whitespace-only string safely')

  // ─── 3. Zod Schema Validation Tests ───────────────────────────────────────────
  console.log('\n3. Zod Schema URL Validation Tests')

  // Portfolio schema tests
  const basePortfolio = {
    title: 'Valid Project',
    slug: 'valid-project',
    description: 'Detailed description',
    projectUrl: 'https://example.com',
    githubUrl: 'https://github.com/4rinlabs',
  }
  assert(PortfolioSchema.safeParse(basePortfolio).success, 'PortfolioSchema accepts valid HTTPS URLs')

  const xssPortfolio = {
    ...basePortfolio,
    projectUrl: 'javascript:alert(1)',
  }
  const portfolioResult = PortfolioSchema.safeParse(xssPortfolio)
  assert(!portfolioResult.success, 'PortfolioSchema rejects javascript: projectUrl')

  const dataPortfolio = {
    ...basePortfolio,
    githubUrl: 'data:text/html,<script>evil()</script>',
  }
  assert(!PortfolioSchema.safeParse(dataPortfolio).success, 'PortfolioSchema rejects data: githubUrl')

  const emptyUrlPortfolio = {
    ...basePortfolio,
    projectUrl: '',
    githubUrl: '',
  }
  assert(PortfolioSchema.safeParse(emptyUrlPortfolio).success, 'PortfolioSchema accepts empty strings for optional URLs')

  // Product schema tests
  const baseProduct = {
    name: 'Valid Product',
    slug: 'valid-product',
    tagline: 'A great product tagline',
    description: 'Full product description',
    productUrl: 'https://product.4rinlabs.com',
    githubUrl: 'https://github.com/4rinlabs/product',
  }
  assert(ProductSchema.safeParse(baseProduct).success, 'ProductSchema accepts valid HTTPS URLs')

  const xssProduct = {
    ...baseProduct,
    productUrl: 'javascript:stealTokens()',
  }
  assert(!ProductSchema.safeParse(xssProduct).success, 'ProductSchema rejects javascript: productUrl')

  const emptyUrlProduct = {
    ...baseProduct,
    productUrl: '',
    githubUrl: '',
  }
  assert(ProductSchema.safeParse(emptyUrlProduct).success, 'ProductSchema accepts empty strings for optional product URLs')

  // ─── 4. Supabase Hostname Validation & remotePatterns Tests ───────────────────
  console.log('\n4. Supabase Hostname Validation & remotePatterns Restriction Tests')

  // Exact resolution tests
  assert(
    resolveSupabaseHostname('https://oprgqmhcigkqtnofglbp.supabase.co') === 'oprgqmhcigkqtnofglbp.supabase.co',
    'resolveSupabaseHostname correctly parses valid Supabase URL'
  )
  assert(
    resolveSupabaseHostname('"https://oprgqmhcigkqtnofglbp.supabase.co"') === 'oprgqmhcigkqtnofglbp.supabase.co',
    'resolveSupabaseHostname strips surrounding quotes correctly'
  )

  // Fail-fast configuration error tests
  let missingError = false
  try {
    resolveSupabaseHostname('')
  } catch (err: any) {
    missingError = err.message.includes('Missing required environment variable')
  }
  assert(missingError, 'resolveSupabaseHostname fails fast with clear error when environment variable is missing')

  let malformedError = false
  try {
    resolveSupabaseHostname('not-a-valid-url')
  } catch (err: any) {
    malformedError = err.message.includes('Invalid NEXT_PUBLIC_SUPABASE_URL format')
  }
  assert(malformedError, 'resolveSupabaseHostname fails fast on malformed URL string')

  let insecureError = false
  try {
    resolveSupabaseHostname('http://oprgqmhcigkqtnofglbp.supabase.co')
  } catch (err: any) {
    insecureError = err.message.includes('Insecure NEXT_PUBLIC_SUPABASE_URL protocol')
  }
  assert(insecureError, 'resolveSupabaseHostname rejects insecure http protocol')

  let wildcardError = false
  try {
    resolveSupabaseHostname('https://*.supabase.co')
  } catch (err: any) {
    wildcardError = err.message.includes('Wildcard hostnames and root domains are strictly prohibited')
  }
  assert(wildcardError, 'resolveSupabaseHostname strictly rejects wildcard *.supabase.co')

  let rootDomainError = false
  try {
    resolveSupabaseHostname('https://supabase.co')
  } catch (err: any) {
    rootDomainError = err.message.includes('Wildcard hostnames and root domains are strictly prohibited')
  }
  assert(rootDomainError, 'resolveSupabaseHostname strictly rejects root domain supabase.co')

  let foreignDomainError = false
  try {
    resolveSupabaseHostname('https://evil-supabase.com')
  } catch (err: any) {
    foreignDomainError = err.message.includes('Must be an exact project domain ending in .supabase.co')
  }
  assert(foreignDomainError, 'resolveSupabaseHostname strictly rejects foreign non-supabase.co domains')

  // next.config.ts remotePatterns inspection
  const remotePatterns = nextConfig.images?.remotePatterns || []
  assert(remotePatterns.length > 0, 'remotePatterns is defined')

  const hasWildcard = remotePatterns.some((pattern: any) =>
    pattern.hostname === '**' || pattern.hostname === '*' || pattern.hostname === '*.supabase.co'
  )
  assert(!hasWildcard, 'Wildcard hostnames (**, *, *.supabase.co) are completely eliminated from remotePatterns')

  const exactHost = resolveSupabaseHostname()
  const supabasePattern = remotePatterns.find((pattern: any) => pattern.hostname === exactHost)
  assert(Boolean(supabasePattern), `remotePatterns enforces exact project host: ${exactHost}`)
  assert(supabasePattern?.protocol === 'https', 'Supabase pattern enforces https protocol')
  assert(
    supabasePattern?.pathname === '/storage/v1/object/public/**',
    'Supabase pattern restricts access strictly to public storage bucket paths'
  )

  // ─── 5. HTTP Security Headers, CSP & Duplication Prevention Tests ─────────────
  console.log('\n5. HTTP Security Headers, CSP & Duplication Prevention Tests')

  assert(typeof nextConfig.headers === 'function', 'nextConfig defines async headers() function as single source of truth')
  const headersList = nextConfig.headers ? await nextConfig.headers() : []
  const globalHeaderConfig = headersList.find((h: any) => h.source === '/(.*)')
  assert(Boolean(globalHeaderConfig), 'Configures global security headers for source "/(.*)"')

  const headerMap: Record<string, string> = {}
  for (const h of globalHeaderConfig?.headers || []) {
    headerMap[h.key] = h.value
  }

  assert(Boolean(headerMap['Content-Security-Policy-Report-Only']), 'Defines Content-Security-Policy-Report-Only header')
  assert(headerMap['Strict-Transport-Security'] === 'max-age=31536000', 'Enforces Strict-Transport-Security (1 year)')
  assert(headerMap['X-Content-Type-Options'] === 'nosniff', 'Enforces X-Content-Type-Options: nosniff')
  assert(headerMap['X-Frame-Options'] === 'DENY', 'Enforces X-Frame-Options: DENY')
  assert(headerMap['Referrer-Policy'] === 'strict-origin-when-cross-origin', 'Enforces Referrer-Policy: strict-origin-when-cross-origin')
  assert(headerMap['Permissions-Policy'].includes('geolocation=()'), 'Enforces Permissions-Policy disabling geolocation')
  assert(headerMap['Permissions-Policy'].includes('camera=()'), 'Enforces Permissions-Policy disabling camera')
  assert(headerMap['Permissions-Policy'].includes('microphone=()'), 'Enforces Permissions-Policy disabling microphone')

  // Verify specific CSP directives
  const csp = headerMap['Content-Security-Policy-Report-Only'] || ''
  assert(csp.includes("default-src 'self'"), 'CSP includes default-src \'self\'')
  assert(csp.includes('https://challenges.cloudflare.com'), 'CSP script-src/frame-src/connect-src allows Cloudflare Turnstile')
  assert(csp.includes(`https://${exactHost}`), `CSP img-src restricts image loading strictly to exact host: https://${exactHost}`)
  assert(!csp.includes('https://*.supabase.co'), 'CSP img-src strictly eliminates wildcard https://*.supabase.co')
  assert(!csp.includes('connect-src https://*.supabase.co'), 'CSP connect-src does NOT include Supabase (client never connects directly)')
  assert(csp.includes("frame-ancestors 'none'"), 'CSP enforces frame-ancestors \'none\'')
  assert(csp.includes("object-src 'none'"), 'CSP enforces object-src \'none\'')
  assert(csp.includes("base-uri 'self'"), 'CSP enforces base-uri \'self\'')
  assert(csp.includes("form-action 'self'"), 'CSP enforces form-action \'self\'')

  // Verify vercel.json duplication prevention
  const vercelJson = JSON.parse(fs.readFileSync('vercel.json', 'utf8'))
  const vercelHeaders = vercelJson.headers || []
  const redundantGlobalHeaders = vercelHeaders.find((h: any) => h.source === '/(.*)')
  assert(!redundantGlobalHeaders, 'vercel.json eliminates redundant /(.*) headers to prevent duplicate header injection on Vercel Edge')

  console.log('\n========================================')
  console.log(`  Results: ${passedTests} passed, ${failedTests} failed out of ${totalTests} tests`)
  console.log('========================================\n')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Test suite encountered an unhandled error:', err)
  process.exit(1)
})
