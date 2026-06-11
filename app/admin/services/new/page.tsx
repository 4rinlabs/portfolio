import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { ServiceForm } from '../_components/ServiceForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'New Service' }

export default async function NewServicePage() {
  const session = await auth()
  if (!session) redirect('/admin/login')

  return (
    <AdminShell email={session.user.email}>
      <div style={{ padding: '40px', maxWidth: '780px' }}>
        <AdminHeader title="New Service" />
        <ServiceForm />
      </div>
    </AdminShell>
  )
}
