const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.4rinlabs.com'

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: '4RinLabs',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  description:
    'AI Development, SaaS Development, Web Development and Custom Software Solutions',
  sameAs: [
    'https://www.linkedin.com/company/4rinlabs',
    'https://github.com/4rinlabs',
    'https://www.instagram.com/4rinlabs',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    email: '4rinlabs@gmail.com',
    availableLanguage: 'English',
  },
}

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '4RinLabs',
  url: SITE_URL,
  description: 'AI Development, SaaS & Custom Software Company',
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE_URL}/search?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
}

const servicesSchema = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: '4RinLabs Services',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'AI Development', url: `${SITE_URL}/services/ai-development` },
    { '@type': 'ListItem', position: 2, name: 'Custom Software Development', url: `${SITE_URL}/services/custom-software-development` },
    { '@type': 'ListItem', position: 3, name: 'SaaS Development', url: `${SITE_URL}/services/saas-development` },
    { '@type': 'ListItem', position: 4, name: 'Web Development', url: `${SITE_URL}/services/web-development` },
    { '@type': 'ListItem', position: 5, name: 'Mobile App Development', url: `${SITE_URL}/services/mobile-app-development` },
    { '@type': 'ListItem', position: 6, name: 'WhatsApp CRM', url: `${SITE_URL}/services/whatsapp-crm` },
    { '@type': 'ListItem', position: 7, name: 'Digital Marketing', url: `${SITE_URL}/services/digital-marketing` },
  ],
}

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What services does 4RinLabs offer?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'We build static and dynamic websites, portfolio and e-commerce experiences, landing pages, and custom web applications — from discovery through launch and iteration.',
      },
    },
    {
      '@type': 'Question',
      name: 'How long does a project take?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Timelines depend on scope and integrations. A focused marketing site may ship in 2–4 weeks; larger products typically run 6–12 weeks with clear milestones.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do you offer custom designs?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Every engagement is tailored — layout systems, typography, motion, and components are designed around your brand rather than generic templates.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I request revisions?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Collaboration is core to how we work. We structure feedback rounds so revisions stay efficient and the final build matches your expectations.',
      },
    },
    {
      '@type': 'Question',
      name: 'How can I contact your team?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Use the contact form on this page or reach out via WhatsApp, Instagram, or LinkedIn. We respond quickly with next steps and availability.',
      },
    },
  ],
}

export function StructuredData() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(servicesSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </>
  )
}
