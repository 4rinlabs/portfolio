'use server'

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ServiceSchema, PortfolioSchema, BlogPostSchema, ProductSchema } from '@/lib/schemas'
import { revalidatePath } from 'next/cache'
import { requireAdmin, requireAdminOrEditor, requireAuthenticatedUser } from '@/lib/auth-guard'
import bcrypt from 'bcryptjs'
import { handleMutationError, isPrismaRecordNotFoundError } from '@/lib/db-errors'

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path)
  } catch {
    // Non-fatal if invoked outside an active Next.js static generation context (e.g. tests)
  }
}

// ─── Result type ──────────────────────────────────────────────────────────────

export type ActionResult = {
  success: boolean
  message?: string
  errors?: Record<string, string[]>
  id?: string
}

// ─── Services ─────────────────────────────────────────────────────────────────

export async function createServiceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdminOrEditor()
  } catch (err: any) {
    return { success: false, message: err?.message || 'Unauthorized' }
  }

  const raw = {
    name: formData.get('name') as string,
    slug: formData.get('slug') as string,
    shortDescription: formData.get('shortDescription') as string,
    longDescription: formData.get('longDescription') as string,
    seoTitle: (formData.get('seoTitle') as string) || undefined,
    seoDescription: (formData.get('seoDescription') as string) || undefined,
    icon: (formData.get('icon') as string) || undefined,
    featured: formData.get('featured') === 'true',
    active: formData.get('active') !== 'false',
    order: Number(formData.get('order') ?? 0),
  }

  const parsed = ServiceSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    // Check slug uniqueness
    const existing = await prisma.service.findUnique({ where: { slug: parsed.data.slug } })
    if (existing) {
      return { success: false, errors: { slug: ['This slug is already in use'] } }
    }

    const service = await prisma.service.create({ data: parsed.data })
    safeRevalidatePath('/services')
    safeRevalidatePath('/admin/services')
    return { success: true, message: 'Service created', id: service.id }
  } catch (err) {
    return handleMutationError(err, 'Service')
  }
}

export async function updateServiceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdminOrEditor()
  } catch (err: any) {
    return { success: false, message: err?.message || 'Unauthorized' }
  }

  const id = formData.get('id') as string
  if (!id) return { success: false, message: 'Missing ID' }

  const raw = {
    name: formData.get('name') as string,
    slug: formData.get('slug') as string,
    shortDescription: formData.get('shortDescription') as string,
    longDescription: formData.get('longDescription') as string,
    seoTitle: (formData.get('seoTitle') as string) || undefined,
    seoDescription: (formData.get('seoDescription') as string) || undefined,
    icon: (formData.get('icon') as string) || undefined,
    featured: formData.get('featured') === 'true',
    active: formData.get('active') !== 'false',
    order: Number(formData.get('order') ?? 0),
  }

  const parsed = ServiceSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const existing = await prisma.service.findFirst({
      where: { slug: parsed.data.slug, NOT: { id } },
    })
    if (existing) {
      return { success: false, errors: { slug: ['This slug is already in use'] } }
    }

    await prisma.service.update({ where: { id }, data: parsed.data })
    safeRevalidatePath('/services')
    safeRevalidatePath(`/services/${parsed.data.slug}`)
    safeRevalidatePath('/admin/services')
    return { success: true, message: 'Service updated' }
  } catch (err) {
    return handleMutationError(err, 'Service')
  }
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const id = formData.get('id') as string
  if (!id) return

  try {
    const svc = await prisma.service.delete({
      where: { id },
      select: { slug: true },
    })
    safeRevalidatePath('/services')
    if (svc?.slug) safeRevalidatePath(`/services/${svc.slug}`)
    safeRevalidatePath('/admin/services')
  } catch (err) {
    if (isPrismaRecordNotFoundError(err)) {
      // Idempotent: record already deleted
      safeRevalidatePath('/services')
      safeRevalidatePath('/admin/services')
      return
    }
    console.error('deleteServiceAction database error:', err)
  }
}

export async function toggleServiceActiveAction(formData: FormData): Promise<void> {
  await requireAdminOrEditor()
  const id = formData.get('id') as string
  if (!id) return
  const active = formData.get('active') === 'true'

  try {
    await prisma.service.update({ where: { id }, data: { active: !active } })
    safeRevalidatePath('/admin/services')
  } catch (err) {
    if (isPrismaRecordNotFoundError(err)) {
      safeRevalidatePath('/admin/services')
      return
    }
    console.error('toggleServiceActiveAction database error:', err)
  }
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export async function createPortfolioAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdminOrEditor()
  } catch (err: any) {
    return { success: false, message: err?.message || 'Unauthorized' }
  }

  const technologiesRaw = (formData.get('technologies') as string) ?? ''
  const technologies = technologiesRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const galleryRaw = (formData.get('gallery') as string) ?? ''
  const gallery = galleryRaw
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)

  const raw = {
    title: formData.get('title') as string,
    slug: formData.get('slug') as string,
    description: formData.get('description') as string,
    client: (formData.get('client') as string) || undefined,
    industry: (formData.get('industry') as string) || undefined,
    technologies: technologiesRaw,
    coverImage: (formData.get('coverImage') as string) || undefined,
    projectUrl: (formData.get('projectUrl') as string) || undefined,
    githubUrl: (formData.get('githubUrl') as string) || undefined,
    featured: formData.get('featured') === 'true',
    order: Number(formData.get('order') ?? 0),
    seoTitle: (formData.get('seoTitle') as string) || undefined,
    seoDescription: (formData.get('seoDescription') as string) || undefined,
  }

  const parsed = PortfolioSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const existing = await prisma.portfolio.findUnique({ where: { slug: parsed.data.slug } })
    if (existing) {
      return { success: false, errors: { slug: ['This slug is already in use'] } }
    }

    const project = await prisma.portfolio.create({
      data: {
        title: parsed.data.title,
        slug: parsed.data.slug,
        description: parsed.data.description,
        client: parsed.data.client || null,
        industry: parsed.data.industry || null,
        technologies,
        gallery,
        coverImage: parsed.data.coverImage || '/portfolio/project-one.png',
        projectUrl: parsed.data.projectUrl || null,
        githubUrl: parsed.data.githubUrl || null,
        featured: parsed.data.featured,
        order: parsed.data.order,
        seoTitle: parsed.data.seoTitle || null,
        seoDescription: parsed.data.seoDescription || null,
      },
    })

    safeRevalidatePath('/portfolio')
    safeRevalidatePath('/admin/portfolio')
    return { success: true, message: 'Project created', id: project.id }
  } catch (err) {
    return handleMutationError(err, 'Project')
  }
}

export async function updatePortfolioAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdminOrEditor()
  } catch (err: any) {
    return { success: false, message: err?.message || 'Unauthorized' }
  }

  const id = formData.get('id') as string
  if (!id) return { success: false, message: 'Missing ID' }

  const technologiesRaw = (formData.get('technologies') as string) ?? ''
  const technologies = technologiesRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const galleryRaw = (formData.get('gallery') as string) ?? ''
  const gallery = galleryRaw
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)

  const raw = {
    title: formData.get('title') as string,
    slug: formData.get('slug') as string,
    description: formData.get('description') as string,
    client: (formData.get('client') as string) || undefined,
    industry: (formData.get('industry') as string) || undefined,
    technologies: technologiesRaw,
    coverImage: (formData.get('coverImage') as string) || undefined,
    projectUrl: (formData.get('projectUrl') as string) || undefined,
    githubUrl: (formData.get('githubUrl') as string) || undefined,
    featured: formData.get('featured') === 'true',
    order: Number(formData.get('order') ?? 0),
    seoTitle: (formData.get('seoTitle') as string) || undefined,
    seoDescription: (formData.get('seoDescription') as string) || undefined,
  }

  const parsed = PortfolioSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const existing = await prisma.portfolio.findFirst({
      where: { slug: parsed.data.slug, NOT: { id } },
    })
    if (existing) {
      return { success: false, errors: { slug: ['This slug is already in use'] } }
    }

    await prisma.portfolio.update({
      where: { id },
      data: {
        title: parsed.data.title,
        slug: parsed.data.slug,
        description: parsed.data.description,
        client: parsed.data.client || null,
        industry: parsed.data.industry || null,
        technologies,
        gallery,
        coverImage: parsed.data.coverImage || '/portfolio/project-one.png',
        projectUrl: parsed.data.projectUrl || null,
        githubUrl: parsed.data.githubUrl || null,
        featured: parsed.data.featured,
        order: parsed.data.order,
        seoTitle: parsed.data.seoTitle || null,
        seoDescription: parsed.data.seoDescription || null,
      },
    })

    safeRevalidatePath('/portfolio')
    safeRevalidatePath(`/portfolio/${parsed.data.slug}`)
    safeRevalidatePath('/admin/portfolio')
    return { success: true, message: 'Project updated' }
  } catch (err) {
    return handleMutationError(err, 'Project')
  }
}

export async function deletePortfolioAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const id = formData.get('id') as string
  if (!id) return

  try {
    const p = await prisma.portfolio.delete({
      where: { id },
      select: { slug: true },
    })
    safeRevalidatePath('/portfolio')
    if (p?.slug) safeRevalidatePath(`/portfolio/${p.slug}`)
    safeRevalidatePath('/admin/portfolio')
  } catch (err) {
    if (isPrismaRecordNotFoundError(err)) {
      safeRevalidatePath('/portfolio')
      safeRevalidatePath('/admin/portfolio')
      return
    }
    console.error('deletePortfolioAction database error:', err)
  }
}

// ─── Blog ─────────────────────────────────────────────────────────────────────

export async function createBlogPostAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let user
  try {
    user = await requireAdminOrEditor()
  } catch (err: any) {
    return { success: false, message: err?.message || 'Unauthorized' }
  }

  const tagsRaw = (formData.get('tags') as string) ?? ''
  const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
  const published = formData.get('published') === 'true'

  const raw = {
    title: formData.get('title') as string,
    slug: formData.get('slug') as string,
    content: formData.get('content') as string,
    excerpt: (formData.get('excerpt') as string) || undefined,
    coverImage: (formData.get('coverImage') as string) || undefined,
    tags,
    published,
    seoTitle: (formData.get('seoTitle') as string) || undefined,
    seoDescription: (formData.get('seoDescription') as string) || undefined,
    ogImage: (formData.get('ogImage') as string) || undefined,
  }

  const parsed = BlogPostSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const existing = await prisma.blogPost.findUnique({ where: { slug: parsed.data.slug } })
    if (existing) {
      return { success: false, errors: { slug: ['This slug is already in use'] } }
    }

    // Estimate reading time (avg 200 wpm)
    const wordCount = parsed.data.content.trim().split(/\s+/).length
    const readingTime = Math.max(1, Math.round(wordCount / 200))

    const post = await prisma.blogPost.create({
      data: {
        title: parsed.data.title,
        slug: parsed.data.slug,
        content: parsed.data.content,
        excerpt: parsed.data.excerpt || null,
        coverImage: parsed.data.coverImage || null,
        tags: parsed.data.tags,
        published: parsed.data.published,
        publishedAt: parsed.data.published ? new Date() : null,
        authorId: user.id,
        seoTitle: parsed.data.seoTitle || null,
        seoDescription: parsed.data.seoDescription || null,
        ogImage: parsed.data.ogImage || null,
        readingTime,
      },
    })

    safeRevalidatePath('/blog')
    safeRevalidatePath('/admin/blog')
    return { success: true, message: 'Post created', id: post.id }
  } catch (err) {
    return handleMutationError(err, 'Blog post')
  }
}

export async function updateBlogPostAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdminOrEditor()
  } catch (err: any) {
    return { success: false, message: err?.message || 'Unauthorized' }
  }

  const id = formData.get('id') as string
  if (!id) return { success: false, message: 'Missing ID' }

  const tagsRaw = (formData.get('tags') as string) ?? ''
  const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
  const published = formData.get('published') === 'true'

  const raw = {
    title: formData.get('title') as string,
    slug: formData.get('slug') as string,
    content: formData.get('content') as string,
    excerpt: (formData.get('excerpt') as string) || undefined,
    coverImage: (formData.get('coverImage') as string) || undefined,
    tags,
    published,
    seoTitle: (formData.get('seoTitle') as string) || undefined,
    seoDescription: (formData.get('seoDescription') as string) || undefined,
    ogImage: (formData.get('ogImage') as string) || undefined,
  }

  const parsed = BlogPostSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const existing = await prisma.blogPost.findFirst({
      where: { slug: parsed.data.slug, NOT: { id } },
    })
    if (existing) {
      return { success: false, errors: { slug: ['This slug is already in use'] } }
    }

    const current = await prisma.blogPost.findUnique({
      where: { id },
      select: { published: true, publishedAt: true },
    })

    const wordCount = parsed.data.content.trim().split(/\s+/).length
    const readingTime = Math.max(1, Math.round(wordCount / 200))

    await prisma.blogPost.update({
      where: { id },
      data: {
        title: parsed.data.title,
        slug: parsed.data.slug,
        content: parsed.data.content,
        excerpt: parsed.data.excerpt || null,
        coverImage: parsed.data.coverImage || null,
        tags: parsed.data.tags,
        published: parsed.data.published,
        publishedAt:
          parsed.data.published && !current?.publishedAt
            ? new Date()
            : current?.publishedAt ?? null,
        seoTitle: parsed.data.seoTitle || null,
        seoDescription: parsed.data.seoDescription || null,
        ogImage: parsed.data.ogImage || null,
        readingTime,
      },
    })

    safeRevalidatePath('/blog')
    safeRevalidatePath(`/blog/${parsed.data.slug}`)
    safeRevalidatePath('/admin/blog')
    return { success: true, message: 'Post updated' }
  } catch (err) {
    return handleMutationError(err, 'Blog post')
  }
}

export async function deleteBlogPostAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const id = formData.get('id') as string
  if (!id) return

  try {
    const p = await prisma.blogPost.delete({
      where: { id },
      select: { slug: true },
    })
    safeRevalidatePath('/blog')
    if (p?.slug) safeRevalidatePath(`/blog/${p.slug}`)
    safeRevalidatePath('/admin/blog')
  } catch (err) {
    if (isPrismaRecordNotFoundError(err)) {
      safeRevalidatePath('/blog')
      safeRevalidatePath('/admin/blog')
      return
    }
    console.error('deleteBlogPostAction database error:', err)
  }
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function createProductAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdminOrEditor()
  } catch (err: any) {
    return { success: false, message: err?.message || 'Unauthorized' }
  }

  const tagsRaw = (formData.get('tags') as string) ?? ''
  const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)

  const galleryRaw = (formData.get('gallery') as string) ?? ''
  const gallery = galleryRaw.split(',').map((g) => g.trim()).filter(Boolean)

  const raw = {
    name: formData.get('name') as string,
    slug: formData.get('slug') as string,
    tagline: formData.get('tagline') as string,
    description: formData.get('description') as string,
    coverImage: (formData.get('coverImage') as string) || undefined,
    tags: tagsRaw,
    category: (formData.get('category') as string) || undefined,
    productUrl: (formData.get('productUrl') as string) || undefined,
    githubUrl: (formData.get('githubUrl') as string) || undefined,
    featured: formData.get('featured') === 'true',
    active: formData.get('active') !== 'false',
    order: Number(formData.get('order') ?? 0),
    seoTitle: (formData.get('seoTitle') as string) || undefined,
    seoDescription: (formData.get('seoDescription') as string) || undefined,
  }

  const parsed = ProductSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const existing = await prisma.product.findUnique({ where: { slug: parsed.data.slug } })
    if (existing) {
      return { success: false, errors: { slug: ['This slug is already in use'] } }
    }

    const product = await prisma.product.create({
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        tagline: parsed.data.tagline,
        description: parsed.data.description,
        coverImage: parsed.data.coverImage || '',
        gallery,
        tags,
        category: parsed.data.category || null,
        productUrl: parsed.data.productUrl || null,
        githubUrl: parsed.data.githubUrl || null,
        featured: parsed.data.featured,
        active: parsed.data.active,
        order: parsed.data.order,
        seoTitle: parsed.data.seoTitle || null,
        seoDescription: parsed.data.seoDescription || null,
      },
    })

    safeRevalidatePath('/products')
    safeRevalidatePath('/')
    safeRevalidatePath('/admin/products')
    return { success: true, message: 'Product created', id: product.id }
  } catch (err) {
    return handleMutationError(err, 'Product')
  }
}

export async function updateProductAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdminOrEditor()
  } catch (err: any) {
    return { success: false, message: err?.message || 'Unauthorized' }
  }

  const id = formData.get('id') as string
  if (!id) return { success: false, message: 'Missing ID' }

  const tagsRaw = (formData.get('tags') as string) ?? ''
  const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)

  const galleryRaw = (formData.get('gallery') as string) ?? ''
  const gallery = galleryRaw.split(',').map((g) => g.trim()).filter(Boolean)

  const raw = {
    name: formData.get('name') as string,
    slug: formData.get('slug') as string,
    tagline: formData.get('tagline') as string,
    description: formData.get('description') as string,
    coverImage: (formData.get('coverImage') as string) || undefined,
    tags: tagsRaw,
    category: (formData.get('category') as string) || undefined,
    productUrl: (formData.get('productUrl') as string) || undefined,
    githubUrl: (formData.get('githubUrl') as string) || undefined,
    featured: formData.get('featured') === 'true',
    active: formData.get('active') !== 'false',
    order: Number(formData.get('order') ?? 0),
    seoTitle: (formData.get('seoTitle') as string) || undefined,
    seoDescription: (formData.get('seoDescription') as string) || undefined,
  }

  const parsed = ProductSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const existing = await prisma.product.findFirst({
      where: { slug: parsed.data.slug, NOT: { id } },
    })
    if (existing) {
      return { success: false, errors: { slug: ['This slug is already in use'] } }
    }

    await prisma.product.update({
      where: { id },
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        tagline: parsed.data.tagline,
        description: parsed.data.description,
        coverImage: parsed.data.coverImage || '',
        gallery,
        tags,
        category: parsed.data.category || null,
        productUrl: parsed.data.productUrl || null,
        githubUrl: parsed.data.githubUrl || null,
        featured: parsed.data.featured,
        active: parsed.data.active,
        order: parsed.data.order,
        seoTitle: parsed.data.seoTitle || null,
        seoDescription: parsed.data.seoDescription || null,
      },
    })

    safeRevalidatePath('/products')
    safeRevalidatePath(`/products/${parsed.data.slug}`)
    safeRevalidatePath('/')
    safeRevalidatePath('/admin/products')
    return { success: true, message: 'Product updated' }
  } catch (err) {
    return handleMutationError(err, 'Product')
  }
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const id = formData.get('id') as string
  if (!id) return

  try {
    const p = await prisma.product.delete({
      where: { id },
      select: { slug: true },
    })
    safeRevalidatePath('/products')
    if (p?.slug) safeRevalidatePath(`/products/${p.slug}`)
    safeRevalidatePath('/')
    safeRevalidatePath('/admin/products')
  } catch (err) {
    if (isPrismaRecordNotFoundError(err)) {
      safeRevalidatePath('/products')
      safeRevalidatePath('/admin/products')
      return
    }
    console.error('deleteProductAction database error:', err)
  }
}

export async function toggleProductActiveAction(formData: FormData): Promise<void> {
  await requireAdminOrEditor()
  const id = formData.get('id') as string
  if (!id) return
  const active = formData.get('active') === 'true'

  try {
    await prisma.product.update({ where: { id }, data: { active: !active } })
    safeRevalidatePath('/admin/products')
  } catch (err) {
    if (isPrismaRecordNotFoundError(err)) {
      safeRevalidatePath('/admin/products')
      return
    }
    console.error('toggleProductActiveAction database error:', err)
  }
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function markLeadReadAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const id = formData.get('id') as string
  if (!id) return

  try {
    await prisma.contactLead.update({ where: { id }, data: { read: true } })
    safeRevalidatePath('/admin/leads')
  } catch (err) {
    if (isPrismaRecordNotFoundError(err)) {
      safeRevalidatePath('/admin/leads')
      return
    }
    console.error('markLeadReadAction database error:', err)
  }
}

export async function markLeadUnreadAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const id = formData.get('id') as string
  if (!id) return

  try {
    await prisma.contactLead.update({ where: { id }, data: { read: false } })
    safeRevalidatePath('/admin/leads')
  } catch (err) {
    if (isPrismaRecordNotFoundError(err)) {
      safeRevalidatePath('/admin/leads')
      return
    }
    console.error('markLeadUnreadAction database error:', err)
  }
}

export async function deleteLeadAction(formData: FormData): Promise<void> {
  await requireAdmin()
  const id = formData.get('id') as string
  if (!id) return

  try {
    await prisma.contactLead.delete({ where: { id } })
    safeRevalidatePath('/admin/leads')
  } catch (err) {
    if (isPrismaRecordNotFoundError(err)) {
      safeRevalidatePath('/admin/leads')
      return
    }
    console.error('deleteLeadAction database error:', err)
  }
}

// ─── Account & Session Revocation ─────────────────────────────────────────────

export async function changePasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let currentUser
  try {
    currentUser = await requireAuthenticatedUser()
  } catch (err: any) {
    return { success: false, message: err?.message || 'Unauthorized' }
  }

  const targetUserId = (formData.get('targetUserId') as string) || currentUser.id
  const currentPassword = (formData.get('currentPassword') as string) || ''
  const newPassword = (formData.get('newPassword') as string) || ''
  const confirmPassword = (formData.get('confirmPassword') as string) || ''

  // 1. Authorization: Only ADMIN can change another user's credentials
  const isSelfChange = targetUserId === currentUser.id
  if (!isSelfChange && currentUser.role !== 'ADMIN') {
    return { success: false, message: 'Forbidden: Insufficient privileges to modify another user credentials' }
  }

  // 2. Validate current password for self-service password changes
  if (isSelfChange) {
    if (!currentPassword) {
      return {
        success: false,
        errors: { currentPassword: ['Current password is required.'] },
      }
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, password: true },
    })

    if (!dbUser || !dbUser.password) {
      return { success: false, message: 'User account not found.' }
    }

    const matches = await bcrypt.compare(currentPassword, dbUser.password)
    if (!matches) {
      return {
        success: false,
        errors: { currentPassword: ['Current password is incorrect.'] },
      }
    }
  }

  // 3. Validate new password strength and matching
  if (!newPassword || newPassword.length < 8) {
    return {
      success: false,
      errors: { newPassword: ['New password must be at least 8 characters in length.'] },
    }
  }

  if (newPassword !== confirmPassword) {
    return {
      success: false,
      errors: { confirmPassword: ['Password confirmation does not match.'] },
    }
  }

  if (isSelfChange && currentPassword === newPassword) {
    return {
      success: false,
      errors: { newPassword: ['New password cannot be the same as your current password.'] },
    }
  }

  // 4. Hash new password and increment tokenVersion atomically
  const hashedPassword = await bcrypt.hash(newPassword, 12)

  try {
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        password: hashedPassword,
        tokenVersion: { increment: 1 },
      },
    })
    return {
      success: true,
      message: 'Password successfully updated. All prior sessions have been revoked.',
    }
  } catch (err) {
    return handleMutationError(err, 'User')
  }
}

export async function revokeUserSessionsAction(formData: FormData): Promise<ActionResult> {
  let currentUser
  try {
    currentUser = await requireAdmin()
  } catch (err: any) {
    return { success: false, message: err?.message || 'Unauthorized' }
  }

  const targetUserId = formData.get('userId') as string
  if (!targetUserId) {
    return { success: false, message: 'Missing user ID' }
  }

  try {
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        tokenVersion: { increment: 1 },
      },
    })
    return {
      success: true,
      message: 'User sessions successfully revoked.',
    }
  } catch (err) {
    return handleMutationError(err, 'User')
  }
}

