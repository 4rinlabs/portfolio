import { prisma } from '@/lib/prisma'
import { ProductsSectionClient } from './ProductsSectionClient'

export async function ProductsSection() {
  let products: {
    id: string
    name: string
    slug: string
    tagline: string
    coverImage: string
    tags: string[]
    category: string | null
    productUrl: string | null
    featured: boolean
  }[] = []

  try {
    products = await prisma.product.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        slug: true,
        tagline: true,
        coverImage: true,
        tags: true,
        category: true,
        productUrl: true,
        featured: true,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    })
  } catch {
    // DB unavailable — render empty state
  }

  if (products.length === 0) return null

  return <ProductsSectionClient products={products} />
}
