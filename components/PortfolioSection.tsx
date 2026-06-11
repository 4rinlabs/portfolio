'use client'

import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import Image from 'next/image'

type ThumbnailFit = 'cover' | 'contain'

const PROJECTS = [
  {
    title: 'FYS Clothing',
    description: 'Premium fashion storefront with bold visuals and a seamless shopping experience.',
    url: 'https://fysclothing.in/',
    image: '/portfolio/fys-clothing.png',
    thumbnail: { fit: 'cover' as ThumbnailFit, bg: 'bg-mist' },
  },
  {
    title: 'Westren Capital',
    description: 'Corporate finance brand site with trust-focused layout and clear market positioning.',
    url: 'https://www.westrencapital.com/',
    image: '/portfolio/westren-capital.png',
    thumbnail: { fit: 'contain' as ThumbnailFit, bg: 'bg-white' },
  },
  {
    title: 'EazyFly Travels',
    description:
      'Luxury travel experience with curated journeys, private villas, and a refined editorial landing experience.',
    url: 'https://www.eazyfly.co.in',
    image: '/portfolio/eazyfly.png',
    thumbnail: { fit: 'cover' as ThumbnailFit, bg: 'bg-[#0c1210]' },
  },
  {
    title: 'Shaheen Al Jabal',
    description:
      'Industrial building materials supplier with a bold hero, product portfolio, and trust-focused B2B presence across the UAE.',
    url: 'https://www.shaheenaljabal.com',
    image: '/portfolio/shaheen-al-jabal.png',
    thumbnail: { fit: 'cover' as ThumbnailFit, bg: 'bg-[#1a1a1a]' },
  },
] as const

const fadeIn = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
}

function thumbnailImageClass(fit: ThumbnailFit) {
  const base =
    'h-full w-full transition-transform duration-500 ease-out [transform-origin:top_center]'
  const fitClass = fit === 'contain' ? 'object-contain object-top' : 'object-cover object-top'
  const hoverClass =
    fit === 'contain' ? 'group-hover:scale-[1.02]' : 'group-hover:scale-[1.05]'
  return `${base} ${fitClass} ${hoverClass}`
}

function ProjectCard({
  title,
  description,
  url,
  image,
  thumbnail,
  index,
}: (typeof PROJECTS)[number] & { index: number }) {
  const open = () => window.open(url, '_blank', 'noopener,noreferrer')

  return (
    <motion.article
      {...fadeIn}
      transition={{ ...fadeIn.transition, delay: index * 0.08 }}
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      className="portfolio-card group flex h-full min-h-[420px] cursor-pointer flex-col overflow-hidden rounded-2xl border shadow-sm md:min-h-[440px]"
    >
      <div
        className={`portfolio-card-glitch relative aspect-[16/10] w-full shrink-0 overflow-hidden ${thumbnail.bg}`}
      >
        <Image
          src={image}
          alt={`${title} website preview`}
          fill
          className={thumbnailImageClass(thumbnail.fit)}
          loading="lazy"
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
        />
        <div
          className="portfolio-glitch-overlay pointer-events-none absolute inset-0 opacity-0 mix-blend-screen transition-opacity duration-300 group-hover:opacity-100"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent"
          aria-hidden
        />
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="portfolio-card-title font-display text-lg font-bold uppercase tracking-tight">
          {title}
        </h3>
        <p className="portfolio-card-copy mt-2 flex-1 font-sans text-sm leading-relaxed">
          {description}
        </p>
        <span className="portfolio-card-cta btn-glitch mt-5 inline-flex w-fit items-center gap-2 rounded-lg border px-4 py-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] transition hover:border-lime/50 hover:shadow-lime-glow">
          Visit website
          <ExternalLink size={14} className="text-lime" aria-hidden />
        </span>
      </div>
    </motion.article>
  )
}

export function PortfolioSection() {
  return (
    <section id="portfolio" className="section-surface relative scroll-mt-24 py-24 md:py-32">
      <div className="site-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] as const }}
          className="max-w-2xl"
        >
          <p className="section-label">Selected work</p>
          <h2 className="section-title mt-3">
            <span className="glitch-heading" data-text="PORTFOLIO">
              PORTFOLIO
            </span>
          </h2>
          <p className="section-body mt-4">
            Shipped websites — live previews from recent client builds.
          </p>
        </motion.div>

        <div className="mt-14 grid auto-rows-fr gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {PROJECTS.map((p, i) => (
            <ProjectCard key={p.url} {...p} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
