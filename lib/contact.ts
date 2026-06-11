export type ContactFormErrors = {
  name?: string
  email?: string
  phone?: string
  message?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+]?[\d\s().-]{7,20}$/

export function validateContactForm(
  name: string,
  email: string,
  phone: string,
  message: string,
): ContactFormErrors {
  const errors: ContactFormErrors = {}
  const n = name.trim()
  const e = email.trim()
  const p = phone.trim()
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

  if (!p) {
    errors.phone = 'Contact number is required.'
  } else if (!PHONE_RE.test(p)) {
    errors.phone = 'Enter a valid contact number.'
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
