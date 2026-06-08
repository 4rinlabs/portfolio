import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { scrollToSection } from '../lib/scroll'
import { ThemeToggle } from './ThemeToggle'

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
    <header className={`nav-shell fixed inset-x-0 top-0 z-50 transition-all duration-[400ms] ${scrolled ? 'nav-shell-scrolled' : ''}`}>
      <div className="site-container flex h-[4.5rem] items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => go('home')}
          data-text="4RinLabs"
          className="nav-brand-glitch shrink-0 font-display text-sm font-bold uppercase tracking-[0.2em] md:text-base"
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
              className="nav-glitch nav-link relative rounded-full px-3 py-2 font-sans text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors duration-[400ms]"
            >
              <span>{link.label}</span>
            </button>
          ))}
          <div className="nav-theme-toggle-wrap ml-0.5 flex items-center pl-3">
            <ThemeToggle />
          </div>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="theme-toggle flex h-10 w-10 items-center justify-center rounded-lg"
            aria-expanded={mobileOpen}
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] as const }}
            className="nav-mobile-panel border-t md:hidden"
          >
            <div className="site-container flex flex-col gap-1 py-4">
              {LINKS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => go(link.id)}
                  className="nav-mobile-link rounded-lg px-3 py-3 text-left font-display text-sm font-semibold uppercase tracking-[0.14em]"
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
