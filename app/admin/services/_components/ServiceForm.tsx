'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createServiceAction, updateServiceAction, type ActionResult } from '@/actions/admin'
import { FormField, AdminInput, AdminTextarea, AdminCheckbox } from '@/components/admin/FormField'
import { SubmitButton } from '@/components/admin/SubmitButton'
import { Toast } from '@/components/admin/Toast'
import { toSlug } from '@/lib/schemas'
import type { Service } from '@prisma/client'

const SECTION = {
  background: '#0d0d0d',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '12px',
  padding: '24px',
  marginBottom: '20px',
}

const SECTION_TITLE = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.25em',
  color: 'rgba(255,255,255,0.35)',
  marginBottom: '20px',
}

const GRID2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '16px',
}

const init: ActionResult = { success: false }

interface ServiceFormProps {
  service?: Service
}

export function ServiceForm({ service }: ServiceFormProps) {
  const isEdit = Boolean(service)
  const action = isEdit ? updateServiceAction : createServiceAction

  const [state, formAction] = useActionState(action, init)
  const router = useRouter()
  const [name, setName] = useState(service?.name ?? '')
  const [slugVal, setSlugVal] = useState(service?.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(isEdit)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const redirected = useRef(false)

  // Auto-slug from name
  useEffect(() => {
    if (!slugEdited && name) {
      setSlugVal(toSlug(name))
    }
  }, [name, slugEdited])

  // Handle result
  useEffect(() => {
    if (!state.success && !state.errors && !state.message) return
    if (state.success) {
      setToast({ msg: state.message ?? 'Saved', type: 'success' })
      if (!redirected.current) {
        redirected.current = true
        setTimeout(() => router.push('/admin/services'), 1200)
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
        {isEdit && <input type="hidden" name="id" value={service!.id} />}

        {/* Basic info */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Basic Information</p>
          <div style={{ display: 'grid', gap: '16px' }}>
            <FormField label="Service name" name="name" error={err.name?.[0]} required>
              <AdminInput
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. AI Development"
                error={!!err.name}
              />
            </FormField>

            <div style={GRID2}>
              <FormField
                label="Slug"
                name="slug"
                error={err.slug?.[0]}
                hint="URL-safe identifier, auto-generated from name"
                required
              >
                <AdminInput
                  id="slug"
                  name="slug"
                  value={slugVal}
                  onChange={(e) => { setSlugVal(e.target.value); setSlugEdited(true) }}
                  placeholder="ai-development"
                  error={!!err.slug}
                />
              </FormField>

              <FormField label="Order" name="order" hint="Lower = shown first">
                <AdminInput
                  id="order"
                  name="order"
                  type="number"
                  min={0}
                  defaultValue={service?.order ?? 0}
                />
              </FormField>
            </div>

            <FormField
              label="Short Description"
              name="shortDescription"
              error={err.shortDescription?.[0]}
              hint="Shown in service cards (max 200 chars)"
              required
            >
              <AdminTextarea
                id="shortDescription"
                name="shortDescription"
                defaultValue={service?.shortDescription ?? ''}
                placeholder="Brief one-line description…"
                style={{ minHeight: '80px' }}
                error={!!err.shortDescription}
              />
            </FormField>

            <FormField
              label="Full Description"
              name="longDescription"
              error={err.longDescription?.[0]}
              hint="Detailed description shown on the service page"
              required
            >
              <AdminTextarea
                id="longDescription"
                name="longDescription"
                defaultValue={service?.longDescription ?? ''}
                placeholder="Full service description…"
                style={{ minHeight: '200px' }}
                error={!!err.longDescription}
              />
            </FormField>

            <FormField label="Icon" name="icon" hint="Icon name or emoji (e.g. brain, 🤖)">
              <AdminInput
                id="icon"
                name="icon"
                defaultValue={service?.icon ?? ''}
                placeholder="brain"
              />
            </FormField>
          </div>
        </div>

        {/* Flags */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Settings</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <AdminCheckbox
              label="Featured service"
              name="featured"
              defaultChecked={service?.featured ?? false}
            />
            <AdminCheckbox
              label="Active (visible on site)"
              name="active"
              defaultChecked={service?.active ?? true}
            />
          </div>
        </div>

        {/* SEO */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>SEO</p>
          <div style={{ display: 'grid', gap: '16px' }}>
            <FormField
              label="SEO Title"
              name="seoTitle"
              error={err.seoTitle?.[0]}
              hint="Overrides default title tag (max 70 chars)"
            >
              <AdminInput
                id="seoTitle"
                name="seoTitle"
                defaultValue={service?.seoTitle ?? ''}
                placeholder="AI Development Company | 4RinLabs"
              />
            </FormField>
            <FormField
              label="SEO Description"
              name="seoDescription"
              error={err.seoDescription?.[0]}
              hint="Meta description (max 160 chars)"
            >
              <AdminTextarea
                id="seoDescription"
                name="seoDescription"
                defaultValue={service?.seoDescription ?? ''}
                placeholder="We build custom AI solutions…"
                style={{ minHeight: '80px' }}
              />
            </FormField>
          </div>
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <SubmitButton label={isEdit ? 'Save Changes' : 'Create Service'} />
          <a
            href="/admin/services"
            style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}
          >
            Cancel
          </a>
        </div>
      </form>
    </>
  )
}
