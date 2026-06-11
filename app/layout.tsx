// import type { Metadata } from 'next'
// import { DM_Sans, Syne } from 'next/font/google'
// import './globals.css'
// import { defaultMetadata } from '@/lib/metadata'

// const dmSans = DM_Sans({
//   subsets: ['latin'],
//   variable: '--font-dm-sans',
//   display: 'swap',
//   axes: ['opsz'],
// })

// const syne = Syne({
//   subsets: ['latin'],
//   weight: ['500', '600', '700', '800'],
//   variable: '--font-syne',
//   display: 'swap',
// })

// export const metadata: Metadata = defaultMetadata

// export default function RootLayout({
//   children,
// }: {
//   children: React.ReactNode
// }) {
//   return (
//     <html lang="en" suppressHydrationWarning>
//       <head>
//         {/* Prevent theme flash — must be blocking inline script */}
//         <script
//           dangerouslySetInnerHTML={{
//             __html: `(function(){var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')})()`,
//           }}
//         />
//       </head>
//       <body
//         className={`${dmSans.variable} ${syne.variable} font-sans antialiased`}
//         suppressHydrationWarning
//       >
//         {children}
//       </body>
//     </html>
//   )
// }


import type { Metadata } from 'next'
import { DM_Sans, Syne } from 'next/font/google'
import './globals.css'
import { defaultMetadata } from '@/lib/metadata'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  axes: ['opsz'],
})

const syne = Syne({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-syne',
  display: 'swap',
})

export const metadata: Metadata = defaultMetadata

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${syne.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  )
}