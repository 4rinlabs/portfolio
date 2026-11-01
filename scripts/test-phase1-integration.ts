import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { resend } from '../lib/resend'
import { setRedisForTesting, checkContactRateLimit } from '../lib/ratelimit'
import { verifyTurnstileToken } from '../lib/turnstile'
import { sendContactNotification } from '../lib/mailer'
import { submitContact } from '../actions/contact'

/**
 * In-Memory Mock Redis Implementation for Isolated Deterministic Testing
 */
class MockRedis {
  store = new Map<string, { value: string; expiresAt?: number }>()
  counts = new Map<string, number>()

  async evalsha(): Promise<any> {
    throw new Error('NOSCRIPT')
  }

  async eval(_script: string, keys: string[], args: any[]): Promise<any> {
    const key = keys[0]
    const max = Number(args[0])
    const current = this.counts.get(key) || 0
    if (current >= max) {
      return [-1, max]
    }
    this.counts.set(key, current + 1)
    return [max - (current + 1), max]
  }

  async set(key: string, value: string, options?: { nx?: boolean; ex?: number }): Promise<'OK' | null> {
    const now = Date.now()
    const existing = this.store.get(key)
    if (existing?.expiresAt && existing.expiresAt < now) {
      this.store.delete(key)
    }
    if (options?.nx && this.store.has(key)) {
      return null
    }
    const expiresAt = options?.ex ? now + options.ex * 1000 : undefined
    this.store.set(key, { value, expiresAt })
    return 'OK'
  }

  async get(key: string): Promise<string | null> {
    const now = Date.now()
    const existing = this.store.get(key)
    if (existing?.expiresAt && existing.expiresAt < now) {
      this.store.delete(key)
      return null
    }
    return existing ? existing.value : null
  }

  async del(key: string): Promise<number> {
    const existed = this.store.delete(key)
    return existed ? 1 : 0
  }

  reset() {
    this.store.clear()
    this.counts.clear()
  }
}

async function runIntegrationTests() {
  console.log('🧪 Starting Phase 1 Comprehensive Integration Test Suite...\n')

  let passed = 0
  let failed = 0

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn()
      console.log(`  ✅ [Passed] ${name}`)
      passed++
    } catch (err: unknown) {
      console.error(`  ❌ [FAILED] ${name}`)
      console.error(err)
      failed++
    }
  }

  // Intercept and isolate Database, Resend, and Fetch interactions
  const mockDbLeads: any[] = []
  const originalPrismaCreate = prisma.contactLead.create
  const originalPrismaCount = prisma.contactLead.count
  const originalResendSend = resend.emails.send
  const originalFetch = globalThis.fetch

  const dispatchedEmails: any[] = []
  let mockTurnstileResult = {
    success: true,
    hostname: '4rinlabs.com',
    action: 'contact_form',
    challenge_ts: new Date().toISOString(),
  }

  const mockRedis = new MockRedis()

  function resetEnvironment() {
    mockDbLeads.length = 0
    dispatchedEmails.length = 0
    mockRedis.reset()
    setRedisForTesting(mockRedis)
    mockTurnstileResult = {
      success: true,
      hostname: '4rinlabs.com',
      action: 'contact_form',
      challenge_ts: new Date().toISOString(),
    }
    globalThis.fetch = (async (url: any, options: any) => {
      if (String(url).includes('turnstile/v0/siteverify')) {
        return new Response(JSON.stringify(mockTurnstileResult), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return originalFetch(url, options)
    }) as any
  }

  // Setup Mocks
  prisma.contactLead.create = (async (args: any) => {
    const id = `lead_${Math.random().toString(36).slice(2, 9)}`
    const record = { id, ...args.data, read: false, createdAt: new Date() }
    mockDbLeads.push(record)
    return record
  }) as any

  prisma.contactLead.count = (async (args: any) => {
    let matches = mockDbLeads
    if (args?.where?.email?.equals) {
      const email = args.where.email.equals.toLowerCase()
      matches = matches.filter((l) => l.email.toLowerCase() === email)
    }
    return matches.length
  }) as any

  resend.emails.send = (async (payload: any) => {
    dispatchedEmails.push(payload)
    return { data: { id: `msg_${Math.random().toString(36).slice(2)}` }, error: null }
  }) as any

  globalThis.fetch = (async (url: any, options: any) => {
    if (String(url).includes('turnstile/v0/siteverify')) {
      return new Response(JSON.stringify(mockTurnstileResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return originalFetch(url, options)
  }) as any

  try {
    // ─── Test 1: Valid submission creates exactly one lead and triggers an admin notification ───
    await test('1. Valid submission creates exactly one lead and triggers an admin notification', async () => {
      resetEnvironment()
      const formData = new FormData()
      formData.append('name', 'Alice Founder')
      formData.append('email', 'alice@venture.co')
      formData.append('phone', '+1 555-0100')
      formData.append('company', 'Venture AI')
      formData.append('message', 'We want to build an enterprise AI agent platform.')
      formData.append('cf-turnstile-response', 'valid_token')

      const res = await submitContact({ success: false, message: '' }, formData)

      assert.equal(res.success, true)
      assert.equal(mockDbLeads.length, 1)
      assert.equal(mockDbLeads[0].name, 'Alice Founder')

      // Admin notification must be dispatched
      const adminEmail = dispatchedEmails.find((e) => e.to === '4rinlabs@gmail.com')
      assert.ok(adminEmail, 'Admin notification was not dispatched')
      assert.ok(adminEmail.subject.includes(mockDbLeads[0].id.slice(-6)), 'Subject should include lead ID')
      assert.ok(adminEmail.html.includes(mockDbLeads[0].id), 'Email body should include lead ID')
    })

    // ─── Test 2: Invalid Turnstile token creates no lead ───
    await test('2. Invalid Turnstile token creates no lead', async () => {
      resetEnvironment()
      mockTurnstileResult = {
        success: false,
        hostname: '4rinlabs.com',
        action: 'contact_form',
        challenge_ts: new Date().toISOString(),
      }

      const formData = new FormData()
      formData.append('name', 'Attacker')
      formData.append('email', 'attacker@spammer.net')
      formData.append('phone', '+1234567890')
      formData.append('message', 'Spamming without valid token')
      formData.append('cf-turnstile-response', 'invalid_token')

      const res = await submitContact({ success: false, message: '' }, formData)

      assert.equal(res.success, false)
      assert.equal(mockDbLeads.length, 0, 'No lead should be saved when Turnstile fails')
      assert.equal(dispatchedEmails.length, 0, 'No email should be dispatched')
    })

    // ─── Test 3: Invalid hostname is rejected ───
    await test('3. Invalid hostname is rejected', async () => {
      resetEnvironment()
      mockTurnstileResult = {
        success: true,
        hostname: 'malicious-phishing-domain.com', // 👈 Foreign / unauthorized origin
        action: 'contact_form',
        challenge_ts: new Date().toISOString(),
      }

      const formData = new FormData()
      formData.append('name', 'Origin Hijacker')
      formData.append('email', 'hijacker@badsite.com')
      formData.append('phone', '+1234567890')
      formData.append('message', 'Origin replay attack payload')
      formData.append('cf-turnstile-response', 'replayed_token')

      const res = await submitContact({ success: false, message: '' }, formData)

      assert.equal(res.success, false)
      assert.ok(res.message.toLowerCase().includes('origin') || res.message.toLowerCase().includes('security'))
      assert.equal(mockDbLeads.length, 0)
    })

    // ─── Test 4: Missing or incorrect action is rejected ───
    await test('4. Missing or incorrect action is rejected', async () => {
      resetEnvironment()
      // Case A: Wrong action
      mockTurnstileResult = {
        success: true,
        hostname: '4rinlabs.com',
        action: 'user_login', // 👈 Wrong action
        challenge_ts: new Date().toISOString(),
      }

      const resA = await verifyTurnstileToken({
        token: 'token_wrong_action',
        expectedAction: 'contact_form',
      })
      assert.equal(resA.success, false)
      assert.ok(resA.message?.includes('mismatch'))

      // Case B: Missing action
      mockTurnstileResult = {
        success: true,
        hostname: '4rinlabs.com',
        action: undefined as any, // 👈 Missing action
        challenge_ts: new Date().toISOString(),
      }

      const resB = await verifyTurnstileToken({
        token: 'token_missing_action',
        expectedAction: 'contact_form',
      })
      assert.equal(resB.success, false)
      assert.ok(resB.message?.includes('mismatch'))
    })

    // ─── Test 5: Honeypot submission creates no lead and sends no email ───
    await test('5. Honeypot submission creates no lead and sends no email', async () => {
      resetEnvironment()
      const formData = new FormData()
      formData.append('name', 'Automated Scraping Bot')
      formData.append('email', 'bot@scraper.io')
      formData.append('phone', '+1 555-9999')
      formData.append('message', 'Buy crypto now')
      formData.append('b_website_url', 'https://bot-trap.com') // 👈 Filled honeypot
      formData.append('cf-turnstile-response', 'token')

      const res = await submitContact({ success: false, message: '' }, formData)

      // Synthetic success disarms the bot
      assert.equal(res.success, true)
      assert.equal(mockDbLeads.length, 0, 'Honeypot submission must not create a lead in PostgreSQL')
      assert.equal(dispatchedEmails.length, 0, 'Honeypot submission must not dispatch emails')
    })

    // ─── Test 6: Same-IP concurrent submissions are limited under the Redis path ───
    await test('6. Same-IP concurrent submissions are limited under the Redis path', async () => {
      resetEnvironment()
      const testIp = '198.51.100.42'
      const results: boolean[] = []

      // IP limit is 5 requests per 10 minutes
      for (let i = 0; i < 7; i++) {
        const res = await checkContactRateLimit(testIp, `user_${i}@example.com`)
        results.push(res.success)
      }

      const passedCount = results.filter((r) => r === true).length
      const blockedCount = results.filter((r) => r === false).length

      assert.equal(passedCount, 5, 'Exactly 5 requests from same IP should pass')
      assert.equal(blockedCount, 2, 'Subsequent requests from same IP should be blocked')
    })

    // ─── Test 7: Same-email submissions from different IPs are limited ───
    await test('7. Same-email submissions from different IPs are limited', async () => {
      resetEnvironment()
      const targetEmail = 'target@corporate.com'
      const results: boolean[] = []

      // Email limit is 3 requests per 15 minutes across different IPs
      for (let i = 0; i < 5; i++) {
        const differentIp = `198.51.100.${i + 10}`
        const res = await checkContactRateLimit(differentIp, targetEmail)
        results.push(res.success)
      }

      const passedCount = results.filter((r) => r === true).length
      const blockedCount = results.filter((r) => r === false).length

      assert.equal(passedCount, 3, 'Exactly 3 requests for the same email should pass')
      assert.equal(blockedCount, 2, 'Subsequent requests for the same email should be blocked')
    })

    // ─── Test 8: Preliminary rate limiter Redis operational & outage lifecycle ───
    await test('8. Preliminary rate limiter Redis operational, outage, and recovery lifecycle', async () => {
      resetEnvironment()
      let siteverifyCalls = 0
      globalThis.fetch = (async (url: any, options: any) => {
        if (String(url).includes('turnstile/v0/siteverify')) {
          siteverifyCalls++
          return new Response(JSON.stringify(mockTurnstileResult), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return originalFetch(url, options)
      }) as any

      // 8.1 Redis operational: requests within the limit proceed to Siteverify
      const validForm = new FormData()
      validForm.append('name', 'Operational User')
      validForm.append('email', 'op@active.com')
      validForm.append('phone', '+1234567890')
      validForm.append('message', 'Testing normal operational flow')
      validForm.append('cf-turnstile-response', 'valid_tok')

      const resOperational = await submitContact({ success: false, message: '' }, validForm)
      assert.equal(resOperational.success, true)
      assert.equal(siteverifyCalls, 1, 'Siteverify must be called when Redis is operational and under limit')
      assert.equal(mockDbLeads.length, 1)

      // 8.2 Redis operational: requests exceeding the limit are rejected before Siteverify
      for (let i = 0; i < 11; i++) {
        const floodForm = new FormData()
        floodForm.append('name', `Flood ${i}`)
        floodForm.append('email', `flood_${i}@active.com`)
        floodForm.append('phone', '+1234567890')
        floodForm.append('message', 'Flooding verification attempts')
        floodForm.append('cf-turnstile-response', 'flood_tok')
        await submitContact({ success: false, message: '' }, floodForm)
      }
      // Outbound calls to Siteverify must be capped at 10 (the preliminary limit)
      assert.equal(siteverifyCalls, 10, 'Siteverify calls must be strictly capped at preliminary limit (10)')

      // 8.3 & 8.4 Redis unavailable: request rejected before Siteverify, no lead created, no email sent
      setRedisForTesting(null) // 👈 Simulate Redis outage
      mockDbLeads.length = 0
      dispatchedEmails.length = 0
      const callsBeforeOutage = siteverifyCalls

      const outageForm = new FormData()
      outageForm.append('name', 'Bob Outage')
      outageForm.append('email', 'bob@outage-test.org')
      outageForm.append('phone', '+1 555-0200')
      outageForm.append('message', 'Inquiry submitted during Redis downtime')
      outageForm.append('cf-turnstile-response', 'valid_token')

      const resOutage = await submitContact({ success: false, message: '' }, outageForm)

      // Must fail closed with generic friendly error
      assert.equal(resOutage.success, false)
      assert.ok(resOutage.message.includes('temporarily unavailable'))
      // Siteverify was NOT called
      assert.equal(siteverifyCalls, callsBeforeOutage, 'Siteverify must NOT be called during Redis outage')
      // No database write and no email sent
      assert.equal(mockDbLeads.length, 0, 'No lead must be created during Redis outage')
      assert.equal(dispatchedEmails.length, 0, 'No email must be sent during Redis outage')

      // 8.5 Redis recovers: requests can proceed normally again
      setRedisForTesting(mockRedis)
      mockRedis.reset() // Reset buckets upon recovery

      const recoveryForm = new FormData()
      recoveryForm.append('name', 'Recovery User')
      recoveryForm.append('email', 'recovery@restored.com')
      recoveryForm.append('phone', '+1234567890')
      recoveryForm.append('message', 'Submitting inquiry after Redis restored')
      recoveryForm.append('cf-turnstile-response', 'valid_tok')

      const resRecovery = await submitContact({ success: false, message: '' }, recoveryForm)
      assert.equal(resRecovery.success, true)
      assert.equal(mockDbLeads.length, 1, 'Lead must be created after Redis recovers')
      assert.ok(dispatchedEmails.find((e) => e.to === '4rinlabs@gmail.com'), 'Admin must be notified upon recovery')
    })

    // ─── Test 8b: Invalid form data cannot trigger Siteverify (Order of validation) ───
    await test('8b. Inexpensive form validation executes before Siteverify, blocking invalid data without network calls', async () => {
      resetEnvironment()
      let siteverifyCalled = false
      globalThis.fetch = (async (url: any, options: any) => {
        if (String(url).includes('turnstile/v0/siteverify')) {
          siteverifyCalled = true
          return new Response(JSON.stringify(mockTurnstileResult), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return originalFetch(url, options)
      }) as any

      const invalidForm = new FormData()
      invalidForm.append('name', '') // Invalid: name is required
      invalidForm.append('email', 'not-an-email') // Invalid: malformed email
      invalidForm.append('phone', '123') // Invalid: phone too short
      invalidForm.append('message', '') // Invalid: message required
      invalidForm.append('cf-turnstile-response', 'valid_token')

      const res = await submitContact({ success: false, message: '' }, invalidForm)

      assert.equal(res.success, false)
      assert.ok(res.errors?.name, 'Must return name error')
      assert.ok(res.errors?.email, 'Must return email error')
      assert.equal(siteverifyCalled, false, 'Siteverify must NEVER be called when form data is invalid')
      assert.equal(mockDbLeads.length, 0)
    })

    // ─── Test 9: PostgreSQL fallback concurrency limitations are explicitly tested and documented ───
    await test('9. PostgreSQL fallback concurrency limitations are explicitly tested and documented', async () => {
      resetEnvironment()
      setRedisForTesting(null) // In fallback mode

      const fallbackEmail = 'concurrency@fallback.com'
      // Documenting non-atomic TOCTOU check-then-insert:
      // In PostgreSQL fallback, concurrent checkContactRateLimit calls at the same tick
      // evaluate count before inserts occur.
      const check1 = await checkContactRateLimit('10.0.0.1', fallbackEmail)
      const check2 = await checkContactRateLimit('10.0.0.2', fallbackEmail)
      const check3 = await checkContactRateLimit('10.0.0.3', fallbackEmail)
      const check4 = await checkContactRateLimit('10.0.0.4', fallbackEmail)

      // Concurrency characteristic: all 4 read count === 0 simultaneously
      assert.equal(check1.success, true)
      assert.equal(check2.success, true)
      assert.equal(check3.success, true)
      assert.equal(check4.success, true)
      assert.equal(check1.redisAvailable, false, 'Explicitly flags redisAvailable as false')
    })

    // ─── Test 10: Two valid submissions from the same email within 10 seconds both trigger admin notification attempts ───
    await test('10. Two valid submissions from the same email within 10 seconds both trigger admin notification attempts', async () => {
      resetEnvironment()
      const email = 'client@multimessage.com'

      // Submission 1: Initial inquiry
      const res1 = await sendContactNotification({
        name: 'Client',
        email,
        phone: '+1234567890',
        message: 'Initial project inquiry',
        leadId: 'lead_first_001',
      })

      // Submission 2: Follow-up inquiry 2 seconds later (forgot budget/timeline)
      const res2 = await sendContactNotification({
        name: 'Client',
        email,
        phone: '+1234567890',
        message: 'Follow-up: our budget is $50k and deadline is Dec 2026',
        leadId: 'lead_second_002',
      })

      assert.equal(res1.adminNotificationSent, true, 'First admin notification must be sent')
      assert.equal(res2.adminNotificationSent, true, 'Second admin notification must NOT be suppressed by 60s lock')

      const adminEmails = dispatchedEmails.filter((e) => e.to === '4rinlabs@gmail.com')
      assert.equal(adminEmails.length, 2, 'Both submissions must arrive in admin inbox')
    })

    // ─── Test 11: Concurrent same-email submissions cannot send duplicate auto-replies ───
    await test('11. Concurrent same-email submissions cannot send duplicate auto-replies', async () => {
      resetEnvironment()
      const sharedEmail = 'rapid-clicker@enterprise.com'

      // Fire 5 concurrent requests with identical email
      const promises = Array.from({ length: 5 }).map((_, idx) =>
        sendContactNotification({
          name: `User ${idx}`,
          email: sharedEmail,
          phone: '+1234567890',
          message: `Burst submission ${idx}`,
          leadId: `lead_burst_${idx}`,
        }),
      )

      const results = await Promise.all(promises)

      const autoRepliesSent = results.filter((r) => r.customerAutoReplySent).length
      assert.equal(autoRepliesSent, 1, 'Exactly ONE auto-reply must be sent across concurrent requests')

      const customerDispatches = dispatchedEmails.filter((e) => e.to === sharedEmail)
      assert.equal(customerDispatches.length, 1, 'Resend must only be called once for customer auto-reply')
    })

    // ─── Test 12: Resend timeout does not release the auto-reply lock ───
    await test('12. Resend timeout does not release the auto-reply lock', async () => {
      resetEnvironment()
      const timeoutEmail = 'timeout-test@victim.org'

      // Configure Resend to throw an HTTP timeout on customer auto-reply
      let callCount = 0
      resend.emails.send = (async (payload: any) => {
        if (payload.to === timeoutEmail) {
          callCount++
          throw new Error('Resend API timeout: 504 Gateway Timeout')
        }
        dispatchedEmails.push(payload)
        return { data: { id: 'msg_admin' }, error: null }
      }) as any

      // First attempt times out
      const res1 = await sendContactNotification({
        name: 'Timeout User',
        email: timeoutEmail,
        phone: '+1234567890',
        message: 'First attempt with network timeout',
        leadId: 'lead_timeout_1',
      })

      assert.equal(res1.customerAutoReplySent, false)

      // Restore normal Resend behavior
      resend.emails.send = (async (payload: any) => {
        dispatchedEmails.push(payload)
        return { data: { id: 'msg_ok' }, error: null }
      }) as any

      // Second attempt (client retrying after timeout error)
      const res2 = await sendContactNotification({
        name: 'Timeout User',
        email: timeoutEmail,
        phone: '+1234567890',
        message: 'Second attempt retry after timeout',
        leadId: 'lead_timeout_2',
      })

      // Lock MUST have been retained in Redis, preventing duplicate retry delivery
      assert.equal(res2.customerAutoReplySent, false, 'Auto-reply must remain locked after timeout')
      assert.ok(res2.suppressedReason?.includes('already dispatched') || res2.suppressedReason?.includes('cooling'))
    })

    // ─── Test 13: Redis and PostgreSQL failures result in safe rejection ───
    await test('13. Redis and PostgreSQL failures result in safe rejection', async () => {
      resetEnvironment()
      setRedisForTesting(null) // Redis down

      // PostgreSQL also fails
      prisma.contactLead.count = (async () => {
        throw new Error('Database connection terminated unexpectedly')
      }) as any

      const rateLimitRes = await checkContactRateLimit('198.51.100.99', 'fail@safe.com')

      // Fails safe: rejects submission rather than allowing unrestricted access
      assert.equal(rateLimitRes.success, false)
      assert.ok(rateLimitRes.message?.includes('temporarily unavailable'))
    })

    // ─── Test 14: Lead records remain available when email delivery fails ───
    await test('14. Lead records remain available when email delivery fails', async () => {
      resetEnvironment()

      // Resend fails completely
      resend.emails.send = (async () => {
        throw new Error('Resend authentication failed: invalid API key')
      }) as any

      const formData = new FormData()
      formData.append('name', 'Preserved Customer')
      formData.append('email', 'preserved@important.com')
      formData.append('phone', '+1 555-8888')
      formData.append('company', 'Enterprise Buyer')
      formData.append('message', 'High-value RFP inquiry that must never be lost')
      formData.append('cf-turnstile-response', 'valid_token')

      const res = await submitContact({ success: false, message: '' }, formData)

      // User request succeeds because lead was safely committed to DB first
      assert.equal(res.success, true)
      assert.equal(mockDbLeads.length, 1, 'Lead must be preserved in PostgreSQL despite email failure')
      assert.equal(mockDbLeads[0].email, 'preserved@important.com')
    })

    // ─── Test 15: Preliminary IP-based limit blocks excess requests before Siteverify fetch occurs ───
    await test('15. Preliminary IP-based limit blocks excess requests before Siteverify fetch occurs', async () => {
      resetEnvironment()
      let siteverifyFetchCalls = 0

      // Count outbound calls to Cloudflare Siteverify
      globalThis.fetch = (async (url: any, options: any) => {
        if (String(url).includes('turnstile/v0/siteverify')) {
          siteverifyFetchCalls++
          return new Response(
            JSON.stringify({
              success: false,
              'error-codes': ['invalid-input-response'],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return originalFetch(url, options)
      }) as any

      const attackerIp = '198.51.100.77'
      // Preliminary limiter allows 10 requests per 10 minutes from this IP
      // Simulate attacker firing 15 requests with fake non-empty tokens
      const results: any[] = []
      for (let i = 0; i < 15; i++) {
        const formData = new FormData()
        formData.append('name', `Attacker ${i}`)
        formData.append('email', `attacker_${i}@flood.com`)
        formData.append('phone', '+1234567890')
        formData.append('message', 'Outbound socket flood attack attempt')
        formData.append('cf-turnstile-response', `fake_token_${i}`)

        // We invoke submitContact
        const res = await submitContact({ success: false, message: '' }, formData)
        results.push(res)
      }

      // Assert that requests 1-10 reached Siteverify (failed at Turnstile)
      // and requests 11-15 were rejected by preVerificationLimiter BEFORE Siteverify fetch occurred
      const rateLimitedResults = results.filter((r) => r.message?.includes('verification attempts'))
      assert.equal(rateLimitedResults.length, 5, 'Requests 11-15 must be blocked by preliminary limiter')

      // Siteverify fetch MUST have been called at most 10 times, never 15!
      assert.equal(siteverifyFetchCalls, 10, 'Outbound Siteverify fetch calls must be capped at 10')

      // Assert that the legitimate IP submission allowance (ratelimit:contact:ip) was NOT consumed
      const ipSubmissionCount = Array.from(mockRedis.counts.entries()).find(([k]) =>
        k.includes('ratelimit:contact:ip'),
      )?.[1]
      assert.equal(ipSubmissionCount ?? 0, 0, 'Preliminary checks must not consume IP submission allowance')
    })

    // ─── Test 16: Strict challenge_ts timestamp validation rejects missing, invalid, stale, and future dates ───
    await test('16. Strict challenge_ts timestamp validation rejects missing, invalid, stale, and future dates', async () => {
      resetEnvironment()

      // Case A: Missing challenge_ts
      mockTurnstileResult = {
        success: true,
        hostname: '4rinlabs.com',
        action: 'contact_form',
        challenge_ts: undefined as any,
      }
      const resMissing = await verifyTurnstileToken({ token: 't1', expectedAction: 'contact_form' })
      assert.equal(resMissing.success, false)
      assert.ok(resMissing.message?.includes('missing challenge timestamp'))

      // Case B: Unparseable / invalid challenge_ts
      mockTurnstileResult.challenge_ts = 'not-a-valid-timestamp'
      const resInvalid = await verifyTurnstileToken({ token: 't2', expectedAction: 'contact_form' })
      assert.equal(resInvalid.success, false)
      assert.ok(resInvalid.message?.includes('unparseable challenge timestamp'))

      // Case C: Stale timestamp older than 5 minutes (e.g. 6 minutes ago)
      mockTurnstileResult.challenge_ts = new Date(Date.now() - 6 * 60 * 1000).toISOString()
      const resStale = await verifyTurnstileToken({ token: 't3', expectedAction: 'contact_form' })
      assert.equal(resStale.success, false)
      assert.ok(resStale.message?.includes('expired'))

      // Case D: Future-dated timestamp beyond 60s tolerance (e.g. 5 minutes in future)
      mockTurnstileResult.challenge_ts = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      const resFuture = await verifyTurnstileToken({ token: 't4', expectedAction: 'contact_form' })
      assert.equal(resFuture.success, false)
      assert.ok(resFuture.message?.includes('timestamp anomaly'))

      // Case E: Valid timestamp within freshness and skew tolerance (e.g. 30 seconds ago)
      mockTurnstileResult.challenge_ts = new Date(Date.now() - 30 * 1000).toISOString()
      const resValid = await verifyTurnstileToken({ token: 't5', expectedAction: 'contact_form' })
      assert.equal(resValid.success, true)
    })

    // ─── Test 17: Preview/staging environment enforces strict allowlist via ALLOWED_PREVIEW_HOSTNAMES ───
    await test('17. Preview/staging environment enforces strict allowlist via ALLOWED_PREVIEW_HOSTNAMES', async () => {
      resetEnvironment()
      const origEnv = process.env.NODE_ENV
      const origVercelEnv = process.env.VERCEL_ENV
      const origPreviewHostnames = process.env.ALLOWED_PREVIEW_HOSTNAMES
      const origSecret = process.env.TURNSTILE_SECRET_KEY

      try {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
        process.env.VERCEL_ENV = 'preview'
        process.env.ALLOWED_PREVIEW_HOSTNAMES = 'staging.4rinlabs.com,preview.4rinlabs.com'
        process.env.TURNSTILE_SECRET_KEY = 'prod_secret_live_non_test_key'

        // Case A: Unlisted preview hostname is rejected
        mockTurnstileResult = {
          success: true,
          hostname: 'unauthorized-branch.vercel.app',
          action: 'contact_form',
          challenge_ts: new Date().toISOString(),
        }
        const resUnlisted = await verifyTurnstileToken({ token: 't_preview_unlisted' })
        assert.equal(resUnlisted.success, false)
        assert.ok(resUnlisted.message?.includes('invalid origin'))

        // Case B: Explicitly approved preview hostname is accepted
        mockTurnstileResult.hostname = 'staging.4rinlabs.com'
        const resApproved = await verifyTurnstileToken({ token: 't_preview_approved' })
        assert.equal(resApproved.success, true)

        // Case C: Production deployment (VERCEL_ENV !== 'preview') rejects preview hostnames
        process.env.VERCEL_ENV = 'production'
        const resProdRejection = await verifyTurnstileToken({ token: 't_prod_preview_reject' })
        assert.equal(resProdRejection.success, false)
      } finally {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = origEnv
        process.env.VERCEL_ENV = origVercelEnv
        process.env.ALLOWED_PREVIEW_HOSTNAMES = origPreviewHostnames
        process.env.TURNSTILE_SECRET_KEY = origSecret
      }
    })
  } finally {
    // Restore all original functions
    prisma.contactLead.create = originalPrismaCreate
    prisma.contactLead.count = originalPrismaCount
    resend.emails.send = originalResendSend
    globalThis.fetch = originalFetch
    setRedisForTesting(null)
  }

  console.log(`\n======================================================`)
  console.log(`All Phase 1 Integration Tests Finished: ${passed}/${passed + failed}`)
  console.log(`======================================================\n`)

  if (failed > 0) process.exit(1)
}

runIntegrationTests().catch((err) => {
  console.error('Integration test runner exception:', err)
  process.exit(1)
})
