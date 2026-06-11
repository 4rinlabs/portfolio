import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { deleteBlogPostAction } from '@/actions/admin'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Blog' }
export const dynamic = 'force-dynamic'

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/admin/login')

  const { q, status } = await searchParams
  const publishedFilter =
    status === 'published' ? true : status === 'draft' ? false : undefined

  let posts: {
    id: string
    title: string
    slug: string
    published: boolean
    publishedAt: Date | null
    tags: string[]
    readingTime: number | null
  }[] = []

  try {
    posts = await prisma.blogPost.findMany({
      where: {
        ...(publishedFilter !== undefined ? { published: publishedFilter } : {}),
        ...(q
          ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      select: {
        id: true,
        title: true,
        slug: true,
        published: true,
        publishedAt: true,
        tags: true,
        readingTime: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  } catch {
    /* DB not connected */
  }

  const published = posts.filter((p) => p.published).length
  const drafts = posts.filter((p) => !p.published).length

  const FILTER_BTN = (val: string, label: string) => ({
    href: `/admin/blog?status=${val}${q ? `&q=${q}` : ''}`,
    label,
    active: (status ?? '') === val,
  })

  const filters = [
    FILTER_BTN('', 'All'),
    FILTER_BTN('published', `Published (${published})`),
    FILTER_BTN('draft', `Drafts (${drafts})`),
  ]

  return (
    <AdminShell email={session.user.email}>
      <div
  style={{
    padding: '24px',
  }}
>
        <AdminHeader
          title="Blog"
          subtitle={`${posts.length} post${posts.length !== 1 ? 's' : ''}`}
          action={{ href: '/admin/blog/new', label: '+ New Post' }}
        >
          <form method="GET" style={{ display: 'flex', gap: '8px' }}>
            {status && <input type="hidden" name="status" value={status} />}
            <input
              name="q"
              defaultValue={q}
              placeholder="Search…"
              style={{
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                width: '200px',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Search
            </button>
          </form>
        </AdminHeader>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
          {filters.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
                background: f.active ? 'rgba(127,255,0,0.12)' : 'rgba(255,255,255,0.05)',
                color: f.active ? '#7fff00' : 'rgba(255,255,255,0.5)',
                border: f.active ? '1px solid rgba(127,255,0,0.25)' : '1px solid transparent',
              }}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {posts.length === 0 ? (
          <div
            style={{
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: '16px',
              padding: '80px',
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', marginBottom: '16px' }}>
              {q ? `No posts matching "${q}"` : 'No posts yet'}
            </p>
            {!q && (
              <Link
                href="/admin/blog/new"
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  background: '#7fff00',
                  borderRadius: '8px',
                  color: '#0a0a0a',
                  fontSize: '12px',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Write your first post
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {posts.map((post) => (
              <div
                key={post.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  background: '#0a0a0a',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#fff', margin: 0 }}>
                      {post.title}
                    </p>
                    <span
                      style={{
                        background: post.published ? 'rgba(127,255,0,0.1)' : 'rgba(255,255,255,0.06)',
                        color: post.published ? '#7fff00' : 'rgba(255,255,255,0.4)',
                        borderRadius: '999px',
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {post.published ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: '4px 0 0' }}>
                    /{post.slug}
                    {post.publishedAt && ` · ${new Date(post.publishedAt).toLocaleDateString()}`}
                    {post.readingTime && ` · ${post.readingTime} min read`}
                  </p>
                  {post.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '7px' }}>
                      {post.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          style={{
                            background: 'rgba(127,255,0,0.06)',
                            color: 'rgba(127,255,0,0.65)',
                            borderRadius: '4px',
                            padding: '2px 7px',
                            fontSize: '10px',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <Link
                    href={`/admin/blog/${post.id}/edit`}
                    style={{
                      padding: '6px 14px',
                      background: 'rgba(127,255,0,0.08)',
                      border: '1px solid rgba(127,255,0,0.2)',
                      borderRadius: '8px',
                      color: '#7fff00',
                      fontSize: '11px',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Edit
                  </Link>
                  {post.published && (
                    <Link
                      href={`/blog/${post.slug}`}
                      target="_blank"
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        color: 'rgba(255,255,255,0.45)',
                        fontSize: '11px',
                        textDecoration: 'none',
                      }}
                    >
                      ↗
                    </Link>
                  )}
                  <form action={deleteBlogPostAction}>
                    <input type="hidden" name="id" value={post.id} />
                    <button
                      type="submit"
                      style={{
                        padding: '6px 14px',
                        background: 'rgba(255,50,50,0.08)',
                        border: '1px solid rgba(255,50,50,0.2)',
                        borderRadius: '8px',
                        color: 'rgba(255,100,100,0.8)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
