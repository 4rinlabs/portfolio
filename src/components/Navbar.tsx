import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { scrollToSection } from '../lib/scroll'

const LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'services', label: 'Services' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'faq', label: 'FAQ' },
  { id: 'contact', label: 'Contact' },
] as const

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const go = (id: string) => {
    scrollToSection(id)
    setMobileOpen(false)
  }

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-lime/25 bg-white/70 shadow-[0_12px_40px_rgba(0,0,0,0.06)] backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
      style={
        scrolled
          ? { boxShadow: '0 0 0 1px rgba(127, 255, 0, 0.12), 0 12px 40px rgba(0,0,0,0.06)' }
          : undefined
      }
    >
      <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between px-5 md:px-8">
        <button
          type="button"
          onClick={() => go('home')}
          data-text="4RinLabs"
          className="nav-brand-glitch font-display text-sm font-bold uppercase tracking-[0.2em] text-ink md:text-base"
        >
          4RinLabs
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              data-text={link.label.toUpperCase()}
              onClick={() => go(link.id)}
              className="nav-glitch relative rounded-full px-3 py-2 font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-charcoal/80 transition-colors hover:text-ink"
            >
              <span>{link.label}</span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-charcoal/10 text-ink md:hidden"
          aria-expanded={mobileOpen}
          aria-label="Toggle menu"
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] as const }}
            className="border-t border-charcoal/10 bg-white/95 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-4">
              {LINKS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => go(link.id)}
                  className="rounded-lg px-3 py-3 text-left font-display text-sm font-semibold uppercase tracking-[0.14em] text-ink hover:bg-lime/10"
                >
                  {link.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
