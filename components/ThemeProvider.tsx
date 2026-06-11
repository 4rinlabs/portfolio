// // 'use client'

// // import {
// //   createContext,
// //   useCallback,
// //   useContext,
// //   useEffect,
// //   useMemo,
// //   useState,
// //   type ReactNode,
// // } from 'react'

// // export type Theme = 'light' | 'dark'

// // type ThemeContextValue = {
// //   theme: Theme
// //   setTheme: (theme: Theme) => void
// //   toggleTheme: () => void
// // }

// // const ThemeContext = createContext<ThemeContextValue | null>(null)

// // function readStoredTheme(): Theme {
// //   if (typeof window === 'undefined') {
// //     return 'dark'
// //   }

// //   const stored = localStorage.getItem('theme')

// //   if (stored === 'light' || stored === 'dark') {
// //     return stored
// //   }

// //   return 'dark'
// // }

// // function applyTheme(theme: Theme) {
// //   document.documentElement.setAttribute('data-theme', theme)
// //   localStorage.setItem('theme', theme)
// // }

// // export function ThemeProvider({ children }: { children: ReactNode }) {
// //   const [theme, setThemeState] = useState<Theme>(readStoredTheme)

// //   useEffect(() => {
// //     applyTheme(theme)
// //   }, [theme])

// //   const setTheme = useCallback((next: Theme) => {
// //     setThemeState(next)
// //   }, [])

// //   const toggleTheme = useCallback(() => {
// //     setThemeState((current) =>
// //       current === 'light' ? 'dark' : 'light'
// //     )
// //   }, [])

// //   const value = useMemo(
// //     () => ({
// //       theme,
// //       setTheme,
// //       toggleTheme,
// //     }),
// //     [theme, setTheme, toggleTheme],
// //   )

// //   return (
// //     <ThemeContext.Provider value={value}>
// //       {children}
// //     </ThemeContext.Provider>
// //   )
// // }

// // export function useTheme() {
// //   const ctx = useContext(ThemeContext)

// //   if (!ctx) {
// //     throw new Error('useTheme must be used within ThemeProvider')
// //   }

// //   return ctx
// // }

// 'use client'

// import {
//   createContext,
//   useCallback,
//   useContext,
//   useEffect,
//   useMemo,
//   useState,
//   type ReactNode,
// } from 'react'

// export type Theme = 'light' | 'dark'

// type ThemeContextValue = {
//   theme: Theme
//   mounted: boolean
//   setTheme: (theme: Theme) => void
//   toggleTheme: () => void
// }

// const ThemeContext = createContext<ThemeContextValue | null>(null)

// export function ThemeProvider({ children }: { children: ReactNode }) {
//   const [theme, setThemeState] = useState<Theme>('dark')
//   const [mounted, setMounted] = useState(false)

//   useEffect(() => {
//     const stored = localStorage.getItem('theme')

//     if (stored === 'light' || stored === 'dark') {
//       setThemeState(stored)
//       document.documentElement.setAttribute('data-theme', stored)
//     } else {
//       document.documentElement.setAttribute('data-theme', 'dark')
//       localStorage.setItem('theme', 'dark')
//     }

//     setMounted(true)
//   }, [])

//   useEffect(() => {
//     if (!mounted) return

//     document.documentElement.setAttribute('data-theme', theme)
//     localStorage.setItem('theme', theme)
//   }, [theme, mounted])

//   const setTheme = useCallback((next: Theme) => {
//     setThemeState(next)
//   }, [])

//   const toggleTheme = useCallback(() => {
//     setThemeState((current) =>
//       current === 'light' ? 'dark' : 'light'
//     )
//   }, [])

//   const value = useMemo(
//     () => ({
//       theme,
//       mounted,
//       setTheme,
//       toggleTheme,
//     }),
//     [theme, mounted, setTheme, toggleTheme],
//   )

//   return (
//     <ThemeContext.Provider value={value}>
//       {children}
//     </ThemeContext.Provider>
//   )
// }

// export function useTheme() {
//   const ctx = useContext(ThemeContext)

//   if (!ctx) {
//     throw new Error('useTheme must be used within ThemeProvider')
//   }

//   return ctx
// }

'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark'

type ThemeContextValue = {
  theme: Theme
  mounted: boolean
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('theme')

    if (stored === 'light' || stored === 'dark') {
      setThemeState(stored)
      document.documentElement.setAttribute('data-theme', stored)
    } else {
      document.documentElement.setAttribute('data-theme', 'dark')
      localStorage.setItem('theme', 'dark')
    }

    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme, mounted])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) =>
      current === 'light' ? 'dark' : 'light'
    )
  }, [])

  const value = useMemo(
    () => ({
      theme,
      mounted,
      setTheme,
      toggleTheme,
    }),
    [theme, mounted, setTheme, toggleTheme],
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)

  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }

  return ctx
}