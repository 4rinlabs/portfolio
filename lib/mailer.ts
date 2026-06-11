import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export type ContactEmailPayload = {
  name: string
  email: string
  phone: string
  company?: string
  message: string
}

export async function sendContactNotification(payload: ContactEmailPayload) {
  const to = process.env.CONTACT_NOTIFY_EMAIL ?? '4rinlabs@gmail.com'
  const from = process.env.SMTP_FROM ?? '4RinLabs <noreply@4rinlabs.com>'

  await transporter.sendMail({
    from,
    to,
    subject: `New Contact Inquiry from ${payload.name}`,
    text: `
New contact form submission from 4RinLabs website.

Name: ${payload.name}
Email: ${payload.email}
Phone: ${payload.phone}
Company: ${payload.company || 'Not provided'}
Message:
${payload.message}
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head><style>body{font-family:sans-serif;color:#0a0a0a;background:#f5f5f5}
.container{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e0e0e0}
.label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.2em;color:#888;margin-bottom:4px}
.value{font-size:15px;margin-bottom:20px;color:#0a0a0a}
.message-box{background:#f5f5f5;border-radius:8px;padding:16px;font-size:14px;line-height:1.6;white-space:pre-wrap}
.accent{color:#5fd400}
</style></head>
<body>
<div class="container">
  <h2 style="margin-top:0">New Contact Inquiry <span class="accent">→</span></h2>
  <div class="label">Name</div><div class="value">${payload.name}</div>
  <div class="label">Email</div><div class="value"><a href="mailto:${payload.email}">${payload.email}</a></div>
  <div class="label">Phone</div><div class="value">${payload.phone}</div>
  ${payload.company ? `<div class="label">Company</div><div class="value">${payload.company}</div>` : ''}
  <div class="label">Message</div>
  <div class="message-box">${payload.message.replace(/\n/g, '<br>')}</div>
</div>
</body>
</html>
    `.trim(),
  })
}
