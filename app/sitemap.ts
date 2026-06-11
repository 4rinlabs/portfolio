import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.4rinlabs.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/services`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/portfolio`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/case-studies`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ]

  // Dynamic service routes
  let serviceRoutes: MetadataRoute.Sitemap = []
  try {
    const services = await prisma.service.findMany({ select: { slug: true, updatedAt: true } })
    serviceRoutes = services.map((s: { slug: string; updatedAt: Date }) => ({
      url: `${SITE_URL}/services/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    }))
  } catch {
    // DB not available during build
  }

  // Dynamic portfolio routes
  let portfolioRoutes: MetadataRoute.Sitemap = []
  try {
    const projects = await prisma.portfolio.findMany({ select: { slug: true, updatedAt: true } })
    portfolioRoutes = projects.map((p: { slug: string; updatedAt: Date }) => ({
      url: `${SITE_URL}/portfolio/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }))
  } catch {
    // DB not available during build
  }

  // Dynamic blog routes
  let blogRoutes: MetadataRoute.Sitemap = []
  try {
    const posts = await prisma.blogPost.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
    })
    blogRoutes = posts.map((p: { slug: string; updatedAt: Date }) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))
  } catch {
    // DB not available during build
  }

  return [...staticRoutes, ...serviceRoutes, ...portfolioRoutes, ...blogRoutes]
}
