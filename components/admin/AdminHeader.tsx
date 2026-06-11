import Link from 'next/link'
import type { ReactNode } from 'react'

interface AdminHeaderProps {
  title: string
  subtitle?: string
  action?: { href: string; label: string }
  children?: ReactNode
}

export function AdminHeader({
  title,
  subtitle,
  action,
  children,
}: AdminHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        marginBottom: '32px',
      }}
    >
      {/* Title */}
      <div>
        <h1
          style={{
            fontFamily: 'Syne, system-ui',
            fontSize: '26px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            color: '#fff',
            margin: 0,
          }}
        >
          {title}
        </h1>

        {subtitle && (
          <p
            style={{
              marginTop: '6px',
              fontSize: '13px',
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '10px',
          width: '100%',
        }}
      >
        {children}

        {action && (
          <Link
            href={action.href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 20px',
              background: '#7fff00',
              borderRadius: '8px',
              color: '#0a0a0a',
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {action.label}
          </Link>
        )}
      </div>
    </div>
  )
}