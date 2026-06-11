import { buildMetadata } from '@/lib/metadata'
import { Navbar } from '@/components/Navbar'
import { SiteFooter } from '@/components/SiteFooter'
import { ThemeProvider } from '@/components/ThemeProvider'
import type { Metadata } from 'next'

export const metadata: Metadata = buildMetadata({
  title: 'About 4RinLabs | AI Development & Software Company',
  description:
    '4RinLabs is a creative digital studio building AI solutions, SaaS platforms, and custom software for startups and enterprises worldwide.',
  slug: 'about',
})

export default function AboutPage() {
  return (
    <ThemeProvider>
      <div className="app-shell relative min-h-screen font-sans antialiased">
        <Navbar />
        <main className="pt-[4.5rem]">
          <section className="section-surface py-24 md:py-32">
            <div className="site-container">
              <div className="max-w-3xl">
                <p className="section-label">About us</p>
                <h1 className="section-title mt-3">
                  <span className="glitch-heading" data-text="4RINLABS">
                    4RINLABS
                  </span>
                </h1>
                <p className="section-body mt-6">
                  We are a creative digital studio focused on building AI solutions, SaaS platforms,
                  web applications, and custom software for startups and enterprises worldwide.
                </p>
                <p className="section-body mt-4">
                  Our approach combines engineering precision with design craft — delivering products
                  that are both technically excellent and visually compelling.
                </p>
                <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: 'Projects Shipped', value: '50+' },
                    { label: 'Countries Served', value: '10+' },
                    { label: 'Years of Experience', value: '5+' },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="service-card rounded-2xl border p-6"
                    >
                      <p className="font-display text-4xl font-extrabold text-lime">
                        {stat.value}
                      </p>
                      <p className="mt-2 font-sans text-sm">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>
        <SiteFooter />
      </div>
    </ThemeProvider>
  )
}
