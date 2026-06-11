import type { Metadata } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.4rinlabs.com'
const SITE_NAME = '4RinLabs'

export const defaultMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '4RinLabs | AI Development, SaaS & Custom Software Company',
    template: '%s | 4RinLabs',
  },
  description:
    '4RinLabs builds AI solutions, SaaS platforms, web applications, mobile apps and custom software for startups and enterprises worldwide.',
  keywords: [
    'AI Development Company',
    'Custom Software Development',
    'SaaS Development Company',
    'Web Development Agency',
    'Mobile App Development',
    'AI Automation',
    'Enterprise Software',
    'Startup MVP',
    'Product Engineering',
    'Digital Transformation',
    '4RinLabs',
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: '4RinLabs | AI Development & Software Company',
    description: 'Building AI solutions, SaaS platforms and custom software.',
    images: [
      {
        url: `${SITE_URL}/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: '4RinLabs — AI Development & Software Company',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '4RinLabs',
    description: 'AI Development, SaaS Development and Custom Software Solutions',
    images: [`${SITE_URL}/og-image.jpg`],
  },
  alternates: {
    canonical: SITE_URL,
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
}

export function buildMetadata(overrides: Partial<Metadata> & {
  slug?: string
  ogImage?: string
}): Metadata {
  const { slug, ogImage, ...rest } = overrides
  const canonical = slug ? `${SITE_URL}/${slug}` : SITE_URL
  const image = ogImage ?? `${SITE_URL}/og-image.jpg`

  return {
    ...defaultMetadata,
    ...rest,
    alternates: {
      canonical,
    },
    openGraph: {
      ...(defaultMetadata.openGraph as object),
      ...(rest.openGraph as object),
      url: canonical,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      ...(defaultMetadata.twitter as object),
      ...(rest.twitter as object),
      images: [image],
    },
  }
}
