import type { Role } from '@prisma/client'

declare module 'next-auth' {
  interface User {
    role: string
  }

  interface Session {
    user: {
      id: string
      role: Role | string
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
  }
}
