import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireAdminOrEditor } from '@/lib/auth-guard'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { BlogPostForm } from '../../_components/BlogPostForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Edit Post' }

type Props = { params: Promise<{ id: string }> }

export default async function EditBlogPostPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/admin/login')

  let user
  try {
    user = await requireAdminOrEditor(session)
  } catch {
    redirect('/admin/login')
  }

  const { id } = await params
  const post = await prisma.blogPost.findUnique({ where: { id } })
  if (!post) notFound()

  let authorLabel: string | null = null
  if (post.authorId) {
    try {
      const authorUser = await prisma.user.findUnique({
        where: { id: post.authorId },
        select: { name: true, email: true },
      })
      authorLabel = authorUser?.name || authorUser?.email || null
    } catch {
      /* DB fallback */
    }
  }

  return (
    <AdminShell email={user.email} role={user.role}>
      <div style={{ padding: '40px', maxWidth: '900px' }}>
        <AdminHeader title={`Edit: ${post.title}`} />
        <BlogPostForm post={post} authorLabel={authorLabel} />
      </div>
    </AdminShell>
  )
}
