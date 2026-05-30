import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Semantic surface tokens (light/dark via CSS vars) ──────────
        base:    'rgb(var(--color-base)    / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        raised:  'rgb(var(--color-raised)  / <alpha-value>)',
        edge:    'rgb(var(--color-edge)    / <alpha-value>)',
        // ── Semantic text tokens ──────────────────────────────────────
        ink: {
          1: 'rgb(var(--color-ink-1) / <alpha-value>)',
          2: 'rgb(var(--color-ink-2) / <alpha-value>)',
          3: 'rgb(var(--color-ink-3) / <alpha-value>)',
        },
        // ── Legacy brand palette (kept for any remaining uses) ─────────
        brand: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          900: '#4c1d95',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(139,92,246,0.3), transparent)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}

export default config
