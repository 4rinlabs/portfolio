'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useActionState, useEffect, useRef } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { BsInstagram, BsLinkedin, BsWhatsapp } from 'react-icons/bs'
import { MagneticButton } from './MagneticButton'
import { submitContact, type ContactActionState } from '@/actions/contact'

const social = [
  { href: 'https://wa.me/919961386952', label: 'WhatsApp', Icon: BsWhatsapp },
  {
    href: 'https://www.instagram.com/4rinlabs?igsh=aDA0ZmFkMjVmd3A5',
    label: 'Instagram',
    Icon: BsInstagram,
  },
  { href: 'https://www.linkedin.com/in/4rinlabs/', label: 'LinkedIn', Icon: BsLinkedin },
] as const

const inputClass = (hasError: boolean) =>
  `w-full rounded-xl border bg-white/[0.04] px-4 py-3 font-sans text-sm text-white outline-none transition placeholder:text-white/35 focus:shadow-[0_0_0_3px_rgba(127,255,0,0.12)] ${
    hasError
      ? 'border-red-400/60 focus:border-red-400/70'
      : 'border-white/12 focus:border-lime/55'
  }`

const initialState: ContactActionState = { success: false, message: '' }

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
  const [state, formAction, isPending] = useActionState(submitContact, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset()
    }
  }, [state.success])

  return (
    <section id="contact" className="scroll-mt-24 bg-charcoal py-24 text-white md:py-32">
      <div className="site-container">
        <div className="grid gap-14 lg:grid-cols-[1fr_300px] xl:grid-cols-[1.15fr_280px] xl:gap-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] as const }}
          >
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.35em] text-lime/70">
              Start a project
            </p>
            <h2 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-tight md:text-5xl">
              <span className="glitch-heading glitch-tone-light text-white" data-text="CONTACT">
                CONTACT
              </span>
            </h2>
            <p className="mt-4 max-w-lg font-sans text-base leading-relaxed text-white/65 md:text-lg">
              Tell us about your goals, timeline, and links. We reply with a concise plan and next
              steps.
            </p>

            <div className="mt-10 max-w-lg">
              <AnimatePresence mode="wait">
                {state.success ? (
                  <ContactSuccessState />
                ) : (
                  <motion.form
                    key="form"
                    ref={formRef}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                    action={formAction}
                    className="grid gap-4"
                    noValidate
                  >
                    <AnimatePresence mode="wait">
                      {!state.success && state.message && (
                        <motion.div
                          key="error"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          role="alert"
                          className="rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-3 font-sans text-sm text-red-200"
                        >
                          {state.message}
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
                        autoComplete="name"
                        placeholder="Name"
                        disabled={isPending}
                        aria-invalid={Boolean(state.errors?.name)}
                        aria-describedby={state.errors?.name ? 'c-name-error' : undefined}
                        className={inputClass(Boolean(state.errors?.name))}
                      />
                      {state.errors?.name && (
                        <p id="c-name-error" className="mt-1.5 font-sans text-xs text-red-300">
                          {state.errors.name[0]}
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
                        autoComplete="email"
                        placeholder="Email"
                        disabled={isPending}
                        aria-invalid={Boolean(state.errors?.email)}
                        aria-describedby={state.errors?.email ? 'c-email-error' : undefined}
                        className={inputClass(Boolean(state.errors?.email))}
                      />
                      {state.errors?.email && (
                        <p id="c-email-error" className="mt-1.5 font-sans text-xs text-red-300">
                          {state.errors.email[0]}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="sr-only" htmlFor="c-phone">
                        Contact Number
                      </label>
                      <input
                        id="c-phone"
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="Contact Number"
                        disabled={isPending}
                        aria-invalid={Boolean(state.errors?.phone)}
                        aria-describedby={state.errors?.phone ? 'c-phone-error' : undefined}
                        className={inputClass(Boolean(state.errors?.phone))}
                      />
                      {state.errors?.phone && (
                        <p id="c-phone-error" className="mt-1.5 font-sans text-xs text-red-300">
                          {state.errors.phone[0]}
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
                        placeholder="Description / Message"
                        disabled={isPending}
                        aria-invalid={Boolean(state.errors?.message)}
                        aria-describedby={state.errors?.message ? 'c-message-error' : undefined}
                        className={`min-h-[140px] resize-y ${inputClass(Boolean(state.errors?.message))}`}
                      />
                      {state.errors?.message && (
                        <p id="c-message-error" className="mt-1.5 font-sans text-xs text-red-300">
                          {state.errors.message[0]}
                        </p>
                      )}
                    </div>

                    <MagneticButton
                      type="submit"
                      disabled={isPending}
                      className="btn-lime-primary btn-glitch flex w-fit items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending ? (
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
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.35em] text-lime/70">
              Connect
            </p>
            {social.map(({ href, label, Icon }) => (
              <motion.a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ x: 4 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="btn-glitch group flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3.5 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors duration-300 hover:border-lime/50 hover:bg-white/[0.06] hover:shadow-lime-glow"
              >
                <Icon
                  className="size-5 shrink-0 text-lime transition-transform duration-300 group-hover:scale-110"
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
