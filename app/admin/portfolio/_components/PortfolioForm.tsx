'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortfolioAction, updatePortfolioAction, type ActionResult } from '@/actions/admin'
import { FormField, AdminInput, AdminTextarea, AdminCheckbox } from '@/components/admin/FormField'
import { SubmitButton } from '@/components/admin/SubmitButton'
import { ImageUpload } from '@/components/admin/ImageUpload'
import { Toast } from '@/components/admin/Toast'
import { toSlug } from '@/lib/schemas'
import type { Portfolio } from '@prisma/client'

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

interface PortfolioFormProps {
  project?: Portfolio
}

export function PortfolioForm({ project }: PortfolioFormProps) {
  const isEdit = Boolean(project)
  const action = isEdit ? updatePortfolioAction : createPortfolioAction

  const [state, formAction] = useActionState(action, init)
  const router = useRouter()

  const [title, setTitle] = useState(project?.title ?? '')
  const [slugVal, setSlugVal] = useState(project?.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(isEdit)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const redirected = useRef(false)

  useEffect(() => {
    if (!slugEdited && title) setSlugVal(toSlug(title))
  }, [title, slugEdited])

  useEffect(() => {
    if (!state.success && !state.errors && !state.message) return
    if (state.success) {
      setToast({ msg: state.message ?? 'Saved', type: 'success' })
      if (!redirected.current) {
        redirected.current = true
        setTimeout(() => router.push('/admin/portfolio'), 1200)
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
        {isEdit && <input type="hidden" name="id" value={project!.id} />}

        {/* Cover image */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Cover Image</p>
          <ImageUpload
            name="coverImage"
            label="Cover image"
            defaultValue={project?.coverImage}
            hint="Recommended: 1200×630px, JPG/PNG/WebP, max 5 MB"
          />
        </div>

        {/* Basic */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Basic Information</p>
          <div style={{ display: 'grid', gap: '16px' }}>
            <FormField label="Project title" name="title" error={err.title?.[0]} required>
              <AdminInput
                id="title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="FYS Clothing"
                error={!!err.title}
              />
            </FormField>

            <div style={GRID2}>
              <FormField label="Slug" name="slug" error={err.slug?.[0]} hint="URL identifier" required>
                <AdminInput
                  id="slug"
                  name="slug"
                  value={slugVal}
                  onChange={(e) => { setSlugVal(e.target.value); setSlugEdited(true) }}
                  placeholder="fys-clothing"
                  error={!!err.slug}
                />
              </FormField>
              <FormField label="Order" name="order">
                <AdminInput id="order" name="order" type="number" min={0} defaultValue={project?.order ?? 0} />
              </FormField>
            </div>

            <FormField label="Description" name="description" error={err.description?.[0]} required>
              <AdminTextarea
                id="description"
                name="description"
                defaultValue={project?.description ?? ''}
                placeholder="Premium fashion storefront…"
                style={{ minHeight: '100px' }}
                error={!!err.description}
              />
            </FormField>

            <div style={GRID2}>
              <FormField label="Client" name="client">
                <AdminInput id="client" name="client" defaultValue={project?.client ?? ''} placeholder="FYS Clothing" />
              </FormField>
              <FormField label="Industry" name="industry">
                <AdminInput id="industry" name="industry" defaultValue={project?.industry ?? ''} placeholder="E-Commerce / Fashion" />
              </FormField>
            </div>

            <FormField
              label="Technologies"
              name="technologies"
              hint="Comma-separated: Next.js, Tailwind CSS, TypeScript"
            >
              <AdminInput
                id="technologies"
                name="technologies"
                defaultValue={project?.technologies?.join(', ') ?? ''}
                placeholder="Next.js, Tailwind CSS, TypeScript"
              />
            </FormField>
          </div>
        </div>

        {/* Links */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Links</p>
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={GRID2}>
              <FormField label="Live URL" name="projectUrl" error={err.projectUrl?.[0]}>
                <AdminInput
                  id="projectUrl"
                  name="projectUrl"
                  type="url"
                  defaultValue={project?.projectUrl ?? ''}
                  placeholder="https://example.com"
                  error={!!err.projectUrl}
                />
              </FormField>
              <FormField label="GitHub URL" name="githubUrl" error={err.githubUrl?.[0]}>
                <AdminInput
                  id="githubUrl"
                  name="githubUrl"
                  type="url"
                  defaultValue={project?.githubUrl ?? ''}
                  placeholder="https://github.com/…"
                  error={!!err.githubUrl}
                />
              </FormField>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Settings</p>
          <AdminCheckbox label="Featured project" name="featured" defaultChecked={project?.featured ?? false} />
        </div>

        {/* SEO */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>SEO</p>
          <div style={{ display: 'grid', gap: '16px' }}>
            <FormField label="SEO Title" name="seoTitle" error={err.seoTitle?.[0]} hint="Max 70 chars">
              <AdminInput id="seoTitle" name="seoTitle" defaultValue={project?.seoTitle ?? ''} />
            </FormField>
            <FormField label="SEO Description" name="seoDescription" error={err.seoDescription?.[0]} hint="Max 160 chars">
              <AdminTextarea
                id="seoDescription"
                name="seoDescription"
                defaultValue={project?.seoDescription ?? ''}
                style={{ minHeight: '80px' }}
              />
            </FormField>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <SubmitButton label={isEdit ? 'Save Changes' : 'Create Project'} />
          <a href="/admin/portfolio" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>
            Cancel
          </a>
        </div>
      </form>
    </>
  )
}
