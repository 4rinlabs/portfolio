import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQ = [
  {
    q: 'What services does 4RinLabs offer?',
    a: 'We build static and dynamic websites, portfolio and e-commerce experiences, landing pages, and custom web applications — from discovery through launch and iteration.',
  },
  {
    q: 'How long does a project take?',
    a: 'Timelines depend on scope and integrations. A focused marketing site may ship in 2–4 weeks; larger products typically run 6–12 weeks with clear milestones.',
  },
  {
    q: 'Do you offer custom designs?',
    a: 'Yes. Every engagement is tailored — layout systems, typography, motion, and components are designed around your brand rather than generic templates.',
  },
  {
    q: 'Can I request revisions?',
    a: 'Collaboration is core to how we work. We structure feedback rounds so revisions stay efficient and the final build matches your expectations.',
  },
  {
    q: 'How can I contact your team?',
    a: 'Use the contact form on this page or reach out via WhatsApp, Instagram, or LinkedIn. We respond quickly with next steps and availability.',
  },
] as const

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="section-alt scroll-mt-24 py-24 md:py-32">
      <div className="site-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] as const }}
          className="max-w-2xl"
        >
          <p className="section-label">Answers</p>
          <h2 className="section-title mt-3">
            <span className="glitch-heading" data-text="FAQ">
              FAQ
            </span>
          </h2>
          <p className="section-body mt-4">Straightforward details on how we collaborate and deliver.</p>
        </motion.div>

        <div className="mx-auto mt-14 w-full max-w-3xl space-y-3 lg:max-w-4xl xl:max-w-5xl">
          {FAQ.map((item, idx) => {
            const isOpen = open === idx
            return (
              <motion.div
                key={item.q}
                layout
                className={`faq-item overflow-hidden rounded-xl border transition-colors duration-300 ${isOpen ? 'faq-item--open' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : idx)}
                  className="faq-trigger flex w-full items-center justify-between gap-4 px-5 py-4 text-left md:px-6 md:py-5"
                >
                  <span className="faq-question font-display text-sm font-semibold uppercase tracking-tight md:text-base">
                    {item.q}
                  </span>
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="shrink-0 text-lime"
                  >
                    <ChevronDown size={20} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="faq-answer border-t px-5 pb-5 pt-4 font-sans text-sm leading-relaxed md:px-6">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
