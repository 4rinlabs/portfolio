import { buildMetadata } from '@/lib/metadata'
import { Navbar } from '@/components/Navbar'
import { SiteFooter } from '@/components/SiteFooter'
import { ThemeProvider } from '@/components/ThemeProvider'
import { prisma } from '@/lib/prisma'
import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = buildMetadata({
  title: 'Portfolio | Client Work & Case Studies',
  description:
    'Explore 4RinLabs portfolio — websites, SaaS platforms, and digital products built for clients worldwide.',
  slug: 'portfolio',
})

export default async function PortfolioPage() {
  let projects: {
    id: string; title: string; slug: string; description: string;
    coverImage: string; projectUrl: string | null; industry: string | null; technologies: string[]
  }[] = []

  try {
    projects = await prisma.portfolio.findMany({
      select: {
        id: true, title: true, slug: true, description: true,
        coverImage: true, projectUrl: true, industry: true, technologies: true,
      },
      orderBy: { order: 'asc' },
    })
  } catch {
    // Static fallback
    projects = [
      { id: '1', title: 'FYS Clothing', slug: 'fys-clothing', description: 'Premium fashion storefront with bold visuals and a seamless shopping experience.', coverImage: '/portfolio/fys-clothing.png', projectUrl: 'https://fysclothing.in/', industry: 'E-Commerce', technologies: ['Next.js', 'Tailwind CSS'] },
      { id: '2', title: 'Westren Capital', slug: 'westren-capital', description: 'Corporate finance brand site with trust-focused layout.', coverImage: '/portfolio/westren-capital.png', projectUrl: 'https://www.westrencapital.com/', industry: 'Finance', technologies: ['React', 'TypeScript'] },
      { id: '3', title: 'EazyFly Travels', slug: 'eazyfly-travels', description: 'Luxury travel experience with curated journeys.', coverImage: '/portfolio/eazyfly.png', projectUrl: 'https://www.eazyfly.co.in', industry: 'Travel', technologies: ['Next.js', 'Framer Motion'] },
      { id: '4', title: 'Shaheen Al Jabal', slug: 'shaheen-al-jabal', description: 'Industrial B2B presence across the UAE.', coverImage: '/portfolio/shaheen-al-jabal.png', projectUrl: 'https://www.shaheenaljabal.com', industry: 'Construction', technologies: ['React', 'Tailwind CSS'] },
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
                <p className="section-label">Selected work</p>
                <h1 className="section-title mt-3">
                  <span className="glitch-heading" data-text="PORTFOLIO">
                    PORTFOLIO
                  </span>
                </h1>
                <p className="section-body mt-4">
                  Shipped websites — live previews from recent client builds.
                </p>
              </div>

              <div className="mt-14 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                {projects.map((project) => (
                  <article
                    key={project.id}
                    className="portfolio-card group flex flex-col overflow-hidden rounded-2xl border shadow-sm"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-mist">
                      <Image
                        src={project.coverImage}
                        alt={`${project.title} website preview`}
                        fill
                        className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.05]"
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                      />
                      <div className="portfolio-glitch-overlay pointer-events-none absolute inset-0 opacity-0 mix-blend-screen" aria-hidden />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent" aria-hidden />
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="portfolio-card-title font-display text-lg font-bold uppercase tracking-tight">
                          {project.title}
                        </h2>
                        {project.industry && (
                          <span className="shrink-0 rounded-full border border-lime/30 bg-lime/10 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-lime">
                            {project.industry}
                          </span>
                        )}
                      </div>
                      <p className="portfolio-card-copy mt-2 flex-1 font-sans text-sm leading-relaxed">
                        {project.description}
                      </p>
                      {project.technologies.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {project.technologies.slice(0, 4).map((tech) => (
                            <span key={tech} className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 font-sans text-[10px] tracking-wide" style={{ color: 'var(--text-muted)' }}>
                              {tech}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-5 flex items-center gap-3">
                        <Link
                          href={`/portfolio/${project.slug}`}
                          className="portfolio-card-cta btn-glitch inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] transition hover:border-lime/50 hover:shadow-lime-glow"
                        >
                          Case study
                        </Link>
                        {project.projectUrl && (
                          <a
                            href={project.projectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="portfolio-card-cta btn-glitch inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] transition hover:border-lime/50 hover:shadow-lime-glow"
                          >
                            Live site
                            <ExternalLink size={12} className="text-lime" aria-hidden />
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </main>
        <SiteFooter />
      </div>
    </ThemeProvider>
  )
}
