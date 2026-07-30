'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createProductAction, updateProductAction, type ActionResult } from '@/actions/admin'
import { FormField, AdminInput, AdminTextarea, AdminCheckbox } from '@/components/admin/FormField'
import { SubmitButton } from '@/components/admin/SubmitButton'
import { ImageUpload } from '@/components/admin/ImageUpload'
import { Toast } from '@/components/admin/Toast'
import { toSlug } from '@/lib/schemas'
import type { Product } from '@prisma/client'

const SECTION: React.CSSProperties = {
  background: '#0d0d0d',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '12px',
  padding: '24px',
  marginBottom: '20px',
}

const SECTION_TITLE: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.25em',
  color: 'rgba(255,255,255,0.35)',
  marginBottom: '20px',
}

const GRID2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }

const init: ActionResult = { success: false }

export function ProductForm({ product }: { product?: Product }) {
  const isEdit = Boolean(product)
  const action = isEdit ? updateProductAction : createProductAction

  const [state, formAction] = useActionState(action, init)
  const router = useRouter()

  const [name, setName] = useState(product?.name ?? '')
  const [slugVal, setSlugVal] = useState(product?.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(isEdit)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const redirected = useRef(false)

  useEffect(() => {
    if (!slugEdited && name) setSlugVal(toSlug(name))
  }, [name, slugEdited])

  useEffect(() => {
    if (!state.success && !state.errors && !state.message) return
    if (state.success) {
      setToast({ msg: state.message ?? 'Saved', type: 'success' })
      if (!redirected.current) {
        redirected.current = true
        setTimeout(() => router.push('/admin/products'), 1200)
      }
    } else if (state.message && !state.errors) {
      setToast({ msg: state.message, type: 'error' })
    }
  }, [state, router])

  const err = state.errors ?? {}

  return (
    <>
      {toast && <Toast message={toast.msg} type={toast.type} />}

      <form action={formAction}>
        {isEdit && <input type="hidden" name="id" value={product!.id} />}

        {/* Cover image */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Cover Image</p>
          <ImageUpload
            name="coverImage"
            label="Cover image"
            defaultValue={product?.coverImage ?? ''}
            hint="Recommended: 1200×630px, JPG/PNG/WebP, max 5 MB"
          />
        </div>

        {/* Basic */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Basic Information</p>
          <div style={{ display: 'grid', gap: '16px' }}>
            <FormField label="Product name" name="name" error={err.name?.[0]} required>
              <AdminInput
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 4RinChat"
                error={!!err.name}
              />
            </FormField>

            <div style={GRID2}>
              <FormField label="Slug" name="slug" error={err.slug?.[0]} hint="URL identifier" required>
                <AdminInput
                  id="slug"
                  name="slug"
                  value={slugVal}
                  onChange={(e) => { setSlugVal(e.target.value); setSlugEdited(true) }}
                  placeholder="4rinchat"
                  error={!!err.slug}
                />
              </FormField>
              <FormField label="Order" name="order" hint="Lower = shown first">
                <AdminInput id="order" name="order" type="number" min={0} defaultValue={product?.order ?? 0} />
              </FormField>
            </div>

            <FormField label="Tagline" name="tagline" error={err.tagline?.[0]} hint="One-line pitch shown on cards (max 200 chars)" required>
              <AdminInput
                id="tagline"
                name="tagline"
                defaultValue={product?.tagline ?? ''}
                placeholder="The AI-powered customer support platform"
                error={!!err.tagline}
              />
            </FormField>

            <div style={GRID2}>
              <FormField label="Category" name="category" hint="e.g. AI Tool, SaaS, Developer Utility">
                <AdminInput
                  id="category"
                  name="category"
                  defaultValue={product?.category ?? ''}
                  placeholder="AI Tool"
                />
              </FormField>
              <FormField label="Tags" name="tags" hint="Comma-separated">
                <AdminInput
                  id="tags"
                  name="tags"
                  defaultValue={product?.tags?.join(', ') ?? ''}
                  placeholder="AI, SaaS, Chat"
                />
              </FormField>
            </div>

            <FormField label="Full Description" name="description" error={err.description?.[0]} required>
              <AdminTextarea
                id="description"
                name="description"
                defaultValue={product?.description ?? ''}
                placeholder="Detailed description of what this product does, who it's for, and key features…"
                style={{ minHeight: '180px' }}
                error={!!err.description}
              />
            </FormField>
          </div>
        </div>

        {/* Gallery */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Gallery</p>
          <FormField label="Gallery image URLs" name="gallery" hint="Comma-separated URLs of additional screenshots">
            <AdminTextarea
              id="gallery"
              name="gallery"
              defaultValue={product?.gallery?.join(', ') ?? ''}
              placeholder="https://…/screen1.png, https://…/screen2.png"
              style={{ minHeight: '80px' }}
            />
          </FormField>
        </div>

        {/* Links */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Links</p>
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={GRID2}>
              <FormField label="Product URL" name="productUrl" error={err.productUrl?.[0]}>
                <AdminInput
                  id="productUrl"
                  name="productUrl"
                  type="url"
                  defaultValue={product?.productUrl ?? ''}
                  placeholder="https://product.example.com"
                  error={!!err.productUrl}
                />
              </FormField>
              <FormField label="GitHub URL" name="githubUrl" error={err.githubUrl?.[0]}>
                <AdminInput
                  id="githubUrl"
                  name="githubUrl"
                  type="url"
                  defaultValue={product?.githubUrl ?? ''}
                  placeholder="https://github.com/4rinlabs/…"
                  error={!!err.githubUrl}
                />
              </FormField>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Settings</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <AdminCheckbox label="Featured product" name="featured" defaultChecked={product?.featured ?? false} />
            <AdminCheckbox label="Active (visible on site)" name="active" defaultChecked={product?.active ?? true} />
          </div>
        </div>

        {/* SEO */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>SEO</p>
          <div style={{ display: 'grid', gap: '16px' }}>
            <FormField label="SEO Title" name="seoTitle" error={err.seoTitle?.[0]} hint="Max 70 chars">
              <AdminInput id="seoTitle" name="seoTitle" defaultValue={product?.seoTitle ?? ''} />
            </FormField>
            <FormField label="SEO Description" name="seoDescription" error={err.seoDescription?.[0]} hint="Max 160 chars">
              <AdminTextarea
                id="seoDescription"
                name="seoDescription"
                defaultValue={product?.seoDescription ?? ''}
                style={{ minHeight: '80px' }}
              />
            </FormField>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <SubmitButton label={isEdit ? 'Save Changes' : 'Create Product'} />
          <a href="/admin/products" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>
            Cancel
          </a>
        </div>
      </form>
    </>
  )
}
