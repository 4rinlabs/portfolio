import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { requireAdminOrEditor } from '@/lib/auth-guard'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { ServiceForm } from '../_components/ServiceForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'New Service' }

export default async function NewServicePage() {
  const session = await auth()
  if (!session) redirect('/admin/login')

  let user
  try {
    user = await requireAdminOrEditor(session)
  } catch {
    redirect('/admin/login')
  }

  return (
    <AdminShell email={user.email} role={user.role}>
      <div style={{ padding: '40px', maxWidth: '780px' }}>
        <AdminHeader title="New Service" />
        <ServiceForm />
      </div>
    </AdminShell>
  )
}
