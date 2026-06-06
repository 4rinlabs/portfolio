import { Navbar } from './components/Navbar'
import { HeroSection } from './components/HeroSection'
import { ServicesSection } from './components/ServicesSection'
import { PortfolioSection } from './components/PortfolioSection'
import { FaqSection } from './components/FAQSection'
import { ContactSection } from './components/ContactSection'

function App() {
  return (
    <div className="relative min-h-screen bg-white font-sans text-charcoal antialiased">
      <Navbar />
      <main>
        <HeroSection />
        <ServicesSection />
        <PortfolioSection />
        <FaqSection />
        <ContactSection />
      </main>
      <footer className="border-t border-charcoal/10 bg-mist py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-center md:flex-row md:px-8 md:text-left">
          <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-ink">4RinLabs</p>
          <p className="font-sans text-xs text-charcoal/55">© {new Date().getFullYear()} 4RinLabs. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default App
