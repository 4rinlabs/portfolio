import { buildMetadata } from '@/lib/metadata'
import { Navbar } from '@/components/Navbar'
import { SiteFooter } from '@/components/SiteFooter'
import { ThemeProvider } from '@/components/ThemeProvider'
import { HomeScrollHandler } from '@/components/HomeScrollHandler'
import { prisma } from '@/lib/prisma'
import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink, ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = buildMetadata({
  title: 'Products | Tools & Platforms by 4RinLabs',
  description:
    '4RinLabs builds and ships its own software products — AI tools, SaaS platforms and developer utilities.',
  slug: 'products',
})

export default async function ProductsPage() {
  let products: {
    id: string
    name: string
    slug: string
    tagline: string
    coverImage: string
    tags: string[]
    category: string | null
    productUrl: string | null
    featured: boolean
  }[] = []

  try {
    products = await prisma.product.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        slug: true,
        tagline: true,
        coverImage: true,
        tags: true,
        category: true,
        productUrl: true,
        featured: true,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    })
  } catch {
    // Empty state
  }

  return (
    <ThemeProvider>
      <div className="app-shell relative min-h-screen font-sans antialiased">
        <Navbar />
        <HomeScrollHandler />
        <main className="pt-[4.5rem]">
          <section className="section-surface py-24 md:py-32">
            <div className="site-container">
              {/* Header */}
              <div className="max-w-2xl">
                <p className="section-label">What we ship</p>
                <h1 className="section-title mt-3">
                  <span className="glitch-heading" data-text="PRODUCTS">
                    PRODUCTS
                  </span>
                </h1>
                <p className="section-body mt-4">
                  Tools, platforms and software products built and owned by 4RinLabs.
                </p>
              </div>

              {/* Grid */}
              {products.length === 0 ? (
                <div
                  className="mt-14 rounded-2xl border border-dashed py-20 text-center"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <p className="font-sans text-sm" style={{ color: 'var(--text-muted)' }}>
                    No products available yet. Check back soon.
                  </p>
                </div>
              ) : (
                <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((product) => (
                    <article
                      key={product.id}
                      className="portfolio-card group flex flex-col overflow-hidden rounded-2xl border shadow-sm"
                    >
                      {/* Cover */}
                      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-mist">
                        {product.coverImage ? (
                          <Image
                            src={product.coverImage}
                            alt={`${product.name} preview`}
                            fill
                            className="object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-charcoal">
                            <span className="font-display text-5xl font-bold text-lime/20">
                              {product.name.charAt(0)}
                            </span>
                          </div>
                        )}
                        <div
                          className="portfolio-glitch-overlay pointer-events-none absolute inset-0 opacity-0 mix-blend-screen transition-opacity duration-300 group-hover:opacity-100"
                          aria-hidden
                        />
                        <div
                          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent"
                          aria-hidden
                        />
                        {product.featured && (
                          <span className="absolute left-3 top-3 rounded-full bg-lime px-2.5 py-0.5 font-sans text-[9px] font-bold uppercase tracking-wider text-ink">
                            Featured
                          </span>
                        )}
                      </div>

                      {/* Body */}
                      <div className="flex flex-1 flex-col p-6">
                        <h2 className="portfolio-card-title font-display text-lg font-bold uppercase tracking-tight">
                          {product.name}
                        </h2>
                        <p className="portfolio-card-copy mt-2 flex-1 font-sans text-sm leading-relaxed">
                          {product.tagline}
                        </p>
                        {product.tags.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-1.5">
                            {product.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-lime/10 px-2.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-lime"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-5 flex items-center gap-3">
                          <Link
                            href={`/products/${product.slug}`}
                            className="portfolio-card-cta btn-glitch inline-flex items-center gap-1.5 rounded-lg border px-4 py-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] transition hover:border-lime/50 hover:shadow-lime-glow"
                          >
                            Learn more
                            <ArrowRight size={12} className="text-lime" aria-hidden />
                          </Link>
                          {product.productUrl && (
                            <a
                              href={product.productUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="portfolio-card-cta btn-glitch inline-flex items-center gap-1.5 rounded-lg border px-4 py-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] transition hover:border-lime/50 hover:shadow-lime-glow"
                            >
                              Live
                              <ExternalLink size={12} className="text-lime" aria-hidden />
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
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
