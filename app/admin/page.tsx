import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { AdminShell } from '@/components/admin/AdminShell'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

async function getDashboardData() {
  try {
    const [
      totalLeads,
      unreadLeads,
      totalProjects,
      totalServices,
      publishedPosts,
      draftPosts,
      recentLeads,
      recentPosts,
      recentProjects,
    ] = await Promise.all([
      prisma.contactLead.count(),
      prisma.contactLead.count({ where: { read: false } }),
      prisma.portfolio.count(),
      prisma.service.count(),
      prisma.blogPost.count({ where: { published: true } }),
      prisma.blogPost.count({ where: { published: false } }),
      prisma.contactLead.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, email: true, company: true, read: true, createdAt: true },
      }),
      prisma.blogPost.findMany({
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { id: true, title: true, slug: true, published: true, createdAt: true },
      }),
      prisma.portfolio.findMany({
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { id: true, title: true, slug: true, coverImage: true, featured: true },
      }),
    ])

    return {
      totalLeads,
      unreadLeads,
      totalProjects,
      totalServices,
      publishedPosts,
      draftPosts,
      recentLeads,
      recentPosts,
      recentProjects,
    }
  } catch {
    return {
      totalLeads: 0,
      unreadLeads: 0,
      totalProjects: 0,
      totalServices: 0,
      publishedPosts: 0,
      draftPosts: 0,
      recentLeads: [],
      recentPosts: [],
      recentProjects: [],
    }
  }
}

export default async function AdminDashboard() {
  const session = await auth()
  if (!session) redirect('/admin/login')

  const data = await getDashboardData()

  const statCards = [
    {
      label: 'Unread Leads',
      value: data.unreadLeads,
      sub: `${data.totalLeads} total`,
      href: '/admin/leads?status=unread',
      accent: data.unreadLeads > 0,
    },
    {
      label: 'Services',
      value: data.totalServices,
      sub: 'Manage services',
      href: '/admin/services',
      accent: false,
    },
    {
      label: 'Projects',
      value: data.totalProjects,
      sub: 'Portfolio items',
      href: '/admin/portfolio',
      accent: false,
    },
    {
      label: 'Blog Posts',
      value: data.publishedPosts,
      sub: `${data.draftPosts} drafts`,
      href: '/admin/blog',
      accent: false,
    },
  ]

  const quickActions = [
    { href: '/admin/services/new', label: '+ New Service' },
    { href: '/admin/portfolio/new', label: '+ New Project' },
    { href: '/admin/blog/new', label: '+ New Post' },
    { href: '/admin/leads', label: 'View Leads' },
  ]

  return (
    <AdminShell email={session.user.email}>
      <div style={{ padding: 'clamp(16px, 4vw, 40px)', }}>
        {/* Welcome */}
        <div style={{ marginBottom: '36px' }}>
          <h1
            style={{
              fontFamily: 'Syne, system-ui',
              fontSize: 'clamp(22px, 4vw, 26px)',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '-0.02em',
              color: '#fff',
              margin: 0,
            }}
          >
            Dashboard
          </h1>
          <p style={{ marginTop: '6px', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
            Welcome back, {session.user.name ?? session.user.email}
          </p>
        </div>

        {/* Stat cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
            gap: '16px',
            marginBottom: '36px',
          }}
        >
          {statCards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              style={{
                display: 'block',
                background: '#0a0a0a',
                border: `1px solid ${card.accent ? 'rgba(127,255,0,0.3)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: '14px',
                padding: '22px 22px 18px',
                textDecoration: 'none',
                transition: 'border-color 0.15s',
              }}
            >
              <p
                style={{
                  fontSize: '34px',
                  fontWeight: 800,
                  fontFamily: 'Syne, system-ui',
                  color: card.accent ? '#7fff00' : '#fff',
                  margin: 0,
                  lineHeight: 1,
                }}
              >
                {card.value}
              </p>
              <p
                style={{
                  marginTop: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                {card.label}
              </p>
              <p style={{ marginTop: '2px', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                {card.sub}
              </p>
            </Link>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{ marginBottom: '40px' }}>
          <p
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.25em',
              color: 'rgba(255,255,255,0.3)',
              marginBottom: '14px',
            }}
          >
            Quick Actions
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'stretch',
            }}
          >
            {quickActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                style={{
                  padding: '9px 18px',
                  background: 'transparent',
                  border: '1px solid rgba(127,255,0,0.35)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
              >
                {a.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Two-column activity */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
            gap: '24px',
          }}
        >
          {/* Recent leads */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
              }}
            >
              <p
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.25em',
                  color: 'rgba(255,255,255,0.3)',
                  margin: 0,
                }}
              >
                Recent Leads
              </p>
              <Link
                href="/admin/leads"
                style={{ fontSize: '12px', color: '#7fff00', textDecoration: 'none' }}
              >
                View all →
              </Link>
            </div>

            {data.recentLeads.length === 0 ? (
              <div
                style={{
                  padding: '32px',
                  textAlign: 'center',
                  background: '#0a0a0a',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.25)',
                }}
              >
                No leads yet
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {data.recentLeads.map((lead) => (
                  <div
                    key={lead.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      background: '#0a0a0a',
                      border: `1px solid ${!lead.read ? 'rgba(127,255,0,0.18)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: '10px',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#fff',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {lead.name}
                        {!lead.read && (
                          <span
                            style={{
                              marginLeft: '6px',
                              background: 'rgba(127,255,0,0.15)',
                              color: '#7fff00',
                              borderRadius: '999px',
                              padding: '1px 6px',
                              fontSize: '9px',
                              fontWeight: 700,
                            }}
                          >
                            NEW
                          </span>
                        )}
                      </p>
                      <p
                        style={{
                          fontSize: '11px',
                          color: 'rgba(255,255,255,0.35)',
                          margin: '2px 0 0',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {lead.email}
                        {lead.company && ` · ${lead.company}`}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.25)',
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent posts + projects stacked */}
          <div style={{ display: 'grid', gap: '24px' }}>
            {/* Recent blog posts */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px',
                }}
              >
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.25em',
                    color: 'rgba(255,255,255,0.3)',
                    margin: 0,
                  }}
                >
                  Recent Posts
                </p>
                <Link
                  href="/admin/blog"
                  style={{ fontSize: '12px', color: '#7fff00', textDecoration: 'none' }}
                >
                  View all →
                </Link>
              </div>
              {data.recentPosts.length === 0 ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    background: '#0a0a0a',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.25)',
                  }}
                >
                  No posts yet
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '6px' }}>
                  {data.recentPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/admin/blog/${post.id}/edit`}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#0a0a0a',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '9px',
                        padding: '10px 14px',
                        textDecoration: 'none',
                      }}
                    >
                      <span
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: post.published ? '#7fff00' : 'rgba(255,255,255,0.2)',
                          flexShrink: 0,
                        }}
                      />
                      <span
                          style={{
                            flex: '1 1 100%',
                            fontSize: '13px',
                            color: '#fff',
                            lineHeight: '1.5',
                            wordBreak: 'break-word',
                          }}
                        >
                        {post.title}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'rgba(255,255,255,0.3)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {new Date(post.createdAt).toLocaleDateString()}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Recent projects */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px',
                }}
              >
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.25em',
                    color: 'rgba(255,255,255,0.3)',
                    margin: 0,
                  }}
                >
                  Recent Projects
                </p>
                <Link
                  href="/admin/portfolio"
                  style={{ fontSize: '12px', color: '#7fff00', textDecoration: 'none' }}
                >
                  View all →
                </Link>
              </div>
              {data.recentProjects.length === 0 ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    background: '#0a0a0a',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.25)',
                  }}
                >
                  No projects yet
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '6px' }}>
                  {data.recentProjects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/admin/portfolio/${project.id}/edit`}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#0a0a0a',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '9px',
                        padding: '10px 14px',
                        textDecoration: 'none',
                      }}
                    >
                      {project.featured && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            background: 'rgba(127,255,0,0.12)',
                            color: '#7fff00',
                            borderRadius: '4px',
                            padding: '2px 5px',
                            flexShrink: 0,
                          }}
                        >
                          ★
                        </span>
                      )}
                      <span
                        style={{
                          flex: '1 1 100%',
                          fontSize: '13px',
                          color: '#fff',
                          lineHeight: '1.5',
                          wordBreak: 'break-word',
                        }}
                      >
                        {project.title}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
