import { buildMetadata } from '@/lib/metadata'
import { Navbar } from '@/components/Navbar'
import { SiteFooter } from '@/components/SiteFooter'
import { ThemeProvider } from '@/components/ThemeProvider'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = buildMetadata({
  title: 'Case Studies | Deep Dives into Our Work',
  description:
    'Detailed case studies from 4RinLabs — explore the problems we solved, our process, and the results we delivered.',
  slug: 'case-studies',
})

export default async function CaseStudiesPage() {
  let studies: {
    id: string; title: string; slug: string;
    portfolio: { title: string; coverImage: string; industry: string | null }
    technology: string[]
  }[] = []

  try {
    studies = await prisma.caseStudy.findMany({
      select: {
        id: true, title: true, slug: true, technology: true,
        portfolio: { select: { title: true, coverImage: true, industry: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  } catch {
    // Empty state
  }

  return (
    <ThemeProvider>
      <div className="app-shell relative min-h-screen font-sans antialiased">
        <Navbar />
        <main className="pt-[4.5rem]">
          <section className="section-surface py-24 md:py-32">
            <div className="site-container">
              <div className="max-w-2xl">
                <p className="section-label">Deep dives</p>
                <h1 className="section-title mt-3">
                  <span className="glitch-heading" data-text="CASE STUDIES">
                    CASE STUDIES
                  </span>
                </h1>
                <p className="section-body mt-4">
                  Behind-the-scenes looks at our process, decisions, and results.
                </p>
              </div>

              {studies.length === 0 ? (
                <div className="mt-14 rounded-2xl border border-dashed py-20 text-center" style={{ borderColor: 'var(--border)' }}>
                  <p className="font-sans text-sm" style={{ color: 'var(--text-muted)' }}>
                    Case studies coming soon.
                  </p>
                </div>
              ) : (
                <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                  {studies.map((study) => (
                    <Link
                      key={study.id}
                      href={`/case-studies/${study.slug}`}
                      className="portfolio-card group flex flex-col overflow-hidden rounded-2xl border transition hover:border-lime/40 hover:shadow-lime-glow"
                    >
                      <div className="relative aspect-[16/9] overflow-hidden bg-mist">
                        <Image
                          src={study.portfolio.coverImage}
                          alt={study.portfolio.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>
                      <div className="flex flex-1 flex-col p-6">
                        {study.portfolio.industry && (
                          <span className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.25em] text-lime/70">
                            {study.portfolio.industry}
                          </span>
                        )}
                        <h2 className="portfolio-card-title font-display text-lg font-bold uppercase tracking-tight">
                          {study.title}
                        </h2>
                        {study.technology.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-1.5">
                            {study.technology.slice(0, 4).map((tech) => (
                              <span key={tech} className="rounded border border-lime/30 px-2 py-0.5 font-sans text-[10px] font-medium text-lime">
                                {tech}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>
        <SiteFooter />
      </div>
    </ThemeProvider>
  )
}
