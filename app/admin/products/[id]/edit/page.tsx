import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { ProductForm } from '../../_components/ProductForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Edit Product' }

type Props = { params: Promise<{ id: string }> }

export default async function EditProductPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/admin/login')

  const { id } = await params
  const product = await prisma.product.findUnique({ where: { id } })
  if (!product) notFound()

  return (
    <AdminShell email={session.user.email}>
      <div style={{ padding: 'clamp(16px, 4vw, 40px)', maxWidth: '860px' }}>
        <AdminHeader title={`Edit: ${product.name}`} />
        <ProductForm product={product} />
      </div>
    </AdminShell>
  )
}
