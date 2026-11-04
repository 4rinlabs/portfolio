import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireAdminOrEditor } from '@/lib/auth-guard'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { ServiceForm } from '../../_components/ServiceForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Edit Service' }

type Props = { params: Promise<{ id: string }> }

export default async function EditServicePage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/admin/login')

  let user
  try {
    user = await requireAdminOrEditor(session)
  } catch {
    redirect('/admin/login')
  }

  const { id } = await params
  const service = await prisma.service.findUnique({ where: { id } })
  if (!service) notFound()

  return (
    <AdminShell email={user.email} role={user.role}>
      <div style={{ padding: '40px', maxWidth: '780px' }}>
        <AdminHeader title={`Edit: ${service.name}`} />
        <ServiceForm service={service} />
      </div>
    </AdminShell>
  )
}
