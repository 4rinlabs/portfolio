import { buildMetadata } from '@/lib/metadata'
import { Navbar } from '@/components/Navbar'
import { SiteFooter } from '@/components/SiteFooter'
import { ThemeProvider } from '@/components/ThemeProvider'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = buildMetadata({
  title: 'Services | AI, SaaS, Web & Mobile Development',
  description:
    '4RinLabs offers AI development, custom software, SaaS platforms, web development, mobile apps, WhatsApp CRM, and digital marketing.',
  slug: 'services',
})

export default async function ServicesPage() {
  let services: { id: string; name: string; slug: string; shortDescription: string; icon: string | null }[] = []
  try {
    services = await prisma.service.findMany({
      select: { id: true, name: true, slug: true, shortDescription: true, icon: true },
      orderBy: { order: 'asc' },
    })
  } catch {
    // Fallback to static if DB unavailable
    services = [
      { id: '1', name: 'AI Development', slug: 'ai-development', shortDescription: 'Custom AI solutions, LLM integrations, RAG systems, AI agents, and intelligent automation.', icon: null },
      { id: '2', name: 'Custom Software Development', slug: 'custom-software-development', shortDescription: 'Bespoke software solutions engineered around your workflows and business logic.', icon: null },
      { id: '3', name: 'SaaS Development', slug: 'saas-development', shortDescription: 'End-to-end SaaS platform development from MVP to enterprise-ready product.', icon: null },
      { id: '4', name: 'Web Development', slug: 'web-development', shortDescription: 'From brand-sharp marketing sites to complex product interfaces — pixel-perfect execution.', icon: null },
      { id: '5', name: 'Mobile App Development', slug: 'mobile-app-development', shortDescription: 'Custom Android and iOS applications with intuitive UX, API integrations, and performance.', icon: null },
      { id: '6', name: 'WhatsApp CRM', slug: 'whatsapp-crm', shortDescription: 'WhatsApp automation, lead management, broadcast messaging, and CRM integration.', icon: null },
      { id: '7', name: 'Digital Marketing', slug: 'digital-marketing', shortDescription: 'Social media marketing, content strategy, ad campaigns, and performance marketing.', icon: null },
    ]
  }

  return (
    <ThemeProvider>
      <div className="app-shell relative min-h-screen font-sans antialiased">
        <Navbar />
        <main className="pt-[4.5rem]">
          <section className="section-surface py-24 md:py-32">
            <div className="site-container">
              <div className="max-w-2xl">
                <p className="section-label">Capabilities</p>
                <h1 className="section-title mt-3">
                  <span className="glitch-heading" data-text="SERVICES">
                    SERVICES
                  </span>
                </h1>
                <p className="section-body mt-4">
                  End-to-end execution — from AI systems to brand-sharp marketing sites.
                </p>
              </div>

              <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {services.map((service, i) => {
                  const dark = i % 2 === 1
                  return (
                    <Link
                      key={service.id}
                      href={`/services/${service.slug}`}
                      className={`service-card group relative overflow-hidden rounded-2xl border p-7 transition-all duration-300 ${
                        dark ? 'service-card--invert' : ''
                      } hover:border-lime/40 hover:shadow-lime-glow`}
                    >
                      <div
                        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-lime/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                        aria-hidden
                      />
                      <h2 className="font-display text-xl font-bold uppercase tracking-tight">
                        <span className="service-title-glitch" data-text={service.name}>
                          {service.name}
                        </span>
                      </h2>
                      <p className={`service-card-copy mt-3 font-sans text-sm leading-relaxed ${dark ? 'service-card-copy--invert' : ''}`}>
                        {service.shortDescription}
                      </p>
                      <div className="mt-6 h-px w-12 bg-gradient-to-r from-lime to-transparent opacity-60 transition-all group-hover:w-full group-hover:opacity-100" />
                    </Link>
                  )
                })}
              </div>
            </div>
          </section>
        </main>
        <SiteFooter />
      </div>
    </ThemeProvider>
  )
}
