/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        lime: '#7fff00',
        'lime-dim': '#5fd400',
        charcoal: '#141414',
        ink: '#0a0a0a',
        mist: '#f5f5f5',
      },
      fontFamily: {
        display: ['Syne', 'system-ui', 'sans-serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'lime-glow': '0 0 0 1px rgba(127, 255, 0, 0.35), 0 0 32px rgba(127, 255, 0, 0.12)',
        'lime-glow-lg': '0 0 0 1px rgba(127, 255, 0, 0.45), 0 0 48px rgba(127, 255, 0, 0.18)',
      },
      backgroundImage: {
        'lime-fade': 'linear-gradient(135deg, rgba(127, 255, 0, 0.14) 0%, transparent 55%)',
        'lime-radial': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(127, 255, 0, 0.22), transparent 65%)',
      },
      maxWidth: {
        site: '90rem',
        'site-hero': '44rem',
      },
      screens: {
        '3xl': '1920px',
      },
    },
  },
  plugins: [],
}
