import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { deleteProductAction, toggleProductActiveAction } from '@/actions/admin'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminHeader } from '@/components/admin/AdminHeader'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Products' }
export const dynamic = 'force-dynamic'

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/admin/login')

  const { q } = await searchParams

  let products: {
    id: string
    name: string
    slug: string
    tagline: string
    coverImage: string
    category: string | null
    featured: boolean
    active: boolean
    order: number
    tags: string[]
  }[] = []

  try {
    products = await prisma.product.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: {
        id: true,
        name: true,
        slug: true,
        tagline: true,
        coverImage: true,
        category: true,
        featured: true,
        active: true,
        order: true,
        tags: true,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    })
  } catch {
    /* DB not connected */
  }

  return (
    <AdminShell email={session.user.email}>
      <div style={{ padding: 'clamp(16px, 4vw, 40px)' }}>
        <AdminHeader
          title="Products"
          subtitle={`${products.length} product${products.length !== 1 ? 's' : ''}`}
          action={{ href: '/admin/products/new', label: '+ New Product' }}
        >
          <form method="GET" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search…"
              style={{
                flex: '1 1 100%',
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Search
            </button>
          </form>
        </AdminHeader>

        {products.length === 0 ? (
          <div style={{ border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '16px', padding: '80px', textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', marginBottom: '16px' }}>
              {q ? `No products matching "${q}"` : 'No products yet'}
            </p>
            {!q && (
              <Link href="/admin/products/new" style={{ display: 'inline-block', padding: '10px 20px', background: '#7fff00', borderRadius: '8px', color: '#0a0a0a', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
                Add your first product
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {products.map((product) => (
              <div
                key={product.id}
                style={{
                  background: '#0a0a0a',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  opacity: product.active ? 1 : 0.55,
                }}
              >
                {/* Thumbnail */}
                <div style={{ position: 'relative', aspectRatio: '16/9', background: '#141414' }}>
                  {product.coverImage ? (
                    <Image
                      src={product.coverImage}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="340px"
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <span style={{ fontFamily: 'Syne, system-ui', fontSize: '48px', fontWeight: 800, color: 'rgba(127,255,0,0.15)' }}>
                        {product.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  {product.featured && (
                    <span style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(127,255,0,0.9)', color: '#0a0a0a', borderRadius: '999px', padding: '3px 10px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                      Featured
                    </span>
                  )}
                  {!product.active && (
                    <span style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,0,0,0.7)', color: 'rgba(255,255,255,0.5)', borderRadius: '999px', padding: '3px 10px', fontSize: '10px', fontWeight: 700 }}>
                      Inactive
                    </span>
                  )}
                </div>

                {/* Meta */}
                <div style={{ padding: '16px 18px' }}>
                  {product.category && (
                    <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(127,255,0,0.7)', marginBottom: '4px' }}>
                      {product.category}
                    </p>
                  )}
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#fff', margin: 0, fontFamily: 'Syne, system-ui' }}>
                    {product.name}
                  </p>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '3px', lineHeight: 1.5 }}>
                    {product.tagline.length > 80 ? product.tagline.slice(0, 80) + '…' : product.tagline}
                  </p>
                  {product.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px' }}>
                      {product.tags.slice(0, 3).map((t) => (
                        <span key={t} style={{ background: 'rgba(127,255,0,0.06)', color: 'rgba(127,255,0,0.7)', borderRadius: '4px', padding: '2px 7px', fontSize: '10px' }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      style={{ flex: 1, textAlign: 'center', padding: '7px 0', background: 'rgba(127,255,0,0.08)', border: '1px solid rgba(127,255,0,0.2)', borderRadius: '8px', color: '#7fff00', fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}
                    >
                      Edit
                    </Link>
                    <form action={toggleProductActiveAction}>
                      <input type="hidden" name="id" value={product.id} />
                      <input type="hidden" name="active" value={String(product.active)} />
                      <button type="submit" style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '11px', cursor: 'pointer' }}>
                        {product.active ? 'Hide' : 'Show'}
                      </button>
                    </form>
                    <Link
                      href={`/products/${product.slug}`}
                      target="_blank"
                      style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: 'rgba(255,255,255,0.45)', fontSize: '11px', textDecoration: 'none' }}
                    >
                      ↗
                    </Link>
                    <form action={deleteProductAction}>
                      <input type="hidden" name="id" value={product.id} />
                      <button type="submit" style={{ padding: '7px 12px', background: 'rgba(255,50,50,0.08)', border: '1px solid rgba(255,50,50,0.2)', borderRadius: '8px', color: 'rgba(255,100,100,0.8)', fontSize: '11px', cursor: 'pointer' }}>
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
