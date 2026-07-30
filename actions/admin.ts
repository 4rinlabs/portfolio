'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { ServiceSchema, PortfolioSchema, BlogPostSchema, ProductSchema } from '@/lib/schemas'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// ─── Auth guard ───────────────────────────────────────────────────────────────


async function requireAuth() {
  const session = await auth()
  if (!session) redirect('/admin/login')
  return session
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
  await requireAuth()

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

  // Check slug uniqueness
  const existing = await prisma.service.findUnique({ where: { slug: parsed.data.slug } })
  if (existing) {
    return { success: false, errors: { slug: ['This slug is already in use'] } }
  }

  const service = await prisma.service.create({ data: parsed.data })
  revalidatePath('/services')
  revalidatePath('/admin/services')
  return { success: true, message: 'Service created', id: service.id }
}

export async function updateServiceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAuth()

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

  const existing = await prisma.service.findFirst({
    where: { slug: parsed.data.slug, NOT: { id } },
  })
  if (existing) {
    return { success: false, errors: { slug: ['This slug is already in use'] } }
  }

  await prisma.service.update({ where: { id }, data: parsed.data })
  revalidatePath('/services')
  revalidatePath(`/services/${parsed.data.slug}`)
  revalidatePath('/admin/services')
  return { success: true, message: 'Service updated' }
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  await requireAuth()
  const id = formData.get('id') as string
  if (!id) return
  const svc = await prisma.service.findUnique({ where: { id }, select: { slug: true } })
  await prisma.service.delete({ where: { id } })
  revalidatePath('/services')
  if (svc) revalidatePath(`/services/${svc.slug}`)
  revalidatePath('/admin/services')
}

export async function toggleServiceActiveAction(formData: FormData): Promise<void> {
  await requireAuth()
  const id = formData.get('id') as string
  const active = formData.get('active') === 'true'
  await prisma.service.update({ where: { id }, data: { active: !active } })
  revalidatePath('/admin/services')
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export async function createPortfolioAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAuth()

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

  revalidatePath('/portfolio')
  revalidatePath('/admin/portfolio')
  return { success: true, message: 'Project created', id: project.id }
}

export async function updatePortfolioAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAuth()

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

  revalidatePath('/portfolio')
  revalidatePath(`/portfolio/${parsed.data.slug}`)
  revalidatePath('/admin/portfolio')
  return { success: true, message: 'Project updated' }
}

export async function deletePortfolioAction(formData: FormData): Promise<void> {
  await requireAuth()
  const id = formData.get('id') as string
  if (!id) return
  const p = await prisma.portfolio.findUnique({ where: { id }, select: { slug: true } })
  await prisma.portfolio.delete({ where: { id } })
  revalidatePath('/portfolio')
  if (p) revalidatePath(`/portfolio/${p.slug}`)
  revalidatePath('/admin/portfolio')
}

// ─── Blog ─────────────────────────────────────────────────────────────────────

export async function createBlogPostAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAuth()

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
      authorId: session.user.id,
      seoTitle: parsed.data.seoTitle || null,
      seoDescription: parsed.data.seoDescription || null,
      ogImage: parsed.data.ogImage || null,
      readingTime,
    },
  })

  revalidatePath('/blog')
  revalidatePath('/admin/blog')
  return { success: true, message: 'Post created', id: post.id }
}

export async function updateBlogPostAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAuth()

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
      // Only set publishedAt when first publishing
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

  revalidatePath('/blog')
  revalidatePath(`/blog/${parsed.data.slug}`)
  revalidatePath('/admin/blog')
  return { success: true, message: 'Post updated' }
}

export async function deleteBlogPostAction(formData: FormData): Promise<void> {
  await requireAuth()
  const id = formData.get('id') as string
  if (!id) return
  const p = await prisma.blogPost.findUnique({ where: { id }, select: { slug: true } })
  await prisma.blogPost.delete({ where: { id } })
  revalidatePath('/blog')
  if (p) revalidatePath(`/blog/${p.slug}`)
  revalidatePath('/admin/blog')
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function createProductAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAuth()

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

  revalidatePath('/products')
  revalidatePath('/')
  revalidatePath('/admin/products')
  return { success: true, message: 'Product created', id: product.id }
}

export async function updateProductAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAuth()

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

  revalidatePath('/products')
  revalidatePath(`/products/${parsed.data.slug}`)
  revalidatePath('/')
  revalidatePath('/admin/products')
  return { success: true, message: 'Product updated' }
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  await requireAuth()
  const id = formData.get('id') as string
  if (!id) return
  const p = await prisma.product.findUnique({ where: { id }, select: { slug: true } })
  await prisma.product.delete({ where: { id } })
  revalidatePath('/products')
  if (p) revalidatePath(`/products/${p.slug}`)
  revalidatePath('/')
  revalidatePath('/admin/products')
}

export async function toggleProductActiveAction(formData: FormData): Promise<void> {
  await requireAuth()
  const id = formData.get('id') as string
  const active = formData.get('active') === 'true'
  await prisma.product.update({ where: { id }, data: { active: !active } })
  revalidatePath('/admin/products')
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function markLeadReadAction(formData: FormData): Promise<void> {
  await requireAuth()
  const id = formData.get('id') as string
  if (!id) return
  await prisma.contactLead.update({ where: { id }, data: { read: true } })
  revalidatePath('/admin/leads')
}

export async function markLeadUnreadAction(formData: FormData): Promise<void> {
  await requireAuth()
  const id = formData.get('id') as string
  if (!id) return
  await prisma.contactLead.update({ where: { id }, data: { read: false } })
  revalidatePath('/admin/leads')
}

export async function deleteLeadAction(formData: FormData): Promise<void> {
  await requireAuth()
  const id = formData.get('id') as string
  if (!id) return
  await prisma.contactLead.delete({ where: { id } })
  revalidatePath('/admin/leads')
}

// ─── Legacy aliases (keep old imports working) ────────────────────────────────
