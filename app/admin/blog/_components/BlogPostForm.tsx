'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBlogPostAction, updateBlogPostAction, type ActionResult } from '@/actions/admin'
import { FormField, AdminInput, AdminTextarea } from '@/components/admin/FormField'
import { SubmitButton } from '@/components/admin/SubmitButton'
import { ImageUpload } from '@/components/admin/ImageUpload'
import { Toast } from '@/components/admin/Toast'
import { toSlug } from '@/lib/schemas'
import type { BlogPost } from '@prisma/client'

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

interface BlogPostFormProps {
  post?: BlogPost
}

export function BlogPostForm({ post }: BlogPostFormProps) {
  const isEdit = Boolean(post)
  const action = isEdit ? updateBlogPostAction : createBlogPostAction

  const [state, formAction] = useActionState(action, init)
  const router = useRouter()

  const [title, setTitle] = useState(post?.title ?? '')
  const [slugVal, setSlugVal] = useState(post?.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(isEdit)
  const [published, setPublished] = useState(post?.published ?? false)
  const [content, setContent] = useState(post?.content ?? '')
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
        setTimeout(() => router.push('/admin/blog'), 1200)
      }
    } else if (state.message && !state.errors) {
      setToast({ msg: state.message, type: 'error' })
    }
  }, [state, router])

  const err = state.errors ?? {}

  // Word count
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length
  const readingTime = Math.max(1, Math.round(wordCount / 200))

  return (
    <>
      {toast && <Toast message={toast.msg} type={toast.type} />}

      <form action={formAction}>
        {isEdit && <input type="hidden" name="id" value={post!.id} />}
        {/* Published is set via the checkbox, but we need a hidden input as the "false" case */}
        <input type="hidden" name="published" value={published ? 'true' : 'false'} />

        {/* Cover */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Cover Image</p>
          <ImageUpload
            name="coverImage"
            label="Cover image"
            defaultValue={post?.coverImage ?? ''}
            hint="Recommended 1200×630px · max 5 MB"
          />
        </div>

        {/* Meta */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Post Info</p>
          <div style={{ display: 'grid', gap: '16px' }}>
            <FormField label="Title" name="title" error={err.title?.[0]} required>
              <AdminInput
                id="title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="How We Built an AI Agent in 72 Hours"
                error={!!err.title}
              />
            </FormField>

            <div style={GRID2}>
              <FormField label="Slug" name="slug" error={err.slug?.[0]} hint="URL path" required>
                <AdminInput
                  id="slug"
                  name="slug"
                  value={slugVal}
                  onChange={(e) => { setSlugVal(e.target.value); setSlugEdited(true) }}
                  placeholder="how-we-built-an-ai-agent"
                  error={!!err.slug}
                />
              </FormField>

              <FormField label="Tags" name="tags" hint="Comma-separated">
                <AdminInput
                  id="tags"
                  name="tags"
                  defaultValue={post?.tags?.join(', ') ?? ''}
                  placeholder="AI, SaaS, Next.js"
                />
              </FormField>
            </div>

            <FormField label="Excerpt" name="excerpt" error={err.excerpt?.[0]} hint="Short summary shown in listings (max 400 chars)">
              <AdminTextarea
                id="excerpt"
                name="excerpt"
                defaultValue={post?.excerpt ?? ''}
                placeholder="A brief summary…"
                style={{ minHeight: '80px' }}
              />
            </FormField>
          </div>
        </div>

        {/* Content editor */}
        <div style={SECTION}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ ...SECTION_TITLE, marginBottom: 0 }}>Content</p>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
              {wordCount.toLocaleString()} words · ~{readingTime} min read
            </span>
          </div>
          <FormField label="Content (Markdown)" name="content" error={err.content?.[0]} required>
            <AdminTextarea
              id="content"
              name="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`# Heading\n\nStart writing your post here…\n\nUse **bold**, *italic*, \`code\`, and standard Markdown syntax.`}
              style={{ minHeight: '480px', fontFamily: 'monospace', fontSize: '14px', lineHeight: 1.6 }}
              error={!!err.content}
            />
          </FormField>

          {/* Markdown quick reference */}
          <div
            style={{
              marginTop: '10px',
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '8px',
              fontSize: '11px',
              color: 'rgba(255,255,255,0.3)',
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            {['# Heading', '**bold**', '*italic*', '`code`', '```block```', '[link](url)', '![img](url)', '> quote', '- list'].map((s) => (
              <code key={s} style={{ fontFamily: 'monospace' }}>{s}</code>
            ))}
          </div>
        </div>

        {/* Publish settings */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>Publish Settings</p>
          <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                onClick={() => setPublished((p) => !p)}
                style={{
                  width: '44px',
                  height: '24px',
                  borderRadius: '999px',
                  background: published ? '#7fff00' : 'rgba(255,255,255,0.12)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '3px',
                    left: published ? '23px' : '3px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: published ? '#0a0a0a' : 'rgba(255,255,255,0.5)',
                    transition: 'left 0.2s',
                  }}
                />
              </div>
              <span style={{ fontSize: '13px', color: published ? '#7fff00' : 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                {published ? 'Published' : 'Draft'}
              </span>
            </div>
            {post?.publishedAt && (
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
                First published {new Date(post.publishedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* SEO */}
        <div style={SECTION}>
          <p style={SECTION_TITLE}>SEO</p>
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={GRID2}>
              <FormField label="SEO Title" name="seoTitle" error={err.seoTitle?.[0]} hint="Max 70 chars">
                <AdminInput id="seoTitle" name="seoTitle" defaultValue={post?.seoTitle ?? ''} />
              </FormField>
              <FormField label="OG Image URL" name="ogImage" hint="Falls back to cover image">
                <AdminInput id="ogImage" name="ogImage" defaultValue={post?.ogImage ?? ''} placeholder="https://…" />
              </FormField>
            </div>
            <FormField label="SEO Description" name="seoDescription" error={err.seoDescription?.[0]} hint="Max 160 chars">
              <AdminTextarea
                id="seoDescription"
                name="seoDescription"
                defaultValue={post?.seoDescription ?? ''}
                style={{ minHeight: '70px' }}
              />
            </FormField>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <SubmitButton label={isEdit ? 'Save Changes' : 'Create Post'} />
          <a href="/admin/blog" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>
            Cancel
          </a>
        </div>
      </form>
    </>
  )
}
