import { signIn } from '@/auth'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Login' }

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const params = await searchParams

  async function loginAction(formData: FormData) {
    'use server'
    try {
      await signIn('credentials', {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        redirectTo: params.callbackUrl ?? '/admin',
      })
    } catch (error) {
      if (error instanceof AuthError) {
        redirect(`/admin/login?error=InvalidCredentials`)
      }
      throw error
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '40px',
        }}
      >
        <p
          style={{
            fontFamily: 'Syne, system-ui, sans-serif',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.3em',
            color: '#7fff00',
            marginBottom: '8px',
          }}
        >
          Admin
        </p>
        <h1
          style={{
            fontFamily: 'Syne, system-ui, sans-serif',
            fontSize: '28px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            color: '#ffffff',
            margin: '0 0 32px',
          }}
        >
          4RinLabs
        </h1>

        <form action={loginAction} style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label
              htmlFor="email"
              style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '12px',
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '12px',
                padding: '12px 16px',
                color: '#ffffff',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              marginTop: '8px',
              background: 'transparent',
              border: '1px solid rgba(127,255,0,0.7)',
              borderRadius: '999px',
              padding: '14px 24px',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s',
            }}
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  )
}
