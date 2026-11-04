import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { requireAdminOrEditor } from '@/lib/auth-guard'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { ProductForm } from '../_components/ProductForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'New Product' }

export default async function NewProductPage() {
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
      <div style={{ padding: 'clamp(16px, 4vw, 40px)', maxWidth: '860px' }}>
        <AdminHeader title="New Product" />
        <ProductForm />
      </div>
    </AdminShell>
  )
}
