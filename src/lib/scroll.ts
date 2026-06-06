const HEADER_OFFSET = 88

export function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return

  const y = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET
  const startY = window.scrollY
  const dist = y - startY
  const duration = 720
  const t0 = performance.now()

  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

  const step = (now: number) => {
    const t = Math.min((now - t0) / duration, 1)
    window.scrollTo(0, startY + dist * ease(t))
    if (t < 1) requestAnimationFrame(step)
  }

  requestAnimationFrame(step)
}
