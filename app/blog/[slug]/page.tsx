import { buildMetadata } from '@/lib/metadata'
import { Navbar } from '@/components/Navbar'
import { SiteFooter } from '@/components/SiteFooter'
import { ThemeProvider } from '@/components/ThemeProvider'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const post = await prisma.blogPost.findUnique({ where: { slug, published: true } })
    if (!post) return {}
    return buildMetadata({
      title: post.seoTitle ?? post.title,
      description: post.seoDescription ?? (post.excerpt ?? undefined),
      slug: `blog/${slug}`,
      ogImage: post.ogImage ?? (post.coverImage ?? undefined),
    })
  } catch {
    return {}
  }
}

export async function generateStaticParams() {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { published: true },
      select: { slug: true },
    })
    return posts.map((p: { slug: string }) => ({ slug: p.slug }))
  } catch {
    return []
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  let post
  try {
    post = await prisma.blogPost.findUnique({ where: { slug, published: true } })
  } catch {
    notFound()
  }
  if (!post) notFound()

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: post.coverImage,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { '@type': 'Organization', name: '4RinLabs', url: process.env.NEXT_PUBLIC_SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: '4RinLabs',
      logo: { '@type': 'ImageObject', url: `${process.env.NEXT_PUBLIC_SITE_URL}/logo.png` },
    },
  }

  return (
    <ThemeProvider>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <div className="app-shell relative min-h-screen font-sans antialiased">
        <Navbar />
        <main className="pt-[4.5rem]">
          <article className="section-surface py-24 md:py-32">
            <div className="site-container max-w-3xl">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-lime/70 transition hover:text-lime"
              >
                <ArrowLeft size={14} aria-hidden />
                All Posts
              </Link>

              <header className="mt-8">
                {post.tags.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {post.tags.map((tag: string) => (
                      <span key={tag} className="rounded-full bg-lime/10 px-3 py-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-lime">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight md:text-5xl" style={{ color: 'var(--section-title)' }}>
                  {post.title}
                </h1>
                <div className="mt-4 flex items-center gap-3 font-sans text-sm" style={{ color: 'var(--text-muted)' }}>
                  {post.publishedAt && (
                    <time dateTime={post.publishedAt.toISOString()}>
                      {new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </time>
                  )}
                  {post.readingTime && <span>· {post.readingTime} min read</span>}
                </div>
              </header>

              {post.coverImage && (
                <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-2xl bg-mist">
                  <Image
                    src={post.coverImage}
                    alt={post.title}
                    fill
                    className="object-cover"
                    priority
                    sizes="(max-width: 768px) 100vw, 768px"
                  />
                </div>
              )}

              <div
                className="prose-content mt-12 max-w-none whitespace-pre-wrap font-sans text-base leading-relaxed"
                style={{ color: 'var(--section-body)' }}
              >
                {post.content}
              </div>
            </div>
          </article>
        </main>
        <SiteFooter />
      </div>
    </ThemeProvider>
  )
}
