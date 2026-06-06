import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useMemo } from 'react'
import { MagneticButton } from './MagneticButton'
import { scrollToSection } from '../lib/scroll'

function Particles() {
  const dots = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        left: `${(i * 17) % 100}%`,
        top: `${(i * 23) % 100}%`,
        delay: (i % 8) * 0.15,
        dur: 4 + (i % 5),
      })),
    [],
  )

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d) => (
        <motion.span
          key={d.id}
          className="absolute h-0.5 w-0.5 rounded-full bg-lime/40"
          style={{ left: d.left, top: d.top }}
          animate={{ opacity: [0.15, 0.55, 0.15], y: [0, -18, 0] }}
          transition={{ duration: d.dur, repeat: Infinity, delay: d.delay, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

export function HeroSection() {
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const x = useSpring(useTransform(mx, [-0.5, 0.5], [-18, 18]), { stiffness: 120, damping: 22 })
  const y = useSpring(useTransform(my, [-0.5, 0.5], [-14, 14]), { stiffness: 120, damping: 22 })

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const nx = e.clientX / window.innerWidth - 0.5
    const ny = e.clientY / window.innerHeight - 0.5
    mx.set(nx)
    my.set(ny)
  }

  const onLeave = () => {
    mx.set(0)
    my.set(0)
  }

  return (
    <section
      id="home"
      className="relative flex min-h-screen scroll-mt-24 flex-col justify-center overflow-hidden bg-white pt-24"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '56px 56px',
        }}
      />
      <motion.div
        className="pointer-events-none absolute -left-1/4 top-0 h-[70%] w-[80%] rounded-full bg-lime-radial blur-3xl"
        aria-hidden
        animate={{ opacity: [0.35, 0.55, 0.35], scale: [1, 1.04, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute -right-1/4 bottom-0 h-[50%] w-[70%] bg-[radial-gradient(ellipse_at_center,rgba(127,255,0,0.12),transparent_70%)] blur-3xl"
        aria-hidden
        animate={{ opacity: [0.25, 0.45, 0.25] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute inset-x-0 top-[18%] h-px bg-gradient-to-r from-transparent via-lime/50 to-transparent"
          animate={{ x: ['-8%', '8%', '-8%'], opacity: [0.35, 0.75, 0.35] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute inset-x-0 top-[42%] h-px bg-gradient-to-r from-transparent via-lime/35 to-transparent"
          animate={{ x: ['6%', '-6%', '6%'], opacity: [0.2, 0.55, 0.2] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <Particles />
      <div className="scanlines absolute inset-0" />

      <div className="relative z-10 mx-auto max-w-6xl px-5 md:px-8">
        <motion.div style={{ x, y }} className="max-w-4xl">
          <p className="mb-4 font-sans text-[11px] font-semibold uppercase tracking-[0.35em] text-charcoal/55">
            Creative digital studio
          </p>
          <h1 className="font-display text-[clamp(3.2rem,12vw,7.5rem)] font-extrabold leading-[0.92] text-ink">
            <span className="glitch-hero" data-text="4RinLabs">
              <span className="relative z-10">4RinLabs</span>
            </span>
          </h1>
          <p className="mt-6 max-w-lg font-sans text-lg font-medium text-charcoal/70 md:text-xl">
            Digital experiences, built right.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <MagneticButton
              className="btn-glitch rounded-full border border-ink bg-ink px-8 py-3.5 font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-white shadow-[0_0_0_1px_rgba(127,255,0,0.15)] transition hover:border-lime/60 hover:shadow-lime-glow"
              onClick={() => scrollToSection('portfolio')}
            >
              View work
            </MagneticButton>
            <MagneticButton
              className="btn-glitch rounded-full border border-charcoal/20 bg-white px-8 py-3.5 font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-ink transition hover:border-lime/50 hover:shadow-lime-glow"
              onClick={() => scrollToSection('contact')}
            >
              Contact us
            </MagneticButton>
          </div>
        </motion.div>
      </div>

      <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 md:bottom-10">
        <motion.div
          className="h-8 w-5 rounded-full border border-charcoal/20"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.div
            className="mx-auto mt-1.5 h-1.5 w-1 rounded-full bg-lime/80"
            animate={{ y: [0, 10, 0], opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      </div>
    </section>
  )
}
