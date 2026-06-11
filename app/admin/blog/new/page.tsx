import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { BlogPostForm } from '../_components/BlogPostForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'New Blog Post' }

export default async function NewBlogPostPage() {
  const session = await auth()
  if (!session) redirect('/admin/login')

  return (
    <AdminShell email={session.user.email}>
      <div style={{ padding: '40px', maxWidth: '900px' }}>
        <AdminHeader title="New Blog Post" />
        <BlogPostForm />
      </div>
    </AdminShell>
  )
}
