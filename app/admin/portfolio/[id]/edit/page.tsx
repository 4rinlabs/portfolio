import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { PortfolioForm } from '../../_components/PortfolioForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Edit Project' }

type Props = { params: Promise<{ id: string }> }

export default async function EditPortfolioPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/admin/login')

  const { id } = await params
  const project = await prisma.portfolio.findUnique({ where: { id } })
  if (!project) notFound()

  return (
    <AdminShell email={session.user.email}>
      <div style={{ padding: '40px', maxWidth: '860px' }}>
        <AdminHeader title={`Edit: ${project.title}`} />
        <PortfolioForm project={project} />
      </div>
    </AdminShell>
  )
}
