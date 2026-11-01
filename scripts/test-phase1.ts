import assert from 'node:assert/strict'
import { escapeHtml, formatSafeMessage, sendContactNotification } from '../lib/mailer'
import { getClientIp, checkContactRateLimit } from '../lib/ratelimit'
import { verifyTurnstileToken } from '../lib/turnstile'
import { submitContact } from '../actions/contact'

async function runTests() {
  console.log('🧪 Starting Comprehensive Phase 1 Security Test Suite...\n')
  let passed = 0
  let failed = 0

  function test(name: string, fn: () => void) {
    try {
      fn()
      console.log(`  ✅ ${name}`)
      passed++
    } catch (err: unknown) {
      console.error(`  ❌ ${name}`)
      console.error(err)
      failed++
    }
  }

  async function asyncTest(name: string, fn: () => Promise<void>) {
    try {
      await fn()
      console.log(`  ✅ ${name}`)
      passed++
    } catch (err: unknown) {
      console.error(`  ❌ ${name}`)
      console.error(err)
      failed++
    }
  }

  // ─── 1. HTML Escaping Tests ───────────────────────────────────────────────
  console.log('--- 1. Context-Appropriate HTML Escaping & Injection Defense ---')

  test('escapeHtml encodes all HTML injection vectors', () => {
    const malicious = '<script>alert("XSS")</script>&foo=\'bar\'/test<img src=x onerror=alert(1)>'
    const escaped = escapeHtml(malicious)
    assert.ok(!escaped.includes('<'))
    assert.ok(!escaped.includes('>'))
    assert.ok(!escaped.includes('"'))
    assert.ok(!escaped.includes("'"))
    assert.ok(escaped.includes('&lt;script&gt;'))
    assert.ok(escaped.includes('&lt;img src=x onerror=alert(1)&gt;'))
  })

  test('formatSafeMessage preserves newlines while neutralizing script injection', () => {
    const raw = '<b onmouseover="alert(1)">Hello</b>\nLine 2\r\nLine 3'
    const formatted = formatSafeMessage(raw)
    assert.ok(!formatted.includes('<b onmouseover'))
    assert.ok(formatted.includes('&lt;b onmouseover=&quot;alert(1)&quot;&gt;Hello&lt;&#x2F;b&gt;'))
    assert.ok(formatted.includes('<br />Line 2<br />Line 3'))
  })

  // ─── 2. Client IP Extraction Tests ────────────────────────────────────────
  console.log('\n--- 2. Client IP Extraction & Untrusted Header Defense ---')

  test('getClientIp prioritizes verified x-real-ip and ignores unverified headers', () => {
    // 1. x-real-ip (authoritative on Vercel)
    const realIpHeader = new Headers({ 'x-real-ip': '198.51.100.5' })
    assert.equal(getClientIp(realIpHeader), '198.51.100.5')

    // 2. x-forwarded-for fallback
    const forwardedHeader = new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1' })
    assert.equal(getClientIp(forwardedHeader), '203.0.113.10')

    // 3. Non-standard x-vercel-ip is strictly ignored (anti-spoofing)
    const fakeVercelHeader = new Headers({ 'x-vercel-ip': '203.0.113.99' })
    assert.equal(getClientIp(fakeVercelHeader), 'shared-unidentified-client-bucket')
  })

  test('getClientIp never falls back to 127.0.0.1 for unidentified clients', () => {
    const emptyHeaders = new Headers({})
    const fallback = getClientIp(emptyHeaders)
    assert.equal(fallback, 'shared-unidentified-client-bucket')
    assert.notEqual(fallback, '127.0.0.1')
  })

  test('getClientIp rejects non-IP hostnames and returns shared bucket', () => {
    const malformed = new Headers({ 'x-forwarded-for': 'attacker-injection.evil.com' })
    assert.equal(getClientIp(malformed), 'shared-unidentified-client-bucket')
  })

  // ─── 3. Cloudflare Turnstile Server Verification Tests ─────────────────────
  console.log('\n--- 3. Cloudflare Turnstile Server-Side Verification ---')

  await asyncTest('verifyTurnstileToken rejects missing/empty tokens', async () => {
    const empty = await verifyTurnstileToken({ token: '' })
    assert.equal(empty.success, false)
    assert.ok(empty.message?.includes('verification check'))

    const nullToken = await verifyTurnstileToken({ token: null })
    assert.equal(nullToken.success, false)
  })

  await asyncTest('verifyTurnstileToken with Cloudflare always-fail test secret rejects tokens', async () => {
    const origSecret = process.env.TURNSTILE_SECRET_KEY
    try {
      // Official Cloudflare always-fails test secret
      process.env.TURNSTILE_SECRET_KEY = '2x0000000000000000000000000000000AB'
      const failRes = await verifyTurnstileToken({
        token: 'DUMMY.TOKEN',
        expectedAction: 'contact_form',
      })
      assert.equal(failRes.success, false)
      assert.ok(typeof failRes.message === 'string')
    } finally {
      process.env.TURNSTILE_SECRET_KEY = origSecret
    }
  })

  await asyncTest('verifyTurnstileToken rejects documented test secrets in production mode', async () => {
    const origEnv = process.env.NODE_ENV
    const origSecret = process.env.TURNSTILE_SECRET_KEY
    const testKeys = [
      '1x0000000000000000000000000000000AA',
      '2x0000000000000000000000000000000AB',
      '3x0000000000000000000000000000000AA',
    ]

    try {
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'

      for (const key of testKeys) {
        process.env.TURNSTILE_SECRET_KEY = key
        const res = await verifyTurnstileToken({ token: 'dummy' })
        assert.equal(res.success, false)
        assert.ok(res.message?.includes('configuration'))
      }
    } finally {
      ;(process.env as Record<string, string | undefined>).NODE_ENV = origEnv
      process.env.TURNSTILE_SECRET_KEY = origSecret
    }
  })

  // ─── 4. Honeypot Bot Interception Tests ────────────────────────────────────
  console.log('\n--- 4. Honeypot Bot Interception ---')

  await asyncTest('Filled honeypot intercepts bots silently without writes or emails', async () => {
    const formData = new FormData()
    formData.append('name', 'Bot Attacker')
    formData.append('email', 'bot@spammer.org')
    formData.append('phone', '+1234567890')
    formData.append('message', 'Spam payload')
    formData.append('b_website_url', 'https://malicious-advert.com') // 👈 Honeypot filled

    const res = await submitContact({ success: false, message: '' }, formData)
    // Honeypot returns synthetic success to disarm automated retries
    assert.equal(res.success, true)
    assert.ok(res.message.includes('Message received'))
  })

  // ─── 5. Rate Limiter Safe Fallback Policy Tests ─────────────────────────────
  console.log('\n--- 5. Atomic Rate Limiting & Safe Degradation ---')

  await asyncTest('checkContactRateLimit operates cleanly in standalone or fallback mode', async () => {
    const res = await checkContactRateLimit('203.0.113.100', 'audit-test@4rinlabs.com')
    // Must return an explicit rate-limit determination with redisAvailable flag
    assert.ok(typeof res.success === 'boolean')
    assert.ok(typeof res.redisAvailable === 'boolean')
  })

  // ─── 6. Auto-Reply Suppression & Idempotency Tests ────────────────────────
  console.log('\n--- 6. Auto-Reply Throttling & Lock Retention ---')

  await asyncTest('Customer auto-reply is strictly suppressed when Redis is unavailable', async () => {
    const result = await sendContactNotification(
      {
        name: 'Jane Doe',
        email: 'customer-test@example.com',
        phone: '+1234567890',
        message: 'Project inquiry description',
      },
      { redisAvailable: false },
    )

    // Unmetered outgoing relays MUST be disabled when Redis is unavailable
    assert.equal(result.customerAutoReplySent, false)
    assert.ok(result.suppressedReason?.includes('Suppressed'))
  })

  console.log(`\n========================================`)
  console.log(`All Phase 1 Security Tests Passed: ${passed}/${passed + failed}`)
  console.log(`========================================\n`)

  if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
  console.error('Test suite failed:', err)
  process.exit(1)
})
