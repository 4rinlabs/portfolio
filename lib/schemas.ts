import { z } from 'zod'

// ─── Contact ──────────────────────────────────────────────────────────────────

export const ContactSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters.')
    .max(100, 'Name must be 100 characters or fewer.'),
  email: z
    .string()
    .email('Enter a valid email address.')
    .max(254, 'Email must be 254 characters or fewer.'),
  phone: z.string().regex(/^[+]?[\d\s().-]{7,20}$/, 'Enter a valid contact number.'),
  company: z.string().max(100).optional(),
  message: z
    .string()
    .min(10, 'Message must be at least 10 characters.')
    .max(5000, 'Message must be 5000 characters or fewer.'),
})

export type ContactFormData = z.infer<typeof ContactSchema>

// ─── Services ─────────────────────────────────────────────────────────────────

export const ServiceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers and hyphens'),
  shortDescription: z
    .string()
    .min(1, 'Short description is required')
    .max(200, 'Max 200 characters'),
  longDescription: z.string().min(1, 'Description is required'),
  seoTitle: z.string().max(70, 'Max 70 characters').optional().or(z.literal('')),
  seoDescription: z.string().max(160, 'Max 160 characters').optional().or(z.literal('')),
  icon: z.string().optional().or(z.literal('')),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
})

export type ServiceFormData = z.infer<typeof ServiceSchema>

// ─── Portfolio ────────────────────────────────────────────────────────────────

export const PortfolioSchema = z.object({
  title: z.string().min(1, 'Title is required').max(150),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(150)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers and hyphens'),
  description: z.string().min(1, 'Description is required'),
  client: z.string().max(100).optional().or(z.literal('')),
  industry: z.string().max(100).optional().or(z.literal('')),
  technologies: z.string().optional().or(z.literal('')), // comma-separated, transformed
  coverImage: z.string().optional().or(z.literal('')),
  projectUrl: z
    .string()
    .url('Must be a valid URL')
    .optional()
    .or(z.literal('')),
  githubUrl: z
    .string()
    .url('Must be a valid URL')
    .optional()
    .or(z.literal('')),
  featured: z.boolean().default(false),
  order: z.number().int().min(0).default(0),
  seoTitle: z.string().max(70).optional().or(z.literal('')),
  seoDescription: z.string().max(160).optional().or(z.literal('')),
})

export type PortfolioFormData = z.infer<typeof PortfolioSchema>

// ─── Blog ─────────────────────────────────────────────────────────────────────

export const BlogPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers and hyphens'),
  content: z.string().min(1, 'Content is required'),
  excerpt: z.string().max(400, 'Max 400 characters').optional().or(z.literal('')),
  coverImage: z.string().optional().or(z.literal('')),
  tags: z.array(z.string()).default([]),
  published: z.boolean().default(false),
  seoTitle: z.string().max(70).optional().or(z.literal('')),
  seoDescription: z.string().max(160).optional().or(z.literal('')),
  ogImage: z.string().optional().or(z.literal('')),
})

export type BlogPostFormData = z.infer<typeof BlogPostSchema>

// ─── Products ─────────────────────────────────────────────────────────────────

export const ProductSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(150)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers and hyphens'),
  tagline: z.string().min(1, 'Tagline is required').max(200),
  description: z.string().min(1, 'Description is required'),
  coverImage: z.string().optional().or(z.literal('')),
  tags: z.string().optional().or(z.literal('')),       // comma-separated, stored as array
  category: z.string().max(100).optional().or(z.literal('')),
  productUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  githubUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
  seoTitle: z.string().max(70).optional().or(z.literal('')),
  seoDescription: z.string().max(160).optional().or(z.literal('')),
})

export type ProductFormData = z.infer<typeof ProductSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a title to a URL-safe slug */
export function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}
