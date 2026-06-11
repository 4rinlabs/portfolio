import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { deletePortfolioAction } from '@/actions/admin'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Portfolio' }
export const dynamic = 'force-dynamic'

export default async function AdminPortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/admin/login')

  const { q } = await searchParams

  let projects: {
    id: string
    title: string
    slug: string
    coverImage: string
    client: string | null
    industry: string | null
    featured: boolean
    technologies: string[]
  }[] = []

  try {
    projects = await prisma.portfolio.findMany({
      where: q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { client: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: {
        id: true,
        title: true,
        slug: true,
        coverImage: true,
        client: true,
        industry: true,
        featured: true,
        technologies: true,
      },
      orderBy: { order: 'asc' },
    })
  } catch {
    /* DB not connected */
  }

  return (
    <AdminShell email={session.user.email}>
      <div
  style={{
    padding: '24px',
  }}
>
        <AdminHeader
          title="Portfolio"
          subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''}`}
          action={{ href: '/admin/portfolio/new', label: '+ New Project' }}
        >
          <form method="GET" style={{ display: 'flex', gap: '8px' }}>
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

        {projects.length === 0 ? (
          <div
            style={{
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: '16px',
              padding: '80px',
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', marginBottom: '16px' }}>
              {q ? `No projects matching "${q}"` : 'No projects yet'}
            </p>
            {!q && (
              <Link
                href="/admin/portfolio/new"
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
                Add your first project
              </Link>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '20px',
            }}
          >
            {projects.map((project) => (
              <div
                key={project.id}
                style={{
                  background: '#0a0a0a',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px',
                  overflow: 'hidden',
                }}
              >
                {/* Thumbnail */}
                <div style={{ position: 'relative', aspectRatio: '16/9', background: '#141414' }}>
                  <Image
                    src={project.coverImage}
                    alt={project.title}
                    fill
                    className="object-cover"
                    sizes="340px"
                    
                  />
                  {project.featured && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        background: 'rgba(127,255,0,0.9)',
                        color: '#0a0a0a',
                        borderRadius: '999px',
                        padding: '3px 10px',
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      Featured
                    </span>
                  )}
                </div>

                {/* Meta */}
                <div style={{ padding: '16px 18px' }}>
                  <p
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#fff',
                      margin: 0,
                      fontFamily: 'Syne, system-ui',
                    }}
                  >
                    {project.title}
                  </p>
                  {(project.client || project.industry) && (
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '3px' }}>
                      {[project.client, project.industry].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {project.technologies.length > 0 && (
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px' }}>
                      {project.technologies.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          style={{
                            background: 'rgba(127,255,0,0.06)',
                            color: 'rgba(127,255,0,0.7)',
                            borderRadius: '4px',
                            padding: '2px 7px',
                            fontSize: '10px',
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <Link
                      href={`/admin/portfolio/${project.id}/edit`}
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        padding: '7px 0',
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
                    <Link
                      href={`/portfolio/${project.slug}`}
                      target="_blank"
                      style={{
                        padding: '7px 12px',
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
                    <form action={deletePortfolioAction}>
                      <input type="hidden" name="id" value={project.id} />
                      <button
                        type="submit"
                        style={{
                          padding: '7px 12px',
                          background: 'rgba(255,50,50,0.08)',
                          border: '1px solid rgba(255,50,50,0.2)',
                          borderRadius: '8px',
                          color: 'rgba(255,100,100,0.8)',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
