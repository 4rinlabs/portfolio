import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'

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
  const hoverClass = fit === 'contain' ? 'group-hover:scale-[1.02]' : 'group-hover:scale-[1.05]'
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
      className="portfolio-card group flex h-full min-h-[420px] cursor-pointer flex-col overflow-hidden rounded-2xl border border-charcoal/10 bg-white shadow-sm md:min-h-[440px]"
    >
      <div
        className={`portfolio-card-glitch relative aspect-[16/10] w-full shrink-0 overflow-hidden ${thumbnail.bg}`}
      >
        <img
          src={image}
          alt={`${title} website preview`}
          className={thumbnailImageClass(thumbnail.fit)}
          loading="lazy"
          decoding="async"
        />
        <div
          className="portfolio-glitch-overlay pointer-events-none absolute inset-0 opacity-0 mix-blend-screen transition-opacity duration-300 group-hover:opacity-100"
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent" aria-hidden />
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-display text-lg font-bold uppercase tracking-tight text-ink">{title}</h3>
        <p className="mt-2 flex-1 font-sans text-sm leading-relaxed text-charcoal/70">{description}</p>
        <span className="btn-glitch mt-5 inline-flex w-fit items-center gap-2 rounded-lg border border-charcoal/15 bg-mist/50 px-4 py-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-ink transition hover:border-lime/50 hover:shadow-lime-glow">
          Visit website
          <ExternalLink size={14} className="text-lime" aria-hidden />
        </span>
      </div>
    </motion.article>
  )
}

export function PortfolioSection() {
  return (
    <section id="portfolio" className="relative scroll-mt-24 bg-white py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] as const }}
          className="max-w-2xl"
        >
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.35em] text-charcoal/50">Selected work</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-tight text-ink md:text-5xl">
            <span className="glitch-heading" data-text="PORTFOLIO">
              PORTFOLIO
            </span>
          </h2>
          <p className="mt-4 font-sans text-base leading-relaxed text-charcoal/70 md:text-lg">
            Shipped websites — live previews from recent client builds.
          </p>
        </motion.div>

        <div className="mt-14 grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PROJECTS.map((p, i) => (
            <ProjectCard key={p.url} {...p} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
