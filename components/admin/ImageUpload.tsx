'use client'

import { useRef, useState } from 'react'

interface ImageUploadProps {
  name: string
  label: string
  defaultValue?: string
  bucket?: string
  hint?: string
}

export function ImageUpload({ name, label, defaultValue, hint }: ImageUploadProps) {
  const [preview, setPreview] = useState<string>(defaultValue ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  // Hidden input stores the final URL submitted with the form
  const [url, setUrl] = useState(defaultValue ?? '')

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB.')
      return
    }
    setError('')
    setUploading(true)

    // Create a local preview immediately
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)

    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      const { url: uploaded } = (await res.json()) as { url: string }
      setUrl(uploaded)
      setPreview(uploaded)
    } catch {
      setError('Upload failed. Please try again.')
      setPreview(defaultValue ?? '')
      setUrl(defaultValue ?? '')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: 'rgba(255,255,255,0.5)',
          marginBottom: '8px',
        }}
      >
        {label}
      </label>

      {/* Hidden input that gets submitted */}
      <input type="hidden" name={name} value={url} />

      <div
        style={{
          border: '1px dashed rgba(255,255,255,0.15)',
          borderRadius: '10px',
          overflow: 'hidden',
          cursor: 'pointer',
          position: 'relative',
          minHeight: '140px',
          background: 'rgba(255,255,255,0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Preview"
            style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <p style={{ fontSize: '28px', marginBottom: '8px' }}>📸</p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
              Click or drag & drop to upload
            </p>
            {hint && (
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '4px' }}>
                {hint}
              </p>
            )}
          </div>
        )}

        {uploading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              color: '#7fff00',
              fontWeight: 600,
            }}
          >
            Uploading…
          </div>
        )}
      </div>

      {preview && !uploading && (
        <button
          type="button"
          onClick={() => { setPreview(''); setUrl('') }}
          style={{
            marginTop: '8px',
            fontSize: '12px',
            color: 'rgba(255,100,100,0.7)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          Remove image
        </button>
      )}

      {error && (
        <p style={{ marginTop: '5px', fontSize: '12px', color: 'rgba(255,100,100,0.9)' }}>{error}</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />
    </div>
  )
}
