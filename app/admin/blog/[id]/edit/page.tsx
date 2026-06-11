import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { BlogPostForm } from '../../_components/BlogPostForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Edit Post' }

type Props = { params: Promise<{ id: string }> }

export default async function EditBlogPostPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/admin/login')

  const { id } = await params
  const post = await prisma.blogPost.findUnique({ where: { id } })
  if (!post) notFound()

  return (
    <AdminShell email={session.user.email}>
      <div style={{ padding: '40px', maxWidth: '900px' }}>
        <AdminHeader title={`Edit: ${post.title}`} />
        <BlogPostForm post={post} />
      </div>
    </AdminShell>
  )
}
