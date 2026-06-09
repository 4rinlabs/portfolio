import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { MagneticButton } from './MagneticButton'
import { scrollToSection } from '../lib/scroll'

export function HeroSection() {
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const glowX = useSpring(useTransform(mx, [-0.5, 0.5], [-24, 24]), { stiffness: 80, damping: 24 })
  const glowY = useSpring(useTransform(my, [-0.5, 0.5], [-18, 18]), { stiffness: 80, damping: 24 })

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    mx.set(e.clientX / window.innerWidth - 0.5)
    my.set(e.clientY / window.innerHeight - 0.5)
  }

  const onLeave = () => {
    mx.set(0)
    my.set(0)
  }

  return (
    <section
      id="home"
      className="hero-section relative flex min-h-screen scroll-mt-24 flex-col items-center justify-center overflow-x-hidden pt-24"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="hero-section-grid pointer-events-none absolute inset-0" aria-hidden />
      <motion.div
        className="hero-section-ambient pointer-events-none absolute inset-0"
        aria-hidden
        animate={{ opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="site-container relative z-10 w-full">
        <div className="site-hero-content">
          <p className="hero-eyebrow mb-5 font-sans text-[10px] font-semibold uppercase tracking-[0.38em] sm:text-[11px]">
            Creative <span className="hero-accent">Digital</span> Studio
          </p>

          <div className="hero-title-wrap">
            <motion.div className="hero-title-glow" style={{ x: glowX, y: glowY }} aria-hidden>
              <div className="hero-title-glow-core" />
            </motion.div>
            
            <p className="hero-title">
              <span className="glitch-hero" data-text="4RinLabs">
                <span className="relative z-10">4RinLabs</span>
              </span>
            </p>
          </div>

          <h1 className="hero-tagline mx-auto mt-8 max-w-md font-sans text-base font-medium sm:text-lg md:mt-10 md:text-xl">
            Custom Software <span className="hero-accent">& AI Development Company.</span>
          </h1>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 md:mt-12">
            <MagneticButton
              className="hero-btn hero-btn-primary btn-glitch"
              onClick={() => scrollToSection('portfolio')}
            >
              View work
              <ArrowUpRight size={14} className="ml-1.5 inline-block" aria-hidden />
            </MagneticButton>
            <MagneticButton
              className="hero-btn hero-btn-secondary btn-glitch"
              onClick={() => scrollToSection('contact')}
            >
              Contact us
              <ArrowUpRight size={14} className="ml-1.5 inline-block" aria-hidden />
            </MagneticButton>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 md:bottom-10">
        <motion.div
          className="hero-scroll-indicator"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.div
            className="hero-scroll-dot"
            animate={{ y: [0, 10, 0], opacity: [1, 0.35, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      </div>
    </section>
  )
}
