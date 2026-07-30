import { buildMetadata } from '@/lib/metadata'
import { Navbar } from '@/components/Navbar'
import { SiteFooter } from '@/components/SiteFooter'
import { ThemeProvider } from '@/components/ThemeProvider'
import { HomeScrollHandler } from '@/components/HomeScrollHandler'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Github } from 'lucide-react'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const product = await prisma.product.findUnique({ where: { slug, active: true } })
    if (!product) return {}
    return buildMetadata({
      title: product.seoTitle ?? product.name,
      description: product.seoDescription ?? product.tagline,
      slug: `products/${slug}`,
      ogImage: product.coverImage || undefined,
    })
  } catch {
    return {}
  }
}

export async function generateStaticParams() {
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      select: { slug: true },
    })
    return products.map((p: { slug: string }) => ({ slug: p.slug }))
  } catch {
    return []
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params

  let product: {
    name: string
    tagline: string
    description: string
    coverImage: string
    gallery: string[]
    tags: string[]
    category: string | null
    productUrl: string | null
    githubUrl: string | null
    featured: boolean
  } | null = null

  try {
    product = await prisma.product.findUnique({
      where: { slug, active: true },
      select: {
        name: true,
        tagline: true,
        description: true,
        coverImage: true,
        gallery: true,
        tags: true,
        category: true,
        productUrl: true,
        githubUrl: true,
        featured: true,
      },
    })
  } catch {
    notFound()
  }

  if (!product) notFound()

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: product.name,
    description: product.tagline,
    applicationCategory: product.category ?? 'WebApplication',
    url: product.productUrl ?? `${process.env.NEXT_PUBLIC_SITE_URL}/products/${slug}`,
    author: {
      '@type': 'Organization',
      name: '4RinLabs',
      url: process.env.NEXT_PUBLIC_SITE_URL,
    },
  }

  return (
    <ThemeProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
      <div className="app-shell relative min-h-screen font-sans antialiased">
        <Navbar />
        <HomeScrollHandler />

        <main className="pt-[4.5rem]">
          <article className="section-surface py-24 md:py-32">
            <div className="site-container">

              {/* Back link */}
              <Link
                href="/products"
                className="inline-flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-lime/70 transition hover:text-lime"
              >
                <ArrowLeft size={14} aria-hidden />
                All Products
              </Link>

              <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_300px]">

                {/* ── Left: cover + gallery + description ── */}
                <div>
                  {/* Cover image */}
                  <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-mist">
                    {product.coverImage ? (
                      <Image
                        src={product.coverImage}
                        alt={product.name}
                        fill
                        priority
                        className="object-cover object-top"
                        sizes="(max-width: 1024px) 100vw, 65vw"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-charcoal">
                        <span className="font-display text-7xl font-bold text-lime/15">
                          {product.name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Gallery grid */}
                  {product.gallery.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {product.gallery.map((img, i) => (
                        <div key={i} className="relative aspect-video overflow-hidden rounded-xl bg-mist">
                          <Image
                            src={img}
                            alt={`${product!.name} screenshot ${i + 1}`}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 33vw, 220px"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Full description */}
                  <div className="mt-10">
                    <h2
                      className="font-display text-2xl font-bold uppercase tracking-tight"
                      style={{ color: 'var(--section-title)' }}
                    >
                      About
                    </h2>
                    <div
                      className="mt-4 whitespace-pre-wrap font-sans text-base leading-relaxed"
                      style={{ color: 'var(--section-body)' }}
                    >
                      {product.description}
                    </div>
                  </div>
                </div>

                {/* ── Right: sticky meta sidebar ── */}
                <aside className="flex flex-col gap-6 lg:sticky lg:top-28 lg:self-start">

                  {product.category && (
                    <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.25em] text-lime/70">
                      {product.category}
                    </p>
                  )}

                  <div>
                    <h1
                      className="font-display text-3xl font-extrabold uppercase tracking-tight md:text-4xl"
                      style={{ color: 'var(--section-title)' }}
                    >
                      {product.name}
                    </h1>
                    <p
                      className="mt-3 font-sans text-base leading-relaxed"
                      style={{ color: 'var(--section-body)' }}
                    >
                      {product.tagline}
                    </p>
                  </div>

                  {product.tags.length > 0 && (
                    <div>
                      <p
                        className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.25em]"
                        style={{ color: 'var(--section-label)' }}
                      >
                        Tags
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {product.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-lime/30 bg-lime/10 px-2.5 py-1 font-sans text-[11px] font-medium text-lime"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    {product.productUrl && (
                      <a
                        href={product.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-lime-primary btn-glitch flex items-center justify-center gap-2"
                      >
                        Visit product
                        <ExternalLink size={14} aria-hidden />
                      </a>
                    )}
                    {product.githubUrl && (
                      <a
                        href={product.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hero-btn hero-btn-secondary btn-glitch flex w-full items-center justify-center gap-2"
                      >
                        <Github size={14} aria-hidden />
                        View source
                      </a>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          </article>
        </main>

        <SiteFooter />
      </div>
    </ThemeProvider>
  )
}
