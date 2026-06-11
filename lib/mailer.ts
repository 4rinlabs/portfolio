// import nodemailer from 'nodemailer'

// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST,
//   port: Number(process.env.SMTP_PORT ?? 587),
//   secure: process.env.SMTP_PORT === '465',
//   auth: {
//     user: process.env.SMTP_USER,
//     pass: process.env.SMTP_PASS,
//   },
// })

// export type ContactEmailPayload = {
//   name: string
//   email: string
//   phone: string
//   company?: string
//   message: string
// }

// export async function sendContactNotification(payload: ContactEmailPayload) {
//   const to = process.env.CONTACT_NOTIFY_EMAIL ?? '4rinlabs@gmail.com'
//   const from = process.env.SMTP_FROM ?? '4RinLabs <noreply@4rinlabs.com>'

//   await transporter.sendMail({
//     from,
//     to,
//     subject: `New Contact Inquiry from ${payload.name}`,
//     text: `
// New contact form submission from 4RinLabs website.

// Name: ${payload.name}
// Email: ${payload.email}
// Phone: ${payload.phone}
// Company: ${payload.company || 'Not provided'}
// Message:
// ${payload.message}
//     `.trim(),
//     html: `
// <!DOCTYPE html>
// <html>
// <head><style>body{font-family:sans-serif;color:#0a0a0a;background:#f5f5f5}
// .container{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e0e0e0}
// .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.2em;color:#888;margin-bottom:4px}
// .value{font-size:15px;margin-bottom:20px;color:#0a0a0a}
// .message-box{background:#f5f5f5;border-radius:8px;padding:16px;font-size:14px;line-height:1.6;white-space:pre-wrap}
// .accent{color:#5fd400}
// </style></head>
// <body>
// <div class="container">
//   <h2 style="margin-top:0">New Contact Inquiry <span class="accent">→</span></h2>
//   <div class="label">Name</div><div class="value">${payload.name}</div>
//   <div class="label">Email</div><div class="value"><a href="mailto:${payload.email}">${payload.email}</a></div>
//   <div class="label">Phone</div><div class="value">${payload.phone}</div>
//   ${payload.company ? `<div class="label">Company</div><div class="value">${payload.company}</div>` : ''}
//   <div class="label">Message</div>
//   <div class="message-box">${payload.message.replace(/\n/g, '<br>')}</div>
// </div>
// </body>
// </html>
//     `.trim(),
//   })
// }
// import { resend } from '@/lib/resend'

// export type ContactEmailPayload = {
//   name: string
//   email: string
//   phone: string
//   company?: string
//   message: string
// }

// export async function sendContactNotification(
//   payload: ContactEmailPayload,
// ) {
//   await resend.emails.send({
//     from: '4RinLabs <onboarding@resend.dev>',
//     to: process.env.CONTACT_NOTIFY_EMAIL ?? '4rinlabs@gmail.com',
//     subject: `New Contact Inquiry from ${payload.name}`,
//     html: `
//       <h2>New Contact Inquiry</h2>

//       <p><strong>Name:</strong> ${payload.name}</p>
//       <p><strong>Email:</strong> ${payload.email}</p>
//       <p><strong>Phone:</strong> ${payload.phone}</p>
//       <p><strong>Company:</strong> ${payload.company || 'Not provided'}</p>

//       <p><strong>Message:</strong></p>
//       <p>${payload.message.replace(/\n/g, '<br>')}</p>
//     `,
//   })
// }

import { resend } from '@/lib/resend'

export type ContactEmailPayload = {
  name: string
  email: string
  phone: string
  company?: string
  message: string
}

export async function sendContactNotification(
  payload: ContactEmailPayload,
) {
  const from =
    process.env.EMAIL_FROM ??
    '4RinLabs <hello@4rinlabs.com>'

  const notifyEmail =
    process.env.CONTACT_NOTIFY_EMAIL ??
    '4rinlabs@gmail.com'

  // ==========================
  // EMAIL TO 4RINLABS
  // ==========================

  await resend.emails.send({
    from,
    to: notifyEmail,
    replyTo: payload.email,
    subject: `New Contact Inquiry from ${payload.name}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:24px;">
        <div style="max-width:600px;margin:auto;background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e5e5;">
          <h2 style="margin-top:0;">New Contact Inquiry</h2>

          <p><strong>Name:</strong> ${payload.name}</p>
          <p><strong>Email:</strong> ${payload.email}</p>
          <p><strong>Phone:</strong> ${payload.phone}</p>
          <p><strong>Company:</strong> ${payload.company || 'Not provided'}</p>

          <p><strong>Message:</strong></p>

          <div style="background:#f7f7f7;padding:16px;border-radius:8px;">
            ${payload.message.replace(/\n/g, '<br>')}
          </div>
        </div>
      </body>
      </html>
    `,
  })

  // ==========================
  // AUTO REPLY TO CUSTOMER
  // ==========================

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
          body {
            font-family: Arial, sans-serif;
            background: #f5f5f5;
            color: #111;
            margin: 0;
            padding: 30px 0;
          }

          .container {
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            padding: 32px;
            border: 1px solid #e5e5e5;
          }

          .logo {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 12px;
          }

          .tagline {
            color: #666;
            margin-bottom: 28px;
          }

          .accent {
            color: #5fd400;
          }

          p {
            line-height: 1.7;
          }

          .button {
            display: inline-block;
            background: #5fd400;
            color: #000 !important;
            text-decoration: none;
            padding: 12px 22px;
            border-radius: 8px;
            font-weight: 600;
            margin-top: 16px;
          }

          .footer {
            margin-top: 36px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 13px;
          }
        </style>
      </head>

      <body>
        <div class="container">

          <div class="logo">
            4RinLabs <span class="accent">→</span>
          </div>

          <div class="tagline">
            AI Development • SaaS • Custom Software
          </div>

          <h2>Thank You for Contacting Us</h2>

          <p>Hi ${payload.name},</p>

          <p>
            Thank you for reaching out to 4RinLabs.
            We have successfully received your inquiry and our team will review it shortly.
          </p>

          <p>
            If you need any assistance, have additional information to share,
            or would like to discuss your project requirements further,
            simply reply to this email.
          </p>

          <p>
            We specialize in:
          </p>

          <ul>
            <li>AI Development</li>
            <li>Custom Software Development</li>
            <li>SaaS Platforms</li>
            <li>Web Development</li>
            <li>Mobile App Development</li>
            <li>Business Automation</li>
          </ul>

          <a
            href="https://www.4rinlabs.com"
            class="button"
          >
            Visit Our Website
          </a>

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
}