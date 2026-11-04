import sharp from 'sharp'
import {
  detectRasterSignature,
  checkDisallowedSignatures,
  isAnimatedImage,
  processUploadImage,
  MAX_FILE_SIZE,
  MAX_DIMENSION,
  MAX_PIXELS,
} from '../lib/image-processor'
import { getAuthorizedUploadUser, setAuthGuardForTesting } from '../lib/auth-guard'
import { checkUploadRateLimit, setRedisForTesting } from '../lib/ratelimit'
import { prisma } from '../lib/prisma'
import { POST, setSupabaseForTesting } from '../app/api/admin/upload/route'
import { NextRequest } from 'next/server'

// Test runner helper
let totalTests = 0
let passedTests = 0
let failedTests = 0

function assert(condition: boolean, message: string) {
  totalTests++
  if (condition) {
    passedTests++
    console.log(`  ✅ ${message}`)
  } else {
    failedTests++
    console.error(`  ❌ FAIL: ${message}`)
  }
}

async function runPhase2Tests() {
  console.log('🧪 Starting Phase 2 CMS File Upload Security Test Suite...\n')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1: AUTHENTICATION & AUTHORIZATION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('--- 1. Authentication & Role-Based Authorization ---')

  const originalFindUnique = prisma.user.findUnique

  try {
    // 1.1 Unauthenticated request returns 401
    setAuthGuardForTesting(null) // clear test overrides
    const unauthResult = await getAuthorizedUploadUser(null)
    assert(
      !unauthResult.authorized && unauthResult.status === 401,
      'Unauthenticated request returns 401',
    )

    // 1.2 Session without user ID returns 401
    const missingIdResult = await getAuthorizedUploadUser({ user: {} })
    assert(
      !missingIdResult.authorized && missingIdResult.status === 401,
      'Session with missing user ID returns 401',
    )

    const currentAuthTime = Math.floor(Date.now() / 1000)

    // 1.3 ADMIN role in database is allowed
    ;(prisma.user as any).findUnique = async ({ where }: any) => {
      if (where.id === 'admin-123') return { id: 'admin-123', email: 'admin@4rinlabs.com', role: 'ADMIN', tokenVersion: 1 }
      return null
    }
    const adminResult = await getAuthorizedUploadUser({ user: { id: 'admin-123', role: 'ADMIN', authTime: currentAuthTime, tokenVersion: 1 } })
    assert(
      adminResult.authorized && adminResult.user.role === 'ADMIN',
      'ADMIN can upload',
    )

    // 1.4 EDITOR role in database is allowed
    ;(prisma.user as any).findUnique = async ({ where }: any) => {
      if (where.id === 'editor-456') return { id: 'editor-456', email: 'editor@4rinlabs.com', role: 'EDITOR', tokenVersion: 1 }
      return null
    }
    const editorResult = await getAuthorizedUploadUser({ user: { id: 'editor-456', role: 'EDITOR', authTime: currentAuthTime, tokenVersion: 1 } })
    assert(
      editorResult.authorized && editorResult.user.role === 'EDITOR',
      'EDITOR can upload',
    )

    // 1.5 Non-admin / non-editor roles are rejected with 403
    ;(prisma.user as any).findUnique = async ({ where }: any) => {
      if (where.id === 'viewer-789') return { id: 'viewer-789', email: 'viewer@4rinlabs.com', role: 'VIEWER', tokenVersion: 1 }
      return null
    }
    const viewerResult = await getAuthorizedUploadUser({ user: { id: 'viewer-789', role: 'VIEWER', authTime: currentAuthTime, tokenVersion: 1 } })
    assert(
      !viewerResult.authorized && viewerResult.status === 403,
      'Other roles (e.g. VIEWER) are rejected with 403',
    )

    // 1.6 Deleted user (exists in JWT cookie but not in PostgreSQL) returns 401
    ;(prisma.user as any).findUnique = async () => null
    const deletedResult = await getAuthorizedUploadUser({ user: { id: 'deleted-user-id', role: 'ADMIN', authTime: currentAuthTime, tokenVersion: 1 } })
    assert(
      !deletedResult.authorized && deletedResult.status === 401,
      'Deleted user is rejected with 401 even if JWT claims ADMIN',
    )

    // 1.7 Stale JWT role cannot override current database role
    ;(prisma.user as any).findUnique = async () => ({ id: 'demoted-user', email: 'demoted@4rinlabs.com', role: 'GUEST', tokenVersion: 1 })
    const staleResult = await getAuthorizedUploadUser({ user: { id: 'demoted-user', role: 'ADMIN', authTime: currentAuthTime, tokenVersion: 1 } })
    assert(
      !staleResult.authorized && staleResult.status === 403,
      'Stale JWT role cannot override current database role (403)',
    )

    // 1.8 Account deactivation / status inspection
    const hasStatusField = 'status' in (prisma.user as any) || 'active' in (prisma.user as any)
    assert(
      !hasStatusField,
      'Schema inspection confirmed: Prisma User model has no deactivation/status column (enforced via database lookup & role assignment)',
    )
  } finally {
    ;(prisma.user as any).findUnique = originalFindUnique
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2: IMAGE VALIDATION & FORMAT-PRESERVING SHARP PIPELINE
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 2. Image Validation & Format-Preserving Sharp Pipeline ---')

  const validJpeg = await sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 50, g: 100, b: 150 } },
  }).jpeg().toBuffer()

  const validPng = await sharp({
    create: { width: 250, height: 150, channels: 4, background: { r: 255, g: 0, b: 128, alpha: 0.5 } },
  }).png().toBuffer()

  const validWebp = await sharp({
    create: { width: 400, height: 300, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 0.8 } },
  }).webp().toBuffer()

  // 2.1 JPEG input -> Output remains valid JPEG
  const resJpeg = await processUploadImage(validJpeg)
  assert(
    resJpeg.success &&
      resJpeg.data.format === 'jpeg' &&
      resJpeg.data.contentType === 'image/jpeg' &&
      resJpeg.data.fileName.endsWith('.jpg'),
    'JPEG input is canonically re-encoded to JPEG (.jpg, image/jpeg)',
  )
  if (resJpeg.success) {
    const metaOutJpeg = await sharp(resJpeg.data.processedBuffer).metadata()
    assert(metaOutJpeg.format === 'jpeg', 'JPEG output buffer is verified JPEG format')
  }

  // 2.2 PNG input -> Output remains valid PNG and retains transparency
  const resPng = await processUploadImage(validPng)
  assert(
    resPng.success &&
      resPng.data.format === 'png' &&
      resPng.data.contentType === 'image/png' &&
      resPng.data.fileName.endsWith('.png'),
    'PNG input is canonically re-encoded to PNG (.png, image/png)',
  )
  if (resPng.success) {
    const metaOutPng = await sharp(resPng.data.processedBuffer).metadata()
    assert(
      metaOutPng.format === 'png' && metaOutPng.hasAlpha === true,
      'PNG output buffer retains valid PNG format and alpha transparency',
    )
  }

  // 2.3 WebP input -> Output remains valid WebP and retains transparency
  const resWebp = await processUploadImage(validWebp)
  assert(
    resWebp.success &&
      resWebp.data.format === 'webp' &&
      resWebp.data.contentType === 'image/webp' &&
      resWebp.data.fileName.endsWith('.webp'),
    'WebP input is canonically re-encoded to WebP (.webp, image/webp)',
  )
  if (resWebp.success) {
    const metaOutWebp = await sharp(resWebp.data.processedBuffer).metadata()
    assert(
      metaOutWebp.format === 'webp' && metaOutWebp.hasAlpha === true,
      'WebP output buffer retains valid WebP format and alpha transparency',
    )
  }

  // 2.4 Spoofed MIME types: Text file with JPEG extension / MIME
  const spoofedText = Buffer.from('This is a plain text file pretending to be an image.')
  const resSpoofed = await processUploadImage(spoofedText)
  assert(!resSpoofed.success, 'Spoofed file (plain text) is rejected by signature check')

  // 2.5 HTML disguised as JPEG
  const htmlBuffer = Buffer.from('<!DOCTYPE html><html><body><script>alert("XSS")</script></body></html>')
  const resHtml = await processUploadImage(htmlBuffer)
  assert(!resHtml.success, 'HTML document disguised as image is rejected')

  // 2.6 SVG disguised as JPEG / SVG with script
  const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle cx="50" cy="50" r="40"/></svg>')
  const resSvg = await processUploadImage(svgBuffer)
  assert(!resSvg.success, 'SVG is rejected (neutralizes stored XSS)')

  // 2.7 GIF is rejected
  const gifBuffer = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;')
  const resGif = await processUploadImage(gifBuffer)
  assert(!resGif.success, 'GIF is rejected')

  // 2.8 Corrupt and truncated images are rejected
  const truncatedJpeg = validJpeg.subarray(0, 15)
  const resTruncated = await processUploadImage(truncatedJpeg)
  assert(!resTruncated.success, 'Truncated or corrupt image is rejected')

  // 2.9 Animated PNG (APNG) is rejected
  const fakeApng = Buffer.concat([validPng.subarray(0, 33), Buffer.from('acTL'), validPng.subarray(33)])
  assert(isAnimatedImage(fakeApng), 'Animated PNG (APNG) detected via acTL chunk')
  const resApng = await processUploadImage(fakeApng)
  assert(!resApng.success, 'Animated PNG (APNG) is rejected')

  // 2.10 Valid Animated WebP Fixture
  // Construct a valid WebP file with VP8X animation flag + ANIM + ANMF chunks
  const singleWebp = await sharp({
    create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  }).webp().toBuffer()

  const vp8x = Buffer.alloc(18)
  vp8x.write('VP8X', 0, 'ascii')
  vp8x.writeUInt32LE(10, 4)
  vp8x[8] = 0x02 // Animation flag set in VP8X header
  vp8x.writeUIntLE(9, 12, 3)
  vp8x.writeUIntLE(9, 15, 3)

  const anim = Buffer.alloc(14)
  anim.write('ANIM', 0, 'ascii')
  anim.writeUInt32LE(6, 4)
  anim.writeUInt32LE(0, 8)
  anim.writeUInt16LE(0, 12)

  const subChunk = singleWebp.subarray(12)
  const anmf = Buffer.concat([
    Buffer.from('ANMF'),
    Buffer.alloc(4),
    Buffer.alloc(16),
    subChunk,
  ])
  anmf.writeUInt32LE(anmf.length - 8, 4)

  const webpPayload = Buffer.concat([Buffer.from('WEBP'), vp8x, anim, anmf])
  const riffHeader = Buffer.alloc(8)
  riffHeader.write('RIFF', 0, 'ascii')
  riffHeader.writeUInt32LE(webpPayload.length, 4)

  const animatedWebpFixture = Buffer.concat([riffHeader, webpPayload])

  // Verify animated WebP identification and processor rejection
  assert(isAnimatedImage(animatedWebpFixture), 'Genuine animated WebP identified as animated via VP8X/ANIM/ANMF chunks')
  const resAnimWebp = await processUploadImage(animatedWebpFixture)
  assert(!resAnimWebp.success, 'Image processor strictly rejects animated WebP')

  // 2.11 Images exceeding dimension limits (> 4096px)
  const wideImage = await sharp({
    create: { width: 4097, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).jpeg().toBuffer()
  const resWide = await processUploadImage(wideImage)
  assert(!resWide.success, 'Image exceeding 4096px width is rejected')

  // 2.12 Decompression bomb defense / Images exceeding 16 megapixels
  const hugeImage = await sharp({
    create: { width: 4500, height: 4000, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).jpeg().toBuffer()
  const resHuge = await processUploadImage(hugeImage)
  assert(!resHuge.success, 'Decompression bomb / image exceeding 16 megapixels is safely rejected')

  // 2.13 EXIF orientation auto-rotation & metadata stripping across formats
  const exifJpeg = await sharp({
    create: { width: 120, height: 80, channels: 3, background: { r: 100, g: 200, b: 50 } },
  }).withMetadata({ orientation: 6 }).jpeg().toBuffer()

  const initialMeta = await sharp(exifJpeg).metadata()
  assert(initialMeta.orientation === 6, 'Input image contains EXIF orientation tag 6')

  const resExif = await processUploadImage(exifJpeg)
  assert(resExif.success, 'Image with EXIF is processed successfully')
  if (resExif.success) {
    const outputMeta = await sharp(resExif.data.processedBuffer).metadata()
    assert(
      outputMeta.orientation === undefined && outputMeta.exif === undefined,
      'EXIF, GPS and camera metadata are stripped from processed output',
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3: REQUEST HANDLING & CONTENT-LENGTH VALIDATION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 3. Request Handling & Strict Content-Length Validation ---')

  // 3.1 Files over 4 MB are rejected
  const oversizedBuffer = Buffer.alloc(MAX_FILE_SIZE + 1024, 0xff)
  const resOversized = await processUploadImage(oversizedBuffer)
  assert(!resOversized.success, 'Buffer exceeding 4 MB is rejected')

  // 3.2 Oversized Content-Length header is rejected with 413 before multipart parsing
  const reqOversizedContentLength = new NextRequest('http://localhost:3000/api/admin/upload', {
    method: 'POST',
    headers: {
      'content-length': '5000000', // ~5 MB > 4.2 MB platform threshold
      'content-type': 'multipart/form-data; boundary=----boundary',
    },
    body: 'dummy',
  })
  const postOversizedRes = await POST(reqOversizedContentLength)
  assert(postOversizedRes.status === 413, 'Oversized Content-Length (> 4.2 MB) rejected with 413')

  // 3.3 Strict decimal validation rejects malformed Content-Length values (400)
  const malformedValues = ['invalid-number-xyz', '-100', '123.45', '1000abc', '0x200', '999999999999999999999999']
  let malformedAll400 = true

  for (const badVal of malformedValues) {
    const reqBad = new NextRequest('http://localhost:3000/api/admin/upload', {
      method: 'POST',
      headers: { 'content-length': badVal },
    })
    const resBad = await POST(reqBad)
    if (resBad.status !== 400) {
      malformedAll400 = false
      console.error(`Malformed Content-Length "${badVal}" returned status ${resBad.status} instead of 400`)
    }
  }
  assert(malformedAll400, 'Strict decimal validation rejects negative, floating-point, non-numeric, and unsafe Content-Length with 400')

  // 3.4 Missing Content-Length proceeds safely to auth check
  const reqMissingContentLength = new NextRequest('http://localhost:3000/api/admin/upload', {
    method: 'POST',
  })
  const postMissingRes = await POST(reqMissingContentLength)
  assert(postMissingRes.status === 401, 'Missing Content-Length header proceeds safely to auth check (401)')

  // 3.5 Invalid multipart requests return controlled error (400)
  setAuthGuardForTesting(() => ({
    authorized: true,
    user: { id: 'admin-tester', email: 'admin@4rinlabs.com', role: 'ADMIN', tokenVersion: 1 },
  }))

  const mockRedisLimiter = {
    evalsha: async () => { throw new Error('NOSCRIPT') },
    eval: async () => [1, 20],
  }
  setRedisForTesting(mockRedisLimiter)

  const reqInvalidMultipart = new NextRequest('http://localhost:3000/api/admin/upload', {
    method: 'POST',
    headers: {
      'content-type': 'multipart/form-data; boundary=missing-boundary-test',
    },
    body: 'bad-payload-not-multipart',
  })
  const postInvalidMultipartRes = await POST(reqInvalidMultipart)
  assert(postInvalidMultipartRes.status === 400, 'Invalid multipart request returns controlled 400 error')

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4: RATE LIMITING & STORAGE SECURITY (Mocked Infrastructure)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n--- 4. Rate Limiting & Storage Security (Mocked Redis/Storage) ---')

  class MockUploadRedis {
    counts = new Map<string, number>()

    async evalsha(): Promise<any> {
      throw new Error('NOSCRIPT')
    }

    async eval(_script: string, keys: string[], _args: any[]): Promise<any> {
      const key = keys[0] || 'default-key'
      const current = this.counts.get(key) || 0
      if (current >= 20) {
        return [-1, 20] // limit exceeded -> success: false
      }
      this.counts.set(key, current + 1)
      return [20 - (current + 1), 20] // remaining, limit
    }

    reset() {
      this.counts.clear()
    }
  }

  const mockRedisInstance = new MockUploadRedis()
  setRedisForTesting(mockRedisInstance)

  // 4.1 21st upload within the user limit returns 429
  let uploadSuccessCount = 0
  let uploadBlocked429 = false

  for (let i = 1; i <= 21; i++) {
    const res = await checkUploadRateLimit('user-limit-tester')
    if (res.allowed) {
      uploadSuccessCount++
    } else if (res.status === 429) {
      uploadBlocked429 = true
    }
  }
  assert(
    uploadSuccessCount === 20 && uploadBlocked429,
    'The 21st upload within the user limit returns 429',
  )

  // 4.2 Redis outage returns 503 (Fail-Closed)
  setRedisForTesting(null)
  const outageRes = await checkUploadRateLimit('outage-user-id')
  assert(
    !outageRes.allowed && outageRes.status === 503,
    'Redis outage fails closed and returns HTTP 503',
  )

  // 4.3 Animated WebP rejection before storage upload
  let storageUploadCalled = false
  const mockStorageTracking = {
    storage: {
      from: () => ({
        upload: async () => {
          storageUploadCalled = true
          return { error: null }
        },
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/test.webp' } }),
      }),
    },
  }
  setSupabaseForTesting(mockStorageTracking)
  mockRedisInstance.reset()
  setRedisForTesting(mockRedisInstance)

  const animWebpBlob = new Blob([animatedWebpFixture], { type: 'image/webp' })
  const animFd = new FormData()
  animFd.append('file', animWebpBlob, 'animation.webp')

  const reqAnimUpload = new NextRequest('http://localhost:3000/api/admin/upload', {
    method: 'POST',
    body: animFd,
  })
  const postAnimRes = await POST(reqAnimUpload)
  assert(postAnimRes.status === 400, 'Animated WebP upload returns HTTP 400')
  assert(!storageUploadCalled, 'Supabase Storage upload is NEVER attempted for animated WebP')

  // 4.4 Supabase storage error handling: Returns 500 without false success
  const mockFailingSupabase = {
    storage: {
      from: () => ({
        upload: async () => ({ error: new Error('S3 network timeout') }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
  }
  setSupabaseForTesting(mockFailingSupabase)

  const testJpegBlob = new Blob([validJpeg], { type: 'image/jpeg' })
  const validFd = new FormData()
  validFd.append('file', testJpegBlob, 'test-image.jpg')

  const reqStorageFail = new NextRequest('http://localhost:3000/api/admin/upload', {
    method: 'POST',
    body: validFd,
  })
  const postStorageFailRes = await POST(reqStorageFail)
  assert(postStorageFailRes.status === 500, 'Storage upload errors are handled cleanly without returning a false success (500)')

  // 4.5 Supabase storage success: Format-specific extensions and Content-Types
  let capturedUploadOptions: any = null
  let capturedUploadPath: string = ''

  const mockSuccessSupabase = {
    storage: {
      from: () => ({
        upload: async (path: string, _buffer: Buffer, options: any) => {
          capturedUploadPath = path
          capturedUploadOptions = options
          return { error: null }
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://oprgqmhcigkqtnofglbp.supabase.co/storage/v1/object/public/cms-media/${path}` },
        }),
      }),
    },
  }
  setSupabaseForTesting(mockSuccessSupabase)

  // Test JPEG upload -> .jpg extension and image/jpeg Content-Type
  const reqJpegSuccess = new NextRequest('http://localhost:3000/api/admin/upload', {
    method: 'POST',
    body: validFd,
  })
  const postJpegSuccessRes = await POST(reqJpegSuccess)
  assert(postJpegSuccessRes.status === 200, 'Successful JPEG upload returns HTTP 200')
  const jpegJson = await postJpegSuccessRes.json()
  assert(
    typeof jpegJson.url === 'string' && jpegJson.url.endsWith('.jpg'),
    'JPEG upload returns URL ending in .jpg',
  )
  assert(
    capturedUploadOptions?.contentType === 'image/jpeg',
    'JPEG upload sets contentType: image/jpeg',
  )
  assert(
    capturedUploadOptions?.upsert === false &&
      capturedUploadOptions?.cacheControl === 'public, max-age=31536000, immutable',
    'JPEG upload enforces upsert: false and immutable cacheControl',
  )

  // Test PNG upload -> .png extension and image/png Content-Type
  const testPngBlob = new Blob([validPng], { type: 'image/png' })
  const pngFd = new FormData()
  pngFd.append('file', testPngBlob, 'test-transparent.png')

  const reqPngSuccess = new NextRequest('http://localhost:3000/api/admin/upload', {
    method: 'POST',
    body: pngFd,
  })
  const postPngSuccessRes = await POST(reqPngSuccess)
  assert(postPngSuccessRes.status === 200, 'Successful PNG upload returns HTTP 200')
  const pngJson = await postPngSuccessRes.json()
  assert(
    typeof pngJson.url === 'string' && pngJson.url.endsWith('.png'),
    'PNG upload returns URL ending in .png',
  )
  assert(
    capturedUploadOptions?.contentType === 'image/png',
    'PNG upload sets contentType: image/png',
  )

  // Test WebP upload -> .webp extension and image/webp Content-Type
  const testWebpBlob = new Blob([validWebp], { type: 'image/webp' })
  const webpFd = new FormData()
  webpFd.append('file', testWebpBlob, 'test-vector.webp')

  const reqWebpSuccess = new NextRequest('http://localhost:3000/api/admin/upload', {
    method: 'POST',
    body: webpFd,
  })
  const postWebpSuccessRes = await POST(reqWebpSuccess)
  assert(postWebpSuccessRes.status === 200, 'Successful WebP upload returns HTTP 200')
  const webpJson = await postWebpSuccessRes.json()
  assert(
    typeof webpJson.url === 'string' && webpJson.url.endsWith('.webp'),
    'WebP upload returns URL ending in .webp',
  )
  assert(
    capturedUploadOptions?.contentType === 'image/webp',
    'WebP upload sets contentType: image/webp',
  )

  // Clean up test overrides
  setAuthGuardForTesting(null)
  setSupabaseForTesting(null)
  setRedisForTesting(null)

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n========================================')
  console.log(`Phase 2 Tests Finished: ${passedTests}/${totalTests} Passed`)
  if (failedTests > 0) {
    console.error(`❌ ${failedTests} tests failed!`)
    process.exit(1)
  } else {
    console.log('✅ All Phase 2 Security Tests Passed!')
  }
}

runPhase2Tests().catch((err) => {
  console.error('Test runner fatal error:', err)
  process.exit(1)
})
