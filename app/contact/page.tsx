import { buildMetadata } from '@/lib/metadata'
import { Navbar } from '@/components/Navbar'
import { ContactSection } from '@/components/ContactSection'
import { SiteFooter } from '@/components/SiteFooter'
import { ThemeProvider } from '@/components/ThemeProvider'
import type { Metadata } from 'next'

export const metadata: Metadata = buildMetadata({
  title: 'Contact 4RinLabs | Start a Project',
  description:
    'Get in touch with 4RinLabs. Tell us about your project and we\'ll reply with a plan and next steps.',
  slug: 'contact',
})

export default function ContactPage() {
  return (
    <ThemeProvider>
      <div className="app-shell relative min-h-screen font-sans antialiased">
        <Navbar />
        <main className="pt-[4.5rem]">
          <ContactSection />
        </main>
        <SiteFooter />
      </div>
    </ThemeProvider>
  )
}
