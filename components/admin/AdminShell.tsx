'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useEffect, useState, type ReactNode } from 'react'

const NAV = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/portfolio', label: 'Portfolio' },
  { href: '/admin/blog', label: 'Blog' },
  { href: '/admin/leads', label: 'Leads' },
]

export function AdminShell({
  children,
  email,
}: {
  children: ReactNode
  email?: string | null
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }

    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#050505' }}>
      {/* Mobile Header */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '60px',
          background: '#0a0a0a',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 1200,
        }}
        className="admin-mobile-header"
      >
        <button
          aria-label="Open menu"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(true)}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            fontSize: '22px',
            cursor: 'pointer',
          }}
        >
          ☰
        </button>

        <span
          style={{
            color: '#fff',
            fontWeight: 700,
            fontSize: '14px',
            letterSpacing: '0.08em',
          }}
        >
          4RinLabs Admin
        </span>

        <div style={{ width: '22px' }} />
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1100,
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        role="dialog"
        style={{
          width: '220px',
          flexShrink: 0,
          background: '#0a0a0a',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 12px',
          height: '100vh',
          zIndex: 1300,
        }}
        className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}
      >
        {/* Brand */}
        <div style={{ paddingLeft: '12px', marginBottom: '32px' }}>
          <p
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.35em',
              color: '#7fff00',
              marginBottom: '3px',
            }}
          >
            Admin
          </p>

          <Link
            href="/admin"
            onClick={() => setSidebarOpen(false)}
            style={{
              fontSize: '15px',
              fontWeight: 800,
              fontFamily: 'Syne, system-ui',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            4RinLabs
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: 'block',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: active ? '#7fff00' : 'rgba(255,255,255,0.6)',
                  background: active
                    ? 'rgba(127,255,0,0.08)'
                    : 'transparent',
                  textDecoration: 'none',
                  transition: 'all 0.15s',
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '16px' }}>
          <Link
            href="/"
            target="_blank"
            onClick={() => setSidebarOpen(false)}
            style={{
              display: 'block',
              padding: '7px 12px',
              fontSize: '12px',
              color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none',
              marginBottom: '4px',
            }}
          >
            ↗ View live site
          </Link>

          {email && (
            <p
              style={{
                padding: '0 12px',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.3)',
                marginBottom: '8px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {email}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setSidebarOpen(false)
              signOut({ callbackUrl: '/admin/login' })
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              color: 'rgba(255,255,255,0.45)',
              fontSize: '12px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main
        className="admin-main"
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'auto',
          paddingTop: '60px',
        }}
      >
        {children}
      </main>

      <style jsx>{`
        .admin-mobile-header {
          display: none;
        }

        @media (max-width: 1023px) {
          .admin-mobile-header {
            display: flex;
          }

          .admin-sidebar {
            position: fixed;
            top: 0;
            left: -220px;
            transition: left 0.25s ease;
          }

          .admin-sidebar.open {
            left: 0;
          }

          .admin-main {
              width: 100%;
            }

            @media (max-width: 1023px) {
              .admin-main {
                padding-top: 60px;
              }
            }
        }

        @media (min-width: 1024px) {
          .admin-sidebar {
            position: sticky;
            top: 0;
          }
        }
      `}</style>
    </div>
  )
}