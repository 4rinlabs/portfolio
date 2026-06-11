import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { deleteServiceAction, toggleServiceActiveAction } from '@/actions/admin'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Services' }
export const dynamic = 'force-dynamic'

export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/admin/login')

  const { q } = await searchParams

  let services: {
    id: string
    name: string
    slug: string
    shortDescription: string
    featured: boolean
    active: boolean
    order: number
  }[] = []

  try {
    services = await prisma.service.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: {
        id: true,
        name: true,
        slug: true,
        shortDescription: true,
        featured: true,
        active: true,
        order: true,
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
          padding: 'clamp(16px, 4vw, 40px)',
        }}
      >
        <AdminHeader
          title="Services"
          subtitle={`${services.length} service${services.length !== 1 ? 's' : ''}`}
          action={{ href: '/admin/services/new', label: '+ New Service' }}
        >
          {/* Search */}
          
          <form
            method="GET"
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              width: '100%',
            }}
          >
          <input
            name="q"
            defaultValue={q}
            placeholder="Search..."
            style={{
              flex: '1 1 100%',
              padding: '8px 14px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none',
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

        {services.length === 0 ? (
          <div
            style={{
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: '16px',
              padding: '80px',
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', marginBottom: '16px' }}>
              {q ? `No services matching "${q}"` : 'No services yet'}
            </p>
            {!q && (
              <Link
                href="/admin/services/new"
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  background: '#7fff00',
                  borderRadius: '8px',
                  color: '#0a0a0a',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  textDecoration: 'none',
                }}
              >
                Create your first service
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {services.map((svc) => (
              <div
                key={svc.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  flexWrap: 'wrap',
                  background: '#0a0a0a',
                  border: `1px solid ${svc.active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
                  borderRadius: '12px',
                  padding: '16px 20px',
                  opacity: svc.active ? 1 : 0.55,
                }}
              >
                {/* Order badge */}
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.25)',
                    minWidth: '24px',
                    fontFamily: 'Syne, system-ui',
                  }}
                >
                  {String(svc.order).padStart(2, '0')}
                </span>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#fff', margin: 0 }}>
                      {svc.name}
                    </p>
                    {svc.featured && (
                      <span
                        style={{
                          background: 'rgba(127,255,0,0.12)',
                          color: '#7fff00',
                          borderRadius: '999px',
                          padding: '2px 8px',
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        Featured
                      </span>
                    )}
                    {!svc.active && (
                      <span
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          color: 'rgba(255,255,255,0.4)',
                          borderRadius: '999px',
                          padding: '2px 8px',
                          fontSize: '10px',
                          fontWeight: 700,
                        }}
                      >
                        Inactive
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'rgba(255,255,255,0.4)',
                      margin: '3px 0 0',
                      lineHeight: '1.5',
                      wordBreak: 'break-word',
                    }}
                  >
                    /{svc.slug} · {svc.shortDescription}
                  </p>
                </div>

                {/* Actions */}
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    width: '100%',
                    marginTop: '8px',
                  }}
                >
                  <Link
                    href={`/admin/services/${svc.id}/edit`}
                    style={{
                      padding: '8px 12px',
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

                  <form action={toggleServiceActiveAction}>
                    <input type="hidden" name="id" value={svc.id} />
                    <input type="hidden" name="active" value={String(svc.active)} />
                    <button
                      type="submit"
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: 'rgba(255,255,255,0.55)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {svc.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </form>

                  <Link
                    href={`/services/${svc.slug}`}
                    target="_blank"
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      color: 'rgba(255,255,255,0.45)',
                      fontSize: '11px',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    ↗
                  </Link>

                  <form action={deleteServiceAction}>
                    <input type="hidden" name="id" value={svc.id} />
                    <button
                      type="submit"
                      style={{
                        padding: '8px 12px',
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
