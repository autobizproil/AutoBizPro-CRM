// landing/tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0d0d14',
        surface: '#111827',
        border: '#1f2937',
        primary: '#6366f1',
        'primary-soft': '#818cf8',
        'text-primary': '#f1f5f9',
        'text-muted': '#64748b',
        'text-dim': '#4b5563',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        hebrew: ['var(--font-heebo)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
