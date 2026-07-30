import { Navbar } from '@/components/Navbar'
import { HeroSection } from '@/components/HeroSection'
import { ServicesSection } from '@/components/ServicesSection'
import { PortfolioSection } from '@/components/PortfolioSection'
import { ProductsSection } from '@/components/ProductsSection'
import { FaqSection } from '@/components/FAQSection'
import { ContactSection } from '@/components/ContactSection'
import { SiteFooter } from '@/components/SiteFooter'
import { StructuredData } from '@/components/StructuredData'
import { ThemeProvider } from '@/components/ThemeProvider'
import { BlogPreviewSection } from '@/components/BlogPreviewSection'
import { HomeScrollHandler } from '@/components/HomeScrollHandler'

export default function HomePage() {
  return (
    <ThemeProvider>
      <StructuredData />

      <div className="app-shell relative min-h-screen font-sans antialiased">
        <Navbar />

        <main>
          <HomeScrollHandler />

          <HeroSection />

          <ServicesSection />

          <PortfolioSection />

          <ProductsSection />

          <BlogPreviewSection />

          <FaqSection />

          <ContactSection />
        </main>

        <SiteFooter />
      </div>
    </ThemeProvider>
  )
}
