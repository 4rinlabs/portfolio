export type ContactFormPayload = {
  name: string
  email: string
  contact: string
  message: string
  timestamp: string
}

export type ContactFormErrors = {
  name?: string
  email?: string
  contact?: string
  message?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+]?[\d\s().-]{7,20}$/

export function validateContactForm(
  name: string,
  email: string,
  contact: string,
  message: string,
): ContactFormErrors {
  const errors: ContactFormErrors = {}
  const n = name.trim()
  const e = email.trim()
  const c = contact.trim()
  const m = message.trim()

  if (!n) {
    errors.name = 'Name is required.'
  } else if (n.length < 2) {
    errors.name = 'Name must be at least 2 characters.'
  } else if (n.length > 100) {
    errors.name = 'Name must be 100 characters or fewer.'
  }

  if (!e) {
    errors.email = 'Email is required.'
  } else if (!EMAIL_RE.test(e)) {
    errors.email = 'Enter a valid email address.'
  } else if (e.length > 254) {
    errors.email = 'Email must be 254 characters or fewer.'
  }

  if (!c) {
    errors.contact = 'Contact number is required.'
  } else if (!PHONE_RE.test(c)) {
    errors.contact = 'Enter a valid contact number.'
  }

  if (!m) {
    errors.message = 'Message is required.'
  } else if (m.length < 10) {
    errors.message = 'Message must be at least 10 characters.'
  } else if (m.length > 5000) {
    errors.message = 'Message must be 5000 characters or fewer.'
  }

  return errors
}

export function hasValidationErrors(errors: ContactFormErrors): boolean {
  return Object.keys(errors).length > 0
}

type SubmitResult = { ok: true } | { ok: false; message: string }

/** Builds the exact payload shape expected by google-apps-script/ContactForm.gs */
export function buildContactPayload(
  name: string,
  email: string,
  contact: string,
  message: string,
): ContactFormPayload {
  return {
    name: name.trim(),
    email: email.trim(),
    contact: contact.trim(),
    message: message.trim(),
    timestamp: new Date().toISOString(),
  }
}

export async function submitContactForm(
  name: string,
  email: string,
  contact: string,
  message: string,
): Promise<SubmitResult> {
  const scriptUrl = import.meta.env.VITE_GOOGLE_SCRIPT_URL?.trim()

  if (!scriptUrl) {
    return {
      ok: false,
      message:
        'Form is not configured yet. Run: npm run setup:contact — then restart npm run dev.',
    }
  }

  const payload = buildContactPayload(name, email, contact, message)

  try {
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        contact: payload.contact,
        message: payload.message,
        timestamp: payload.timestamp,
      }),
    })

    const text = await response.text()
    let data: { ok?: boolean; error?: string; message?: string } = {}

    try {
      data = text ? (JSON.parse(text) as typeof data) : {}
    } catch {
      if (!response.ok) {
        return { ok: false, message: 'Submission failed. Please try again.' }
      }
    }

    if (!response.ok || data.ok === false) {
      return {
        ok: false,
        message: data.error || data.message || 'Submission failed. Please try again.',
      }
    }

    return { ok: true }
  } catch {
    return {
      ok: false,
      message: 'Network error. Check your connection and try again.',
    }
  }
}
