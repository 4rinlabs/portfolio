'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

interface Service {
  id: string
  name: string
  slug: string
  shortDescription: string
}

interface ServicesSectionClientProps {
  services: Service[]
}

const cardVariants = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.06,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
}

export function ServicesSectionClient({
  services,
}: ServicesSectionClientProps) {
  return (
    <section
      id="services"
      className="section-alt scroll-mt-24 py-24 md:py-32"
    >
      <div className="site-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{
            duration: 0.55,
            ease: [0.22, 1, 0.36, 1] as const,
          }}
          className="max-w-2xl"
        >
          <p className="section-label">Capabilities</p>

          <h2 className="section-title mt-3">
            <span className="glitch-heading" data-text="SERVICES">
              SERVICES
            </span>
          </h2>

          <p className="section-body mt-4">
            End-to-end execution — from AI systems and SaaS platforms to custom
            software, web applications, mobile apps, and intelligent automation.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => {
            const dark = i % 2 === 1

            return (
              <Link
                key={s.id}
                href={`/services/${s.slug}`}
                className="block"
              >
                <motion.div
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: '-40px' }}
                  className={`service-card group relative h-full overflow-hidden rounded-2xl border p-7 transition-all duration-300 ${
                    dark ? 'service-card--invert' : ''
                  } hover:border-lime/40 hover:shadow-lime-glow`}
                >
                  <div
                    className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-lime/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                    aria-hidden
                  />

                  <h3 className="font-display text-xl font-bold uppercase tracking-tight">
                    <span
                      className="service-title-glitch"
                      data-text={s.name}
                    >
                      {s.name}
                    </span>
                  </h3>

                  <p
                    className={`service-card-copy mt-3 font-sans text-sm leading-relaxed ${
                      dark ? 'service-card-copy--invert' : ''
                    }`}
                  >
                    {s.shortDescription}
                  </p>

                  <div className="mt-6 flex items-center justify-between">
                    <div className="h-px w-12 bg-gradient-to-r from-lime to-transparent opacity-60 transition-all group-hover:w-full group-hover:opacity-100" />

                    <span className="ml-4 whitespace-nowrap text-xs font-semibold uppercase tracking-[0.15em] text-lime opacity-0 transition-all duration-300 group-hover:opacity-100">
                      Explore →
                    </span>
                  </div>
                </motion.div>
              </Link>
            )
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
          className="mt-12 flex justify-center"
        >
          <Link
            href="/services"
            className="inline-flex items-center rounded-full border border-lime/40 px-6 py-3 text-sm font-semibold uppercase tracking-[0.15em] transition-all duration-300 hover:bg-lime hover:text-black hover:shadow-lime-glow"
          >
            View All Services
          </Link>
        </motion.div>
      </div>
    </section>
  )
}