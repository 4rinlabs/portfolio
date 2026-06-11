import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ─── Admin user ───────────────────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@4rinlabs.com'
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'change-me-in-production'
  const hashedPassword = await bcrypt.hash(adminPassword, 12)

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: '4RinLabs Admin',
      password: hashedPassword,
      role: 'ADMIN',
    },
  })
  console.log('✅ Admin user created:', adminEmail)

  // ─── Services ─────────────────────────────────────────────────────────────
  const services = [
    {
      name: 'AI Development',
      slug: 'ai-development',
      shortDescription: 'Custom AI solutions, LLM integrations, RAG systems, AI agents, and intelligent automation.',
      longDescription: `We build production-grade AI systems that solve real business problems. From custom LLM integrations and RAG pipelines to multi-agent architectures and computer vision systems, we deliver AI that works reliably at scale.\n\nOur AI development practice covers the full stack: data pipelines, model fine-tuning, prompt engineering, vector databases, agent orchestration, and deployment. We work with OpenAI, Anthropic, Google Gemini, and open-source models.\n\nKey capabilities: AI Agents, RAG Systems, Chatbots, Workflow Automation, Computer Vision, Multi-Agent Systems.`,
      seoTitle: 'AI Development Company | Custom AI Solutions | 4RinLabs',
      seoDescription: 'We build custom AI solutions — LLM integrations, RAG systems, AI agents, and intelligent automation for startups and enterprises.',
      icon: 'brain',
      featured: true,
      order: 1,
    },
    {
      name: 'Custom Software Development',
      slug: 'custom-software-development',
      shortDescription: 'Bespoke software solutions engineered around your workflows and business logic.',
      longDescription: `Every business has unique processes that off-the-shelf software can't fully address. We build custom software that fits exactly how you operate — from internal tools and workflow automation to complex enterprise systems.\n\nOur engineering approach emphasizes clean architecture, testability, and long-term maintainability. We use modern tech stacks and proven patterns to deliver software that scales with your business.`,
      seoTitle: 'Custom Software Development | 4RinLabs',
      seoDescription: 'Bespoke software solutions built around your specific workflows and business logic. Scalable, maintainable, production-grade.',
      icon: 'code',
      featured: true,
      order: 2,
    },
    {
      name: 'SaaS Development',
      slug: 'saas-development',
      shortDescription: 'End-to-end SaaS platform development from MVP to enterprise-ready product.',
      longDescription: `We build SaaS products from the ground up — multi-tenancy architecture, subscription billing, user management, analytics dashboards, and everything in between. Whether you're validating an MVP or scaling to enterprise, we build the right foundation.\n\nOur SaaS development practice covers: architecture design, database modeling, API development, frontend application, billing integration (Stripe), authentication, and deployment infrastructure.`,
      seoTitle: 'SaaS Development Company | Build Your SaaS Product | 4RinLabs',
      seoDescription: 'End-to-end SaaS platform development. From MVP validation to enterprise-ready multi-tenant products with billing, auth, and analytics.',
      icon: 'cloud',
      featured: true,
      order: 3,
    },
    {
      name: 'Web Development',
      slug: 'web-development',
      shortDescription: 'From brand-sharp marketing sites to complex product interfaces — pixel-perfect execution.',
      longDescription: `We build websites and web applications that perform at every level: design fidelity, technical performance, accessibility, and SEO. Our web development practice covers static sites, dynamic web apps, e-commerce, landing pages, and custom web tooling.\n\nEvery project is built with modern standards: Next.js, TypeScript, Tailwind CSS, and edge-optimized deployment on Vercel.`,
      seoTitle: 'Web Development Agency | Next.js & TypeScript | 4RinLabs',
      seoDescription: 'Professional web development — marketing sites, web applications, e-commerce, and landing pages. Next.js, TypeScript, and pixel-perfect execution.',
      icon: 'globe',
      featured: true,
      order: 4,
    },
    {
      name: 'Mobile App Development',
      slug: 'mobile-app-development',
      shortDescription: 'Custom Android and iOS applications with intuitive UX, API integrations, and performance.',
      longDescription: `We build native and cross-platform mobile applications using React Native and modern mobile development practices. From MVP to App Store launch, we handle the full development lifecycle: UI/UX design, development, API integration, testing, and store submission.\n\nKey focus areas: performance optimization, offline-first architecture, push notifications, analytics, and ongoing maintenance.`,
      seoTitle: 'Mobile App Development | iOS & Android | 4RinLabs',
      seoDescription: 'Custom mobile app development for iOS and Android. React Native, intuitive UX, API integrations, and App Store launch support.',
      icon: 'smartphone',
      featured: false,
      order: 5,
    },
    {
      name: 'WhatsApp CRM',
      slug: 'whatsapp-crm',
      shortDescription: 'WhatsApp automation, lead management, broadcast messaging, and CRM integration.',
      longDescription: `We build WhatsApp-native CRM systems and automation workflows that help businesses manage customer communication at scale. From automated lead qualification to broadcast campaigns and support ticketing, we deliver WhatsApp solutions that drive real business results.\n\nCapabilities: WhatsApp Business API integration, chatbot flows, lead routing, broadcast messaging, contact management, and CRM sync.`,
      seoTitle: 'WhatsApp CRM Development | WhatsApp Automation | 4RinLabs',
      seoDescription: 'WhatsApp automation, CRM integration, broadcast messaging, and lead management systems built on the WhatsApp Business API.',
      icon: 'message-circle',
      featured: false,
      order: 6,
    },
    {
      name: 'Digital Marketing',
      slug: 'digital-marketing',
      shortDescription: 'Social media marketing, content strategy, ad campaigns, and performance marketing.',
      longDescription: `We deliver data-driven digital marketing strategies that grow brand awareness and drive qualified leads. Our marketing practice covers organic social, paid advertising, content strategy, SEO, and account management.\n\nServices: Social media management, Meta & Google Ads, content creation, influencer strategy, performance reporting, and brand growth consulting.`,
      seoTitle: 'Digital Marketing Agency | Social Media & Paid Ads | 4RinLabs',
      seoDescription: 'Data-driven digital marketing — social media management, paid advertising, content strategy, and performance marketing for growing brands.',
      icon: 'trending-up',
      featured: false,
      order: 7,
    },
  ]

  for (const service of services) {
    await prisma.service.upsert({
      where: { slug: service.slug },
      update: service,
      create: service,
    })
  }
  console.log('✅ Services seeded:', services.length)

  // ─── Portfolio items ───────────────────────────────────────────────────────
  const portfolioItems = [
    {
      title: 'FYS Clothing',
      slug: 'fys-clothing',
      description: 'Premium fashion storefront with bold visuals and a seamless shopping experience.',
      client: 'FYS Clothing',
      industry: 'E-Commerce / Fashion',
      technologies: ['Next.js', 'Tailwind CSS', 'Shopify', 'TypeScript'],
      coverImage: '/portfolio/fys-clothing.png',
      gallery: ['/portfolio/fys-clothing.png'],
      projectUrl: 'https://fysclothing.in/',
      featured: true,
      order: 1,
      seoTitle: 'FYS Clothing — E-Commerce Case Study | 4RinLabs Portfolio',
      seoDescription: 'Premium fashion storefront built by 4RinLabs — bold visuals, seamless shopping experience, and performance-optimized e-commerce.',
    },
    {
      title: 'Westren Capital',
      slug: 'westren-capital',
      description: 'Corporate finance brand site with trust-focused layout and clear market positioning.',
      client: 'Westren Capital',
      industry: 'Finance / Investment',
      technologies: ['React', 'Tailwind CSS', 'TypeScript'],
      coverImage: '/portfolio/westren-capital.png',
      gallery: ['/portfolio/westren-capital.png'],
      projectUrl: 'https://www.westrencapital.com/',
      featured: true,
      order: 2,
      seoTitle: 'Westren Capital — Corporate Finance Website | 4RinLabs Portfolio',
      seoDescription: 'Corporate finance brand website built by 4RinLabs — trust-focused design, professional layout, and clear market positioning.',
    },
    {
      title: 'EazyFly Travels',
      slug: 'eazyfly-travels',
      description: 'Luxury travel experience with curated journeys, private villas, and a refined editorial landing experience.',
      client: 'EazyFly Travels',
      industry: 'Travel / Luxury',
      technologies: ['Next.js', 'Framer Motion', 'Tailwind CSS'],
      coverImage: '/portfolio/eazyfly.png',
      gallery: ['/portfolio/eazyfly.png'],
      projectUrl: 'https://www.eazyfly.co.in',
      featured: true,
      order: 3,
      seoTitle: 'EazyFly Travels — Luxury Travel Website | 4RinLabs Portfolio',
      seoDescription: 'Luxury travel website built by 4RinLabs — curated journeys, editorial design, and a refined booking experience.',
    },
    {
      title: 'Shaheen Al Jabal',
      slug: 'shaheen-al-jabal',
      description: 'Industrial building materials supplier with a bold hero, product portfolio, and trust-focused B2B presence across the UAE.',
      client: 'Shaheen Al Jabal',
      industry: 'Construction / B2B',
      technologies: ['React', 'Tailwind CSS', 'TypeScript'],
      coverImage: '/portfolio/shaheen-al-jabal.png',
      gallery: ['/portfolio/shaheen-al-jabal.png'],
      projectUrl: 'https://www.shaheenaljabal.com',
      featured: true,
      order: 4,
      seoTitle: 'Shaheen Al Jabal — B2B Industrial Website | 4RinLabs Portfolio',
      seoDescription: 'B2B industrial website for UAE building materials supplier — built by 4RinLabs with bold hero design and trust-focused layout.',
    },
  ]

  for (const item of portfolioItems) {
    await prisma.portfolio.upsert({
      where: { slug: item.slug },
      update: item,
      create: item,
    })
  }
  console.log('✅ Portfolio items seeded:', portfolioItems.length)

  console.log('🎉 Seeding complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
