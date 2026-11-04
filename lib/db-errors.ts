import { Prisma } from '@prisma/client'

export type MutationActionResult = {
  success: boolean
  message?: string
  errors?: Record<string, string[]>
  id?: string
}

export function isPrismaRecordNotFoundError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
}

export function handleMutationError(err: unknown, entityName: string): MutationActionResult {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return {
        success: false,
        message: `A ${entityName.toLowerCase()} with this slug already exists.`,
        errors: { slug: ['This slug is already in use. Please choose a different slug.'] },
      }
    }
    if (err.code === 'P2025') {
      return {
        success: false,
        message: `This ${entityName.toLowerCase()} no longer exists or was already removed.`,
      }
    }
  }
  console.error(`Unexpected database error on ${entityName}:`, err)
  return {
    success: false,
    message: 'A database error occurred. Please try again later.',
  }
}
