import { resend } from '@/lib/resend'
import { redis } from '@/lib/ratelimit'
import crypto from 'crypto'

export type ContactEmailPayload = {
  name: string
  email: string
  phone: string
  company?: string
  message: string
  leadId?: string
}

export type EmailDeliveryResult = {
  adminNotificationSent: boolean
  customerAutoReplySent: boolean
  suppressedReason?: string
}

/**
 * Context-appropriate HTML entity escaping.
 * Converts dangerous characters into safe HTML entities to prevent HTML injection in emails.
 */
export function escapeHtml(str: string): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\//g, '&#x2F;')
}

/**
 * Safely formats user-supplied multiline text: escapes HTML entities first,
 * then converts line breaks into <br /> tags.
 */
export function formatSafeMessage(message: string): string {
  const safe = escapeHtml(message)
  return safe.replace(/(?:\r\n|\r|\n)/g, '<br />')
}

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

/**
 * Sends inquiry notifications with strict auto-reply throttling, HTML escaping,
 * and resilient failure isolation.
 */
export async function sendContactNotification(
  payload: ContactEmailPayload,
  options?: { redisAvailable?: boolean },
): Promise<EmailDeliveryResult> {
  const from = process.env.EMAIL_FROM ?? '4RinLabs <hello@4rinlabs.com>'
  const notifyEmail = process.env.CONTACT_NOTIFY_EMAIL ?? '4rinlabs@gmail.com'
  const isRedisAvailable = options?.redisAvailable !== false && Boolean(redis)

  const safeName = escapeHtml(payload.name)
  const safeEmail = escapeHtml(payload.email)
  const safePhone = escapeHtml(payload.phone)
  const safeCompany = payload.company ? escapeHtml(payload.company) : 'Not provided'
  const safeMessageHtml = formatSafeMessage(payload.message)

  let adminSent = false
  let customerSent = false
  let suppressionReason: string | undefined

  // ==========================================
  // 1. ADMIN NOTIFICATION (To 4RinLabs Inbox)
  // ==========================================
  // Every valid submission saved in PostgreSQL triggers an admin notification attempt.
  // There is NO suppression lock based on visitor email for internal admin alerts,
  // ensuring multiple legitimate inquiries/corrections from the same client are delivered.
  // Rate limiting (3/15m) and Turnstile already protect against inbound floods.
  try {
    const safeLeadId = payload.leadId ? escapeHtml(payload.leadId) : undefined
    const subjectPrefix = safeLeadId ? `[Lead #${safeLeadId.slice(-6)}] ` : ''

    await resend.emails.send({
      from,
      to: notifyEmail,
      replyTo: payload.email,
      subject: `${subjectPrefix}New Contact Inquiry from ${safeName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:24px;">
          <div style="max-width:600px;margin:auto;background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e5e5;">
            <h2 style="margin-top:0;color:#111;">New Contact Inquiry</h2>
            ${safeLeadId ? `<p style="font-size:12px;color:#666;"><strong>Database Reference ID:</strong> <code>${safeLeadId}</code></p>` : ''}
            <p><strong>Name:</strong> ${safeName}</p>
            <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
            <p><strong>Phone:</strong> ${safePhone}</p>
            <p><strong>Company:</strong> ${safeCompany}</p>
            <p><strong>Message:</strong></p>
            <div style="background:#f7f7f7;padding:16px;border-radius:8px;line-height:1.6;color:#222;">
              ${safeMessageHtml}
            </div>
            <p style="font-size:12px;color:#888;margin-top:24px;">
              View all inquiries in the <a href="https://www.4rinlabs.com/admin/leads">Admin Dashboard</a>.
            </p>
          </div>
        </body>
        </html>
      `,
    })
    adminSent = true
  } catch (adminEmailErr) {
    // Note: Do not automatically retry on ambiguous timeouts.
    // The lead is already preserved in PostgreSQL and visible in the Admin Dashboard.
    console.error(`Failed to dispatch admin notification email for lead ${payload.leadId ?? 'unknown'}:`, adminEmailErr)
  }

  // ==========================================
  // 2. CUSTOMER AUTO-REPLY (Idempotent & Protected)
  // ==========================================
  // Rule A: If Redis is unavailable, suppress auto-replies to eliminate unmetered relay risk.
  if (!isRedisAvailable || !redis) {
    suppressionReason = 'Suppressed: Distributed rate limiter unavailable; auto-reply disabled to prevent relay abuse.'
    console.warn(suppressionReason)
    return { adminNotificationSent: adminSent, customerAutoReplySent: false, suppressedReason: suppressionReason }
  }

  const emailHash = hashEmail(payload.email)
  const autoReplyLockKey = `autoreply:lock:${emailHash}`
  const TWO_HOURS_SECONDS = 7200

  // Rule B: Acquire atomic lock for 2 hours.
  // If key exists, customer received an auto-reply within 2 hours -> SUPPRESS.
  try {
    const lockAcquired = await redis.set(autoReplyLockKey, 'locked', {
      nx: true,
      ex: TWO_HOURS_SECONDS,
    })

    if (!lockAcquired) {
      suppressionReason = 'Suppressed: An auto-reply was already dispatched to this recipient within the cooling window.'
      console.info(suppressionReason)
      return { adminNotificationSent: adminSent, customerAutoReplySent: false, suppressedReason: suppressionReason }
    }

    // Rule C: Dispatch customer auto-reply with atomic lock held.
    try {
      await resend.emails.send({
        from,
        to: payload.email,
        replyTo: notifyEmail,
        subject: 'Thank You for Contacting 4RinLabs',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background: #f5f5f5; color: #111; margin: 0; padding: 30px 0; }
              .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e5e5; }
              .logo { font-size: 28px; font-weight: 700; margin-bottom: 12px; }
              .tagline { color: #666; margin-bottom: 28px; }
              .accent { color: #5fd400; }
              p { line-height: 1.7; }
              .button { display: inline-block; background: #5fd400; color: #000 !important; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 600; margin-top: 16px; }
              .footer { margin-top: 36px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 13px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo">4RinLabs <span class="accent">→</span></div>
              <div class="tagline">AI Development • SaaS • Custom Software</div>
              <h2>Thank You for Contacting Us</h2>
              <p>Hi ${safeName},</p>
              <p>
                Thank you for reaching out to 4RinLabs.
                We have successfully received your inquiry and our team will review it shortly.
              </p>
              <p>
                If you need any assistance or have additional information to share, simply reply to this email.
              </p>
              <a href="https://www.4rinlabs.com" class="button">Visit Our Website</a>
              <div class="footer">
                <strong>4RinLabs</strong><br/>
                Building AI Solutions, SaaS Platforms and Custom Software.<br/><br/>
                🌐 https://www.4rinlabs.com<br/>
                📧 hello@4rinlabs.com
              </div>
            </div>
          </body>
          </html>
        `,
      })
      customerSent = true
    } catch (resendErr) {
      // Rule D: DO NOT release the lock upon timeout or uncertain outcome!
      // In serverless environments, an HTTP timeout does not mean Resend did not queue or send the message.
      // Retaining the lock ensures concurrent submissions or retries cannot flood the recipient.
      console.error('Customer auto-reply dispatch threw an error or timed out (lock retained):', resendErr)
    }
  } catch (redisLockErr) {
    console.error('Failed to acquire auto-reply Redis lock:', redisLockErr)
  }

  return {
    adminNotificationSent: adminSent,
    customerAutoReplySent: customerSent,
    suppressedReason: suppressionReason,
  }
}
