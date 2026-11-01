'use server'

import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { sendContactNotification } from '@/lib/mailer'
import { ContactSchema } from '@/lib/schemas'
import { getClientIp, checkContactRateLimit, checkPreVerificationRateLimit } from '@/lib/ratelimit'
import { verifyTurnstileToken } from '@/lib/turnstile'

export type ContactActionState = {
  success: boolean
  message: string
  errors?: Record<string, string[]>
}

export async function submitContact(
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  // ─── 1. Passive Honeypot Verification ──────────────────────────────────────
  // If the hidden honeypot field contains any value, it's an automated bot.
  // Silently drop without touching the database or triggering email delivery.
  const honeypot = formData.get('b_website_url') as string | null
  if (honeypot && honeypot.trim().length > 0) {
    console.info('Honeypot triggered on contact form submission. Dropping request silently.')
    return {
      success: true,
      message: "Message received! We'll get back to you soon.",
    }
  }

  // ─── 2. Client IP Resolution ────────────────────────────────────────────────
  let headersList: Headers
  try {
    headersList = await headers()
  } catch {
    headersList = new Headers()
  }
  const clientIp = getClientIp(headersList)

  // ─── 3. Preliminary IP Rate Limit (Outbound Siteverify Flood Protection) ────
  // Enforces an atomic pre-verification limit on client IP BEFORE initiating any network calls.
  // Protects against DoS attacks sending arbitrary fake tokens. Fails closed on Redis outage.
  const preCheckResult = await checkPreVerificationRateLimit(clientIp)
  if (!preCheckResult.success) {
    return {
      success: false,
      message: preCheckResult.message || 'Service temporarily unavailable. Please try again in a few minutes.',
    }
  }

  // ─── 4. Inexpensive Input Extraction & Schema Validation ────────────────────
  // Validates field syntax, lengths, and email format in-memory before any outbound network call.
  // Invalid user input is rejected immediately without triggering Cloudflare Siteverify.
  const raw = {
    name: (formData.get('name') as string)?.trim() ?? '',
    email: (formData.get('email') as string)?.trim() ?? '',
    phone: (formData.get('phone') as string)?.trim() ?? '',
    company: ((formData.get('company') as string)?.trim()) || undefined,
    message: (formData.get('message') as string)?.trim() ?? '',
  }

  const parsed = ContactSchema.safeParse(raw)

  if (!parsed.success) {
    return {
      success: false,
      message: 'Please fix the highlighted fields.',
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  // ─── 5. Cloudflare Turnstile Server-Side Verification ───────────────────────
  const turnstileToken = formData.get('cf-turnstile-response') as string | null
  const turnstileResult = await verifyTurnstileToken({
    token: turnstileToken,
    clientIp,
    expectedAction: 'contact_form',
  })

  if (!turnstileResult.success) {
    return {
      success: false,
      message: turnstileResult.message || 'Security check failed. Please refresh and try again.',
    }
  }

  // ─── 6. Atomic Distributed Rate Limiting (Submission Allowance) ────────────
  const rateLimitResult = await checkContactRateLimit(clientIp, parsed.data.email)
  if (!rateLimitResult.success) {
    return {
      success: false,
      message: rateLimitResult.message || 'Too many submissions. Please wait a few minutes before trying again.',
    }
  }

  // ─── 7. Database Storage (Lead Preservation) ───────────────────────────────
  let createdLead: { id: string } | null = null
  try {
    createdLead = await prisma.contactLead.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        company: parsed.data.company,
        message: parsed.data.message,
      },
      select: { id: true },
    })
  } catch (dbErr) {
    console.error('Contact lead database insertion failed:', dbErr)
    return {
      success: false,
      message: 'Unable to submit your inquiry at this time. Please try again or reach out directly to 4rinlabs@gmail.com.',
    }
  }

  // ─── 8. Resilient Email Dispatch ───────────────────────────────────────────
  // Note: Even if email delivery fails or times out, the customer inquiry is already
  // safely committed to the database above and will not be lost.
  try {
    await sendContactNotification(
      {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        company: parsed.data.company,
        message: parsed.data.message,
        leadId: createdLead?.id,
      },
      { redisAvailable: rateLimitResult.redisAvailable },
    )
  } catch (emailErr) {
    console.error('Email dispatch encountered an unhandled error (lead preserved):', emailErr)
  }

  return {
    success: true,
    message: "Message received! We'll get back to you soon.",
  }
}
