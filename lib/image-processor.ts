import sharp, { type Sharp, type Metadata } from 'sharp'
import crypto from 'crypto'

export const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4 MB
export const MAX_DIMENSION = 4096 // 4096 pixels width/height
export const MAX_PIXELS = 16_000_000 // 16 megapixels

export type SupportedRasterFormat = 'jpeg' | 'png' | 'webp'

export type ProcessedImageResult =
  | {
      success: true
      data: {
        processedBuffer: Buffer
        fileName: string
        format: SupportedRasterFormat
        contentType: 'image/jpeg' | 'image/png' | 'image/webp'
        extension: 'jpg' | 'png' | 'webp'
        width: number
        height: number
      }
    }
  | {
      success: false
      error: string
    }

/**
 * Validates the raw file buffer's magic bytes.
 * Returns the detected raster format ('jpeg' | 'png' | 'webp') or null.
 */
export function detectRasterSignature(buffer: Buffer): SupportedRasterFormat | null {
  if (!buffer || buffer.length < 12) return null

  // 1. JPEG signature: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg'
  }

  // 2. PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png'
  }

  // 3. WebP signature: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp'
  }

  return null
}

/**
 * Checks for known active, scriptable, or unsupported formats:
 * SVG, HTML, GIF, Executables.
 */
export function checkDisallowedSignatures(buffer: Buffer): string | null {
  if (!buffer || buffer.length === 0) return 'Empty file payload'

  // GIF signature: GIF87a or GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return 'GIF format is not supported. Please upload JPEG, PNG, or WebP.'
  }

  // Executable / Binary headers (Windows PE 'MZ', Linux ELF, Mach-O)
  if (buffer.length >= 4) {
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      return 'Executable files are strictly forbidden.'
    }
    if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
      return 'Executable files are strictly forbidden.'
    }
  }

  // XML / SVG / HTML inspection (checks first 2048 bytes for scriptable tags)
  const headerText = buffer.subarray(0, 2048).toString('utf-8').toLowerCase()
  if (
    headerText.includes('<svg') ||
    headerText.includes('<?xml') ||
    headerText.includes('<!doctype svg')
  ) {
    return 'SVG images are not permitted due to security policies.'
  }
  if (
    headerText.includes('<html') ||
    headerText.includes('<!doctype html') ||
    headerText.includes('<script')
  ) {
    return 'HTML documents and scripts cannot be uploaded as images.'
  }

  return null
}

/**
 * Checks whether the buffer contains markers for animated PNG (APNG) or animated WebP.
 */
export function isAnimatedImage(buffer: Buffer): boolean {
  // APNG uses the 'acTL' chunk before IDAT
  if (buffer.includes(Buffer.from('acTL'))) {
    return true
  }

  // Animated WebP contains 'ANIM' or 'ANMF' chunks
  if (buffer.includes(Buffer.from('ANIM')) || buffer.includes(Buffer.from('ANMF'))) {
    return true
  }

  // WebP extended header flag check (byte 20, bit 1 for animation)
  if (
    buffer.length >= 21 &&
    buffer[12] === 0x56 &&
    buffer[13] === 0x50 &&
    buffer[14] === 0x38 &&
    buffer[15] === 0x58
  ) {
    const flags = buffer[20]
    if ((flags & 0x02) !== 0) {
      return true
    }
  }

  return false
}

/**
 * End-to-end secure image validation and canonical transcoding pipeline.
 * Re-encodes the verified input image into its native raster format
 * (JPEG -> JPEG, PNG -> PNG, WebP -> WebP) while stripping metadata and auto-orienting.
 */
export async function processUploadImage(rawBuffer: Buffer): Promise<ProcessedImageResult> {
  // 1. File size check
  if (rawBuffer.byteLength > MAX_FILE_SIZE) {
    return {
      success: false,
      error: 'File size exceeds maximum allowed limit of 4 MB.',
    }
  }

  // 2. Disallowed signatures check (SVG, GIF, HTML, Executables)
  const disallowedReason = checkDisallowedSignatures(rawBuffer)
  if (disallowedReason) {
    return { success: false, error: disallowedReason }
  }

  // 3. Magic-byte verification for allowed raster types
  const detectedFormat = detectRasterSignature(rawBuffer)
  if (!detectedFormat) {
    return {
      success: false,
      error: 'Invalid or unsupported image file format. Only JPEG, PNG, and WebP are allowed.',
    }
  }

  // 4. Animation and multi-page check
  if (isAnimatedImage(rawBuffer)) {
    return {
      success: false,
      error: 'Animated or multi-frame images are not permitted.',
    }
  }

  // 5. Decode with Sharp, enforcing defensive pixel limits
  let imageInstance: Sharp
  try {
    imageInstance = sharp(rawBuffer, {
      failOn: 'error',
      limitInputPixels: MAX_PIXELS,
    })
  } catch {
    return {
      success: false,
      error: 'Failed to initialize image decoder.',
    }
  }

  // 6. Inspect metadata
  let metadata: Metadata
  try {
    metadata = await imageInstance.metadata()
  } catch (err: any) {
    if (err?.message?.includes('pixel limit')) {
      return {
        success: false,
        error: 'Image pixel count exceeds the safety limit of 16 megapixels.',
      }
    }
    return {
      success: false,
      error: 'Corrupt, truncated, or unreadable image data.',
    }
  }

  // 7. Verify multi-page / animated detection via metadata
  if (metadata.pages && metadata.pages > 1) {
    return {
      success: false,
      error: 'Animated or multi-frame images are not permitted.',
    }
  }

  // 8. Verify dimensions
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0

  if (width <= 0 || height <= 0) {
    return {
      success: false,
      error: 'Invalid image dimensions detected.',
    }
  }

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return {
      success: false,
      error: `Image dimensions (${width}×${height}) exceed the maximum limit of ${MAX_DIMENSION}×${MAX_DIMENSION} pixels.`,
    }
  }

  if (width * height > MAX_PIXELS) {
    return {
      success: false,
      error: `Total pixel count (${width * height}) exceeds the maximum limit of 16 megapixels.`,
    }
  }

  // 9. Re-encode into verified input raster format (JPEG -> JPEG, PNG -> PNG, WebP -> WebP)
  // Auto-rotates orientation based on EXIF and removes orientation/GPS/metadata tags
  let processedBuffer: Buffer
  let extension: 'jpg' | 'png' | 'webp'
  let contentType: 'image/jpeg' | 'image/png' | 'image/webp'

  try {
    const pipeline = imageInstance.rotate() // Auto-rotates orientation and strips orientation tag

    if (detectedFormat === 'jpeg') {
      extension = 'jpg'
      contentType = 'image/jpeg'
      processedBuffer = await pipeline
        .jpeg({
          quality: 85,
          mozjpeg: true,
          force: true,
        })
        .toBuffer()
    } else if (detectedFormat === 'png') {
      extension = 'png'
      contentType = 'image/png'
      processedBuffer = await pipeline
        .png({
          compressionLevel: 8,
          effort: 7,
          force: true,
        })
        .toBuffer()
    } else {
      extension = 'webp'
      contentType = 'image/webp'
      processedBuffer = await pipeline
        .webp({
          quality: 85,
          effort: 4,
          force: true,
        })
        .toBuffer()
    }
  } catch {
    return {
      success: false,
      error: `Failed to process and canonically re-encode ${detectedFormat.toUpperCase()} image.`,
    }
  }

  // 10. Generate cryptographically unique filename derived from verified format
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`

  return {
    success: true,
    data: {
      processedBuffer,
      fileName,
      format: detectedFormat,
      contentType,
      extension,
      width,
      height,
    },
  }
}
