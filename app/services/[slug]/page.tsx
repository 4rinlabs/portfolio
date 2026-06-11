import { buildMetadata } from '@/lib/metadata'
import { Navbar } from '@/components/Navbar'
import { SiteFooter } from '@/components/SiteFooter'
import { ThemeProvider } from '@/components/ThemeProvider'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const service = await prisma.service.findUnique({ where: { slug } })
    if (!service) return {}
    return buildMetadata({
      title: service.seoTitle ?? service.name,
      description: service.seoDescription ?? service.shortDescription,
      slug: `services/${slug}`,
    })
  } catch {
    return {}
  }
}

export async function generateStaticParams() {
  try {
    const services = await prisma.service.findMany({ select: { slug: true } })
    return services.map((s: { slug: string }) => ({ slug: s.slug }))
  } catch {
    return []
  }
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params
  let service
  try {
    service = await prisma.service.findUnique({ where: { slug } })
  } catch {
    notFound()
  }
  if (!service) notFound()

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: process.env.NEXT_PUBLIC_SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Services', item: `${process.env.NEXT_PUBLIC_SITE_URL}/services` },
      { '@type': 'ListItem', position: 3, name: service.name, item: `${process.env.NEXT_PUBLIC_SITE_URL}/services/${slug}` },
    ],
  }

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.shortDescription,
    provider: { '@type': 'Organization', name: '4RinLabs', url: process.env.NEXT_PUBLIC_SITE_URL },
    url: `${process.env.NEXT_PUBLIC_SITE_URL}/services/${slug}`,
  }

  return (
    <ThemeProvider>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <div className="app-shell relative min-h-screen font-sans antialiased">
        <Navbar />
        <main className="pt-[4.5rem]">
          <section className="section-surface py-24 md:py-32">
            <div className="site-container">
              <Link
                href="/services"
                className="inline-flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-lime/70 transition hover:text-lime"
              >
                <ArrowLeft size={14} aria-hidden />
                All Services
              </Link>
              <div className="mt-8 max-w-3xl">
                <p className="section-label">Service</p>
                <h1 className="section-title mt-3">
                  <span className="glitch-heading" data-text={service.name.toUpperCase()}>
                    {service.name.toUpperCase()}
                  </span>
                </h1>
                <p className="section-body mt-6">{service.shortDescription}</p>
                <div className="mt-8 whitespace-pre-wrap font-sans text-base leading-relaxed" style={{ color: 'var(--section-body)' }}>
                  {service.longDescription}
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
