import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Admin | 4RinLabs',
    template: '%s | 4RinLabs Admin',
  },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#050505',
        color: '#ffffff',
        fontFamily: 'DM Sans, system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  )
}
