export function SiteFooter() {
  return (
    <footer className="site-footer border-t py-10">
      <div className="site-container flex flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
        <p className="font-display text-sm font-bold uppercase tracking-[0.2em]">4RinLabs</p>
        <p className="font-sans text-xs opacity-55">
          © {new Date().getFullYear()} 4RinLabs. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
