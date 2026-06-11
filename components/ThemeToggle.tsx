'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from './ThemeProvider'

type ThemeToggleProps = {
  className?: string
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-[400ms] ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? (
        <Sun size={16} strokeWidth={1.75} aria-hidden />
      ) : (
        <Moon size={16} strokeWidth={1.75} aria-hidden />
      )}
    </button>
  )
}
