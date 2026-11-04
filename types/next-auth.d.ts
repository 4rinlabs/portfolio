import type { Role } from '@prisma/client'

declare module 'next-auth' {
  interface User {
    role: string
    tokenVersion?: number
  }

  interface Session {
    user: {
      id: string
      role: Role | string
      authTime?: number
      tokenVersion?: number
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: string
    id: string
    authTime?: number
    tokenVersion?: number
  }
}
