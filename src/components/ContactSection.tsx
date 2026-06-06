import { motion, AnimatePresence } from 'framer-motion'
import { type FormEvent, useState } from 'react'
import { BriefcaseBusiness, Camera, CheckCircle2, Loader2, MessageCircle } from 'lucide-react'
import { MagneticButton } from './MagneticButton'
import {
  hasValidationErrors,
  submitContactForm,
  validateContactForm,
  type ContactFormErrors,
} from '../lib/contactForm'

const social = [
  { href: 'https://wa.me/918129386952', label: 'WhatsApp', icon: MessageCircle },
  {
    href: 'https://www.instagram.com/4rinlabs?igsh=aDA0ZmFkMjVmd3A5',
    label: 'Instagram',
    icon: Camera,
  },
  { href: 'https://www.linkedin.com/in/4rinlabs/', label: 'LinkedIn', icon: BriefcaseBusiness },
] as const

const inputClass = (hasError: boolean) =>
  `w-full rounded-xl border bg-white/[0.04] px-4 py-3 font-sans text-sm text-white outline-none transition placeholder:text-white/35 focus:shadow-[0_0_0_3px_rgba(127,255,0,0.12)] ${
    hasError
      ? 'border-red-400/60 focus:border-red-400/70'
      : 'border-white/12 focus:border-lime/55'
  }`

function ContactSuccessState() {
  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.98, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-[420px] w-full max-w-lg flex-col items-center justify-center rounded-2xl border border-lime/35 bg-charcoal/80 px-8 py-14 text-center shadow-[0_0_0_1px_rgba(127,255,0,0.2),0_24px_64px_rgba(0,0,0,0.15)] backdrop-blur-md md:min-h-[480px] md:px-12"
      role="status"
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-lime/40 bg-lime/15 shadow-lime-glow"
      >
        <CheckCircle2 size={32} className="text-lime" strokeWidth={1.5} aria-hidden />
      </motion.div>
      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.35em] text-lime/80">
        Message received
      </p>
      <h3 className="mt-4 font-display text-2xl font-bold uppercase tracking-tight text-white md:text-3xl">
        Thank you
      </h3>
      <p className="mt-4 max-w-sm font-sans text-base leading-relaxed text-white/70 md:text-lg">
        Your inquiry was sent successfully. We&apos;ll review your details and get back to you soon.
      </p>
    </motion.div>
  )
}

export function ContactSection() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')

  const [errors, setErrors] = useState<ContactFormErrors>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState('')

  const clearError = (field: keyof ContactFormErrors) => {
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
    if (status === 'error') {
      setStatus('idle')
      setStatusMessage('')
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setStatusMessage('')

    const validationErrors = validateContactForm(name, email, contact, message)
    setErrors(validationErrors)

    if (hasValidationErrors(validationErrors)) {
      setStatus('error')
      setStatusMessage('Please fix the highlighted fields.')
      return
    }

    setStatus('loading')

    const result = await submitContactForm(name, email, contact, message)

    if (result.ok) {
      setStatus('success')
      return
    }

    setStatus('error')
    setStatusMessage(result.message)
  }

  return (
    <section id="contact" className="scroll-mt-24 bg-charcoal py-24 text-white md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="grid gap-14 lg:grid-cols-[1fr_280px] lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] as const }}
          >
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.35em] text-lime/70">Start a project</p>
            <h2 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-tight md:text-5xl">
              <span className="glitch-heading glitch-tone-light text-white" data-text="CONTACT">
                CONTACT
              </span>
            </h2>
            <p className="mt-4 max-w-lg font-sans text-base leading-relaxed text-white/65 md:text-lg">
              Tell us about your goals, timeline, and links. We reply with a concise plan and next steps.
            </p>

            <div className="mt-10 max-w-lg">
              <AnimatePresence mode="wait">
                {status === 'success' ? (
                  <ContactSuccessState />
                ) : (
                  <motion.form
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                    onSubmit={onSubmit}
                    className="grid gap-4"
                    noValidate
                  >
                    <AnimatePresence mode="wait">
                      {status === 'error' && statusMessage && (
                        <motion.div
                          key="error"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          role="alert"
                          className="rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-3 font-sans text-sm text-red-200"
                        >
                          {statusMessage}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div>
                      <label className="sr-only" htmlFor="c-name">
                        Name
                      </label>
                      <input
                        id="c-name"
                        name="name"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value)
                          clearError('name')
                        }}
                        autoComplete="name"
                        placeholder="Name"
                        disabled={status === 'loading'}
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={errors.name ? 'c-name-error' : undefined}
                        className={inputClass(Boolean(errors.name))}
                      />
                      {errors.name && (
                        <p id="c-name-error" className="mt-1.5 font-sans text-xs text-red-300">
                          {errors.name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="sr-only" htmlFor="c-email">
                        Email
                      </label>
                      <input
                        id="c-email"
                        name="email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value)
                          clearError('email')
                        }}
                        autoComplete="email"
                        placeholder="Email"
                        disabled={status === 'loading'}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? 'c-email-error' : undefined}
                        className={inputClass(Boolean(errors.email))}
                      />
                      {errors.email && (
                        <p id="c-email-error" className="mt-1.5 font-sans text-xs text-red-300">
                          {errors.email}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="sr-only" htmlFor="c-contact">
                        Contact Number
                      </label>
                      <input
                        id="c-contact"
                        name="contact"
                        type="tel"
                        value={contact}
                        onChange={(e) => {
                          setContact(e.target.value)
                          clearError('contact')
                        }}
                        autoComplete="tel"
                        placeholder="Contact Number"
                        disabled={status === 'loading'}
                        aria-invalid={Boolean(errors.contact)}
                        aria-describedby={errors.contact ? 'c-contact-error' : undefined}
                        className={inputClass(Boolean(errors.contact))}
                      />
                      {errors.contact && (
                        <p id="c-contact-error" className="mt-1.5 font-sans text-xs text-red-300">
                          {errors.contact}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="sr-only" htmlFor="c-message">
                        Message
                      </label>
                      <textarea
                        id="c-message"
                        name="message"
                        rows={5}
                        value={message}
                        onChange={(e) => {
                          setMessage(e.target.value)
                          clearError('message')
                        }}
                        placeholder="Description / Message"
                        disabled={status === 'loading'}
                        aria-invalid={Boolean(errors.message)}
                        aria-describedby={errors.message ? 'c-message-error' : undefined}
                        className={`min-h-[140px] resize-y ${inputClass(Boolean(errors.message))}`}
                      />
                      {errors.message && (
                        <p id="c-message-error" className="mt-1.5 font-sans text-xs text-red-300">
                          {errors.message}
                        </p>
                      )}
                    </div>

                    <MagneticButton
                      type="submit"
                      disabled={status === 'loading'}
                      className="btn-lime-primary glitch-btn flex w-fit items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {status === 'loading' ? (
                        <>
                          <Loader2 size={16} className="animate-spin" aria-hidden />
                          Sending…
                        </>
                      ) : (
                        'Submit'
                      )}
                    </MagneticButton>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] as const }}
            className="flex flex-col gap-3"
          >
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.35em] text-lime/70">Connect</p>
            {social.map(({ href, label, icon: Icon }) => (
              <motion.a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ x: 4 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="btn-glitch flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3.5 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors duration-300 hover:border-lime/50 hover:bg-white/[0.06] hover:shadow-lime-glow"
              >
                <Icon
                  size={20}
                  className="shrink-0 text-lime transition-transform duration-300 group-hover:scale-110"
                  aria-hidden
                />
                {label}
              </motion.a>
            ))}
          </motion.aside>
        </div>
      </div>
    </section>
  )
}
