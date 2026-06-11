import { prisma } from '@/lib/prisma'
import { ServicesSectionClient } from './ServicesSectionClient'

export async function ServicesSection() {
  let services: {
    id: string
    name: string
    slug: string
    shortDescription: string
  }[] = []

  try {
    services = await prisma.service.findMany({
      where: {
        active: true,
      },
      orderBy: {
        order: 'asc',
      },
      select: {
        id: true,
        name: true,
        slug: true,
        shortDescription: true,
      },
    })
  } catch (error) {
    console.error('Failed to load services:', error)
  }

  return <ServicesSectionClient services={services} />
}