import { NextRequest, NextResponse } from 'next/server'
import { getAuthorizedUploadUser } from '@/lib/auth-guard'
import { checkUploadRateLimit, getClientIp } from '@/lib/ratelimit'
import { processUploadImage, MAX_FILE_SIZE } from '@/lib/image-processor'
import { getSupabaseStorageClient, hasSupabaseTestOverride } from '@/lib/supabase-config'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'cms-media'

// 4 MB file limit + ~200 KB multipart boundary and header allowance = 4.2 MB
// Vercel serverless request body platform ceiling is 4.5 MB (4,718,592 bytes).
const MAX_CONTENT_LENGTH = Math.floor(4.2 * 1024 * 1024)

export async function POST(req: NextRequest) {
  // 1. Strict early Content-Length check before allocating memory for multipart stream
  const contentLengthHeader = req.headers.get('content-length')
  if (contentLengthHeader !== null) {
    // Accept only a valid non-negative decimal integer
    if (!/^\d+$/.test(contentLengthHeader)) {
      return NextResponse.json(
        { error: 'Invalid Content-Length header' },
        { status: 400 },
      )
    }

    // Reject unsafe integers
    if (contentLengthHeader.length > 16) {
      return NextResponse.json(
        { error: 'Invalid Content-Length header' },
        { status: 400 },
      )
    }

    const contentLength = Number(contentLengthHeader)
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      return NextResponse.json(
        { error: 'Invalid Content-Length header' },
        { status: 400 },
      )
    }

    if (contentLength > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: 'Payload too large. Maximum image size is 4 MB.' },
        { status: 413 },
      )
    }
  }

  // 2. Strict Authentication & Database Role Authorization
  const authResult = await getAuthorizedUploadUser()
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }
  const { user } = authResult

  // 3. Atomic Rate Limiting (20 uploads / 10m per user, fails closed with 503)
  const clientIp = getClientIp(req.headers)
  const rateLimitResult = await checkUploadRateLimit(user.id, clientIp)
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: rateLimitResult.error },
      { status: rateLimitResult.status },
    )
  }

  // 4. Verify Supabase Storage configuration
  if (!hasSupabaseTestOverride() && (!supabaseUrl || !supabaseServiceKey)) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  }

  // 5. Parse multipart form data safely
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid or malformed form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file || typeof file === 'string' || !file.size) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // 6. Post-parsing independent file size verification
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File too large. Maximum allowed size is 4 MB.' },
      { status: 400 },
    )
  }

  // 7. Read raw buffer and execute Sharp validation and canonical transcoding pipeline
  const arrayBuffer = await file.arrayBuffer()
  const rawBuffer = Buffer.from(arrayBuffer)

  const processResult = await processUploadImage(rawBuffer)
  if (!processResult.success) {
    return NextResponse.json({ error: processResult.error }, { status: 400 })
  }

  const { processedBuffer, fileName, contentType } = processResult.data
  const path = `uploads/${fileName}`

  // 8. Upload to Supabase Storage with strict MIME type and immutable cache control
  const supabase = getSupabaseStorageClient(supabaseUrl, supabaseServiceKey)
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, processedBuffer, {
    contentType,
    upsert: false,
    cacheControl: 'public, max-age=31536000, immutable',
  })

  if (uploadError) {
    console.error('Supabase upload error:', uploadError)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  // 9. Return public URL preserving existing CMS response contract
  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: publicData.publicUrl })
}
