import { prisma } from '@/lib/prisma'
import Image from 'next/image'
import Link from 'next/link'

export async function BlogPreviewSection() {
  let posts: {
    id: string
    title: string
    slug: string
    excerpt: string | null
    coverImage: string | null
    tags: string[]
    publishedAt: Date | null
    readingTime: number | null
  }[] = []

  try {
    posts = await prisma.blogPost.findMany({
      where: {
        published: true,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
        tags: true,
        publishedAt: true,
        readingTime: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: 3,
    })
  } catch (error) {
    console.error('Failed to load blog preview posts:', error)
  }

  return (
    <section
      id="blog"
      className="section-surface py-24 md:py-32"
    >
      <div className="site-container">
        <div className="max-w-2xl">
          <p className="section-label">Latest Insights</p>

          <h2 className="section-title mt-3">
            <span
              className="glitch-heading"
              data-text="LATEST INSIGHTS"
            >
              LATEST INSIGHTS
            </span>
          </h2>

          <p className="section-body mt-4">
            Insights on AI, software engineering, SaaS development,
            automation, and modern digital products.
          </p>
        </div>

        {posts.length === 0 ? (
          <div
            className="mt-14 rounded-2xl border border-dashed py-20 text-center"
            style={{ borderColor: 'var(--border)' }}
          >
            <p
              className="font-sans text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              No articles published yet.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="portfolio-card group flex flex-col overflow-hidden rounded-2xl border transition hover:border-lime/40 hover:shadow-lime-glow"
                >
                  {post.coverImage && (
                    <div className="relative aspect-[16/9] overflow-hidden bg-mist">
                      <Image
                        src={post.coverImage}
                        alt={post.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-6">
                    {post.tags.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {post.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-lime/10 px-2.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-lime"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <h3 className="portfolio-card-title font-display text-lg font-bold uppercase tracking-tight line-clamp-2">
                      {post.title}
                    </h3>

                    {post.excerpt && (
                      <p className="portfolio-card-copy mt-2 flex-1 font-sans text-sm leading-relaxed line-clamp-3">
                        {post.excerpt}
                      </p>
                    )}

                    <div
                      className="mt-4 flex items-center gap-3 font-sans text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {post.publishedAt && (
                        <span>
                          {new Date(post.publishedAt).toLocaleDateString(
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            }
                          )}
                        </span>
                      )}

                      {post.readingTime && (
                        <span>
                          · {post.readingTime} min read
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-12 flex justify-center">
              <Link
                href="/blog"
                className="hero-btn hero-btn-primary btn-glitch"
              >
                View All Articles
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  )
}