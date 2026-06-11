'use client'

import { useEffect } from 'react'
import { scrollToSection } from '@/lib/scroll'

/**
 * Placed once inside the home page layout.
 * On mount it checks whether the URL contains a hash (e.g. /#services)
 * and smoothly scrolls to the matching section.
 *
 * This is triggered when the user navigates from a blog page back to the
 * home page via the Navbar (router.push('/#<section>')).
 */
export function HomeScrollHandler() {
  useEffect(() => {
    const hash = window.location.hash.replace('#', '').trim()
    if (!hash) return

    // Give the page a moment to fully paint before scrolling.
    // Two rAF passes ensure layout is complete.
    const scroll = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToSection(hash)
          // Clean up the hash from the URL without adding a history entry.
          window.history.replaceState(null, '', window.location.pathname)
        })
      })
    }

    // If the document is already interactive/complete, scroll immediately.
    // Otherwise wait for load.
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      scroll()
    } else {
      window.addEventListener('load', scroll, { once: true })
    }
  }, [])

  return null
}
