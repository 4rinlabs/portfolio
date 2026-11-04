import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../lib/prisma'
import {
  setSessionForTesting,
  setUserLookupOverrideForTesting,
} from '../lib/auth-guard'
import {
  createBlogPostAction,
  updateBlogPostAction,
  deleteBlogPostAction,
  type ActionResult,
} from '../actions/admin'

async function runPhase3C4Tests() {
  console.log('══════════════════════════════════════════════════════════════════════')
  console.log('  4RINLABS — PHASE 3C.4 CMS BLOG AUTHORIZATION & UI CONSISTENCY TESTS ')
  console.log('══════════════════════════════════════════════════════════════════════\n')

  let passed = 0

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const res = fn()
      if (res && typeof (res as any).then === 'function') {
        return (res as Promise<void>).then(() => {
          console.log(`  ✅ ${name}`)
          passed++
        }).catch((err: any) => {
          console.error(`  ❌ ${name}: ${err.message}`)
          throw err
        })
      }
      console.log(`  ✅ ${name}`)
      passed++
    } catch (err: any) {
      console.error(`  ❌ ${name}: ${err.message}`)
      throw err
    }
  }

  const nowSeconds = Math.floor(Date.now() / 1000)

  const adminSession = {
    user: { id: 'admin-1', role: 'ADMIN', tokenVersion: 1, authTime: nowSeconds },
  }
  const editorSession = {
    user: { id: 'editor-1', role: 'EDITOR', tokenVersion: 1, authTime: nowSeconds },
  }
  const otherEditorSession = {
    user: { id: 'editor-2', role: 'EDITOR', tokenVersion: 1, authTime: nowSeconds },
  }

  // Setup DB user lookup mock
  setUserLookupOverrideForTesting(async (id: string) => {
    if (id === 'admin-1') {
      return { id: 'admin-1', email: 'admin@4rinlabs.com', role: 'ADMIN', tokenVersion: 1 }
    }
    if (id === 'editor-1') {
      return { id: 'editor-1', email: 'editor1@4rinlabs.com', role: 'EDITOR', tokenVersion: 1 }
    }
    if (id === 'editor-2') {
      return { id: 'editor-2', email: 'editor2@4rinlabs.com', role: 'EDITOR', tokenVersion: 1 }
    }
    return null
  })

  // In-memory mock database for blog posts
  type MockBlogPost = {
    id: string
    title: string
    slug: string
    content: string
    excerpt: string | null
    coverImage: string | null
    tags: string[]
    published: boolean
    publishedAt: Date | null
    authorId: string | null
    seoTitle: string | null
    seoDescription: string | null
    ogImage: string | null
    readingTime: number | null
  }

  let nextId = 1
  let mockPosts: MockBlogPost[] = []
  let deletedIds: string[] = []

  // Override Prisma blogPost methods
  const origFindUnique = prisma.blogPost.findUnique
  const origFindFirst = prisma.blogPost.findFirst
  const origCreate = prisma.blogPost.create
  const origUpdate = prisma.blogPost.update
  const origDelete = prisma.blogPost.delete

  ;(prisma.blogPost as any).findUnique = async ({ where }: any) => {
    if (where.id) return mockPosts.find((p) => p.id === where.id) || null
    if (where.slug) return mockPosts.find((p) => p.slug === where.slug) || null
    return null
  }

  ;(prisma.blogPost as any).findFirst = async ({ where }: any) => {
    return (
      mockPosts.find((p) => {
        if (where.slug && p.slug !== where.slug) return false
        if (where.NOT?.id && p.id === where.NOT.id) return false
        return true
      }) || null
    )
  }

  ;(prisma.blogPost as any).create = async ({ data }: any) => {
    const post: MockBlogPost = {
      id: `post-${nextId++}`,
      title: data.title,
      slug: data.slug,
      content: data.content,
      excerpt: data.excerpt ?? null,
      coverImage: data.coverImage ?? null,
      tags: data.tags ?? [],
      published: data.published ?? false,
      publishedAt: data.publishedAt ?? null,
      authorId: data.authorId ?? null,
      seoTitle: data.seoTitle ?? null,
      seoDescription: data.seoDescription ?? null,
      ogImage: data.ogImage ?? null,
      readingTime: data.readingTime ?? null,
    }
    mockPosts.push(post)
    return post
  }

  ;(prisma.blogPost as any).update = async ({ where, data }: any) => {
    const post = mockPosts.find((p) => p.id === where.id)
    if (!post) throw new Error('Record not found')
    Object.assign(post, data)
    return post
  }

  ;(prisma.blogPost as any).delete = async ({ where }: any) => {
    const idx = mockPosts.findIndex((p) => p.id === where.id)
    if (idx === -1) throw new Error('Record not found')
    const deleted = mockPosts.splice(idx, 1)[0]
    deletedIds.push(deleted.id)
    return { slug: deleted.slug }
  }

  try {
    console.log('--- 1. ADMIN Blog Operations ---')

    await test('ADMIN can create blog post (records admin as author)', async () => {
      setSessionForTesting(adminSession)
      const fd = new FormData()
      fd.set('title', 'Admin Post 1')
      fd.set('slug', 'admin-post-1')
      fd.set('content', '# Content by admin')
      fd.set('published', 'false')

      const res = await createBlogPostAction({ success: false }, fd)
      assert.strictEqual(res.success, true)
      const created = mockPosts.find((p) => p.slug === 'admin-post-1')
      assert(created, 'Post must be created in DB')
      assert.strictEqual(created?.authorId, 'admin-1', 'authorId must match admin user id')
      assert.strictEqual(created?.published, false)
    })

    await test('ADMIN can publish a draft post', async () => {
      setSessionForTesting(adminSession)
      const post = mockPosts.find((p) => p.slug === 'admin-post-1')!
      const fd = new FormData()
      fd.set('id', post.id)
      fd.set('title', post.title)
      fd.set('slug', post.slug)
      fd.set('content', post.content)
      fd.set('published', 'true')

      const res = await updateBlogPostAction({ success: false }, fd)
      assert.strictEqual(res.success, true)
      assert.strictEqual(post.published, true)
      assert(post.publishedAt instanceof Date, 'publishedAt must be set')
    })

    await test('ADMIN can unpublish a post', async () => {
      setSessionForTesting(adminSession)
      const post = mockPosts.find((p) => p.slug === 'admin-post-1')!
      const fd = new FormData()
      fd.set('id', post.id)
      fd.set('title', post.title)
      fd.set('slug', post.slug)
      fd.set('content', post.content)
      fd.set('published', 'false')

      const res = await updateBlogPostAction({ success: false }, fd)
      assert.strictEqual(res.success, true)
      assert.strictEqual(post.published, false)
    })

    await test('ADMIN can delete blog post', async () => {
      setSessionForTesting(adminSession)
      const post = mockPosts.find((p) => p.slug === 'admin-post-1')!
      const fd = new FormData()
      fd.set('id', post.id)

      await deleteBlogPostAction(fd)
      assert(deletedIds.includes(post.id), 'Post must be recorded as deleted')
      assert(!mockPosts.some((p) => p.id === post.id), 'Post must be removed from mock store')
    })

    console.log('\n--- 2. EDITOR Blog Creation & Editing Operations ---')

    await test('EDITOR can create blog post (records editor as author)', async () => {
      setSessionForTesting(editorSession)
      const fd = new FormData()
      fd.set('title', 'Editor Post 1')
      fd.set('slug', 'editor-post-1')
      fd.set('content', '# Content by editor')
      fd.set('published', 'false')

      const res = await createBlogPostAction({ success: false }, fd)
      assert.strictEqual(res.success, true)
      const created = mockPosts.find((p) => p.slug === 'editor-post-1')
      assert(created, 'Post must be created in DB')
      assert.strictEqual(created?.authorId, 'editor-1', 'authorId must match editor user id')
    })

    await test('EDITOR can publish their own post', async () => {
      setSessionForTesting(editorSession)
      const post = mockPosts.find((p) => p.slug === 'editor-post-1')!
      const fd = new FormData()
      fd.set('id', post.id)
      fd.set('title', post.title)
      fd.set('slug', post.slug)
      fd.set('content', post.content)
      fd.set('published', 'true')

      const res = await updateBlogPostAction({ success: false }, fd)
      assert.strictEqual(res.success, true)
      assert.strictEqual(post.published, true)
    })

    await test('EDITOR can unpublish their own post', async () => {
      setSessionForTesting(editorSession)
      const post = mockPosts.find((p) => p.slug === 'editor-post-1')!
      const fd = new FormData()
      fd.set('id', post.id)
      fd.set('title', post.title)
      fd.set('slug', post.slug)
      fd.set('content', post.content)
      fd.set('published', 'false')

      const res = await updateBlogPostAction({ success: false }, fd)
      assert.strictEqual(res.success, true)
      assert.strictEqual(post.published, false)
    })

    console.log("\n--- 3. EDITOR Editing Another Author's Post & Author Preservation ---')")

    let postByEditor2: MockBlogPost

    await test('EDITOR 2 creates post (records editor-2 as author)', async () => {
      setSessionForTesting(otherEditorSession)
      const fd = new FormData()
      fd.set('title', 'Editor 2 Post')
      fd.set('slug', 'editor-2-post')
      fd.set('content', '# Original content by editor 2')
      fd.set('published', 'false')

      const res = await createBlogPostAction({ success: false }, fd)
      assert.strictEqual(res.success, true)
      postByEditor2 = mockPosts.find((p) => p.slug === 'editor-2-post')!
      assert.strictEqual(postByEditor2.authorId, 'editor-2')
    })

    await test("EDITOR 1 can edit EDITOR 2's post without restriction", async () => {
      setSessionForTesting(editorSession) // editor-1 editing editor-2 post
      const fd = new FormData()
      fd.set('id', postByEditor2.id)
      fd.set('title', 'Editor 2 Post - Revised by Editor 1')
      fd.set('slug', postByEditor2.slug)
      fd.set('content', '# Revised content by editor 1')
      fd.set('published', 'true')

      const res = await updateBlogPostAction({ success: false }, fd)
      assert.strictEqual(res.success, true)
      assert.strictEqual(postByEditor2.title, 'Editor 2 Post - Revised by Editor 1')
      assert.strictEqual(postByEditor2.content, '# Revised content by editor 1')
      assert.strictEqual(postByEditor2.published, true)
    })

    await test("Author ID is strictly preserved after EDITOR 1 edits EDITOR 2's post", () => {
      assert.strictEqual(
        postByEditor2.authorId,
        'editor-2',
        'authorId must remain editor-2 even after editor-1 modified the post'
      )
    })

    await test('Spoofed authorId in update FormData is completely ignored', async () => {
      setSessionForTesting(editorSession)
      const fd = new FormData()
      fd.set('id', postByEditor2.id)
      fd.set('title', postByEditor2.title)
      fd.set('slug', postByEditor2.slug)
      fd.set('content', postByEditor2.content)
      fd.set('published', 'true')
      fd.set('authorId', 'malicious-attacker-id') // Malicious injection attempt

      const res = await updateBlogPostAction({ success: false }, fd)
      assert.strictEqual(res.success, true)
      assert.strictEqual(
        postByEditor2.authorId,
        'editor-2',
        'Injected authorId must have zero effect on stored post'
      )
    })

    console.log('\n--- 4. EDITOR Deletion Protection (Server-Side Enforced) ---')

    await test('EDITOR cannot delete their own blog post (rejected with Forbidden)', async () => {
      setSessionForTesting(editorSession)
      const post = mockPosts.find((p) => p.slug === 'editor-post-1')!
      const fd = new FormData()
      fd.set('id', post.id)

      let rejected = false
      try {
        await deleteBlogPostAction(fd)
      } catch (err: any) {
        rejected = true
        assert(err.message.includes('Forbidden') || err.message.includes('Administrator privileges required'))
      }

      assert(rejected, 'deleteBlogPostAction must throw error for EDITOR caller')
      assert(!deletedIds.includes(post.id), 'Post must NOT be deleted from DB')
      assert(mockPosts.some((p) => p.id === post.id), 'Post must still exist in mock store')
    })

    await test("EDITOR cannot delete another user's blog post (rejected with Forbidden)", async () => {
      setSessionForTesting(editorSession)
      const fd = new FormData()
      fd.set('id', postByEditor2.id)

      let rejected = false
      try {
        await deleteBlogPostAction(fd)
      } catch (err: any) {
        rejected = true
        assert(err.message.includes('Forbidden') || err.message.includes('Administrator privileges required'))
      }

      assert(rejected, 'deleteBlogPostAction must throw error for EDITOR caller')
      assert(!deletedIds.includes(postByEditor2.id), 'Post must NOT be deleted from DB')
      assert(mockPosts.some((p) => p.id === postByEditor2.id), 'Post must still exist in mock store')
    })

    console.log('\n--- 5. UI Consistency & Role Gating Inspection ---')

    const blogListPage = fs.readFileSync(path.join(process.cwd(), 'app', 'admin', 'blog', 'page.tsx'), 'utf8')
    const blogEditPage = fs.readFileSync(path.join(process.cwd(), 'app', 'admin', 'blog', '[id]', 'edit', 'page.tsx'), 'utf8')
    const blogFormComponent = fs.readFileSync(path.join(process.cwd(), 'app', 'admin', 'blog', '_components', 'BlogPostForm.tsx'), 'utf8')

    test('UI deletion form is conditionally gated on user.role === ADMIN', () => {
      assert(
        blogListPage.includes("user.role === 'ADMIN'"),
        'Blog list page must conditionally render delete button based on user.role === ADMIN'
      )
      assert(
        blogListPage.includes('<form action={deleteBlogPostAction}>'),
        'Blog list page must contain delete form'
      )
    })

    test('UI edit link is available to all authenticated CMS users (ADMIN & EDITOR)', () => {
      assert(
        blogListPage.includes("href={`/admin/blog/${post.id}/edit`}"),
        'Edit link must be rendered for posts'
      )
    })

    test('UI new post button is available to all authenticated CMS users', () => {
      assert(
        blogListPage.includes("action={{ href: '/admin/blog/new', label: '+ New Post' }}"),
        'New post action button must be rendered in header'
      )
    })

    test('BlogPostForm displays immutable Author badge when editing', () => {
      assert(
        blogFormComponent.includes('{isEdit && ('),
        'BlogPostForm must check isEdit'
      )
      assert(
        blogFormComponent.includes('(Preserved)'),
        'BlogPostForm must display (Preserved) author indicator'
      )
    })

    test('BlogPostForm has NO authorId input field (authorship cannot be reassigned in UI)', () => {
      assert(
        !blogFormComponent.includes('name="authorId"'),
        'BlogPostForm must NOT contain any authorId form input'
      )
    })

    test('Blog edit page retrieves authorLabel and passes to form', () => {
      assert(
        blogEditPage.includes('authorLabel'),
        'Edit page must load authorLabel'
      )
      assert(
        blogEditPage.includes('<BlogPostForm post={post} authorLabel={authorLabel} />'),
        'Edit page must pass authorLabel to BlogPostForm'
      )
    })

    test('Blog list page displays author name when present', () => {
      assert(
        blogListPage.includes('authorMap'),
        'Blog list page must construct authorMap'
      )
      assert(
        blogListPage.includes('by ${authorMap.get(post.authorId)}'),
        'Blog list page must render author name'
      )
    })
  } finally {
    // Restore Prisma methods
    ;(prisma.blogPost as any).findUnique = origFindUnique
    ;(prisma.blogPost as any).findFirst = origFindFirst
    ;(prisma.blogPost as any).create = origCreate
    ;(prisma.blogPost as any).update = origUpdate
    ;(prisma.blogPost as any).delete = origDelete
    setSessionForTesting(undefined)
    setUserLookupOverrideForTesting(null)
  }

  console.log('\n══════════════════════════════════════════════════════════════════════')
  console.log(`Phase 3C.4 Tests Summary: ${passed}/${passed} Passed (0 Failed)`)
  console.log('══════════════════════════════════════════════════════════════════════\n')
}

runPhase3C4Tests().catch((err) => {
  console.error('Test suite failed:', err)
  process.exit(1)
})
