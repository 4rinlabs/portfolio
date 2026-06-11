import { buildMetadata } from '@/lib/metadata'
import { Navbar } from '@/components/Navbar'
import { SiteFooter } from '@/components/SiteFooter'
import { ThemeProvider } from '@/components/ThemeProvider'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const project = await prisma.portfolio.findUnique({ where: { slug } })
    if (!project) return {}
    return buildMetadata({
      title: project.seoTitle ?? project.title,
      description: project.seoDescription ?? project.description,
      slug: `portfolio/${slug}`,
      ogImage: project.coverImage.startsWith('http') ? project.coverImage : undefined,
    })
  } catch {
    return {}
  }
}

export async function generateStaticParams() {
  try {
    const projects = await prisma.portfolio.findMany({ select: { slug: true } })
    return projects.map((p: { slug: string }) => ({ slug: p.slug }))
  } catch {
    return []
  }
}

export default async function PortfolioItemPage({ params }: Props) {
  const { slug } = await params
  let project
  try {
    project = await prisma.portfolio.findUnique({
      where: { slug },
      include: { caseStudy: true },
    })
  } catch {
    notFound()
  }
  if (!project) notFound()

  return (
    <ThemeProvider>
      <div className="app-shell relative min-h-screen font-sans antialiased">
        <Navbar />
        <main className="pt-[4.5rem]">
          <section className="section-surface py-24 md:py-32">
            <div className="site-container">
              <Link
                href="/portfolio"
                className="inline-flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-lime/70 transition hover:text-lime"
              >
                <ArrowLeft size={14} aria-hidden />
                All Work
              </Link>

              <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_320px]">
                <div>
                  <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-mist">
                    <Image
                      src={project.coverImage}
                      alt={`${project.title} website preview`}
                      fill
                      className="object-cover object-top"
                      priority
                      sizes="(max-width: 1024px) 100vw, 65vw"
                    />
                  </div>

                  {project.caseStudy && (
                    <div className="mt-12 space-y-8">
                      {project.caseStudy.problem && (
                        <div>
                          <h2 className="font-display text-2xl font-bold uppercase tracking-tight" style={{ color: 'var(--section-title)' }}>
                            The Problem
                          </h2>
                          <p className="mt-4 font-sans text-base leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--section-body)' }}>
                            {project.caseStudy.problem}
                          </p>
                        </div>
                      )}
                      {project.caseStudy.solution && (
                        <div>
                          <h2 className="font-display text-2xl font-bold uppercase tracking-tight" style={{ color: 'var(--section-title)' }}>
                            The Solution
                          </h2>
                          <p className="mt-4 font-sans text-base leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--section-body)' }}>
                            {project.caseStudy.solution}
                          </p>
                        </div>
                      )}
                      {project.caseStudy.results && (
                        <div>
                          <h2 className="font-display text-2xl font-bold uppercase tracking-tight" style={{ color: 'var(--section-title)' }}>
                            Results
                          </h2>
                          <p className="mt-4 font-sans text-base leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--section-body)' }}>
                            {project.caseStudy.results}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <aside className="flex flex-col gap-4">
                  <p className="section-label">Project</p>
                  <h1 className="section-title">
                    <span className="glitch-heading" data-text={project.title.toUpperCase()}>
                      {project.title.toUpperCase()}
                    </span>
                  </h1>
                  <p className="section-body mt-2">{project.description}</p>

                  {project.client && (
                    <div className="mt-2">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: 'var(--section-label)' }}>Client</p>
                      <p className="mt-1 font-sans text-sm">{project.client}</p>
                    </div>
                  )}
                  {project.industry && (
                    <div>
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: 'var(--section-label)' }}>Industry</p>
                      <p className="mt-1 font-sans text-sm">{project.industry}</p>
                    </div>
                  )}
                  {project.technologies.length > 0 && (
                    <div>
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: 'var(--section-label)' }}>Tech Stack</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {project.technologies.map((tech: string) => (
                          <span key={tech} className="rounded border border-lime/30 bg-lime/10 px-2 py-1 font-sans text-[11px] font-medium text-lime">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {project.projectUrl && (
                    <a
                      href={project.projectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-lime-primary btn-glitch mt-4 flex items-center justify-center gap-2"
                    >
                      Visit live site
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  )}
                </aside>
              </div>
            </div>
          </section>
        </main>
        <SiteFooter />
      </div>
    </ThemeProvider>
  )
}
