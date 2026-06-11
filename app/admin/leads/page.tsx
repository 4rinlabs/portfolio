import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { markLeadReadAction, markLeadUnreadAction, deleteLeadAction } from '@/actions/admin'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Contact Leads' }
export const dynamic = 'force-dynamic'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/admin/login')

  const { q, status } = await searchParams
  const readFilter = status === 'read' ? true : status === 'unread' ? false : undefined

  let leads: {
    id: string
    name: string
    email: string
    phone: string | null
    company: string | null
    message: string
    read: boolean
    createdAt: Date
  }[] = []

  try {
    leads = await prisma.contactLead.findMany({
      where: {
        ...(readFilter !== undefined ? { read: readFilter } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { company: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    })
  } catch {
    /* DB not connected */
  }

  const unread = leads.filter((l) => !l.read).length
  const FILTER_BTN = (val: string, label: string) => ({
    href: `/admin/leads?status=${val}${q ? `&q=${q}` : ''}`,
    label,
    active: (status ?? '') === val,
  })
  const filters = [
    FILTER_BTN('', 'All'),
    FILTER_BTN('unread', `Unread (${unread})`),
    FILTER_BTN('read', 'Read'),
  ]

  return (
    <AdminShell email={session.user.email}>
      <div
  style={{
    padding: '24px',
  }}
>
        <AdminHeader
          title="Contact Leads"
          subtitle={`${leads.length} lead${leads.length !== 1 ? 's' : ''}${unread > 0 ? ` · ${unread} unread` : ''}`}
        >
          <form method="GET" style={{ display: 'flex', gap: '8px' }}>
            {status && <input type="hidden" name="status" value={status} />}
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name, email…"
              style={{
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                width: '220px',
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

        {leads.length === 0 ? (
          <div
            style={{
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: '16px',
              padding: '80px',
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px' }}>
              {q ? `No leads matching "${q}"` : 'No leads yet'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {leads.map((lead) => (
              <div
                key={lead.id}
                style={{
                  background: '#0a0a0a',
                  border: `1px solid ${!lead.read ? 'rgba(127,255,0,0.22)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: '14px',
                  padding: '22px 24px',
                }}
              >
                {/* Header row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '16px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h2
                        style={{
                          fontFamily: 'Syne, system-ui',
                          fontSize: '16px',
                          fontWeight: 700,
                          color: '#fff',
                          margin: 0,
                        }}
                      >
                        {lead.name}
                      </h2>
                      {!lead.read && (
                        <span
                          style={{
                            background: 'rgba(127,255,0,0.15)',
                            color: '#7fff00',
                            borderRadius: '999px',
                            padding: '2px 8px',
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          New
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                      <a
                        href={`mailto:${lead.email}`}
                        style={{ color: '#7fff00', textDecoration: 'none' }}
                      >
                        {lead.email}
                      </a>
                      {lead.phone && (
                        <>
                          {' · '}
                          <a
                            href={`tel:${lead.phone}`}
                            style={{ color: 'inherit', textDecoration: 'none' }}
                          >
                            {lead.phone}
                          </a>
                        </>
                      )}
                      {lead.company && ` · ${lead.company}`}
                    </p>
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '3px' }}>
                      {new Date(lead.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {!lead.read ? (
                      <form action={markLeadReadAction}>
                        <input type="hidden" name="id" value={lead.id} />
                        <button
                          type="submit"
                          style={{
                            padding: '6px 14px',
                            background: 'rgba(127,255,0,0.1)',
                            border: '1px solid rgba(127,255,0,0.3)',
                            borderRadius: '8px',
                            color: '#7fff00',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Mark read
                        </button>
                      </form>
                    ) : (
                      <form action={markLeadUnreadAction}>
                        <input type="hidden" name="id" value={lead.id} />
                        <button
                          type="submit"
                          style={{
                            padding: '6px 14px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: 'rgba(255,255,255,0.45)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Mark unread
                        </button>
                      </form>
                    )}

                    <a
                      href={`mailto:${lead.email}?subject=Re: Your inquiry&body=Hi ${lead.name},%0A%0A`}
                      style={{
                        padding: '6px 14px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: 'rgba(255,255,255,0.55)',
                        fontSize: '11px',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      Reply
                    </a>

                    <form action={deleteLeadAction}>
                      <input type="hidden" name="id" value={lead.id} />
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

                {/* Message */}
                <div
                  style={{
                    marginTop: '16px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    fontSize: '14px',
                    lineHeight: 1.65,
                    color: 'rgba(255,255,255,0.65)',
                    whiteSpace: 'pre-wrap',
                    borderLeft: '3px solid rgba(127,255,0,0.2)',
                  }}
                >
                  {lead.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
