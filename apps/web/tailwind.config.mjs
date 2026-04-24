/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paper (primary surfaces)
        paper: {
          DEFAULT: '#FAFAF7',
          elevated: '#FFFFFF',
          subtle: '#F4F4EF',
          sunken: '#EEEEE8',
        },
        ink: {
          DEFAULT: '#0A0A0B',
          secondary: '#3E3E42',
          muted: '#6B6B70',
          tertiary: '#A8A8AD',
        },

        // Manila/kraft — deeper cream tones for the ledger band
        manila: {
          DEFAULT: '#EFE7D4',       // main kraft tone — visibly warmer than paper
          elevated: '#F5EED9',      // lighter (table rows)
          raised: '#E9DFC4',         // zebra stripe
          border: '#C9BF9E',         // darker edge
        },

        // Accents
        signal: {
          DEFAULT: '#00D084',
          deep: '#00A368',           // for text on cream (more legible than pure signal)
          soft: 'rgba(0, 208, 132, 0.12)',
          glow: 'rgba(0, 208, 132, 0.35)',
        },
        warn: {
          DEFAULT: '#FF6B35',
          deep: '#D94F1A',           // text on cream
          soft: 'rgba(255, 107, 53, 0.12)',
        },

        rule: {
          subtle: '#ECECE8',
          DEFAULT: '#D4D4D0',
          strong: '#B8B8B3',
        },
      },
      fontFamily: {
        display: ['var(--font-instrument-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        hero: ['clamp(4.5rem, 10vw, 9rem)', { lineHeight: '0.9', letterSpacing: '-0.03em' }],
        display: ['clamp(2.75rem, 5.5vw, 4.5rem)', { lineHeight: '0.98', letterSpacing: '-0.02em' }],
        h2: ['clamp(1.875rem, 3.75vw, 2.75rem)', { lineHeight: '1.05', letterSpacing: '-0.015em' }],
      },
      animation: {
        'fade-in-up': 'fadeInUp 700ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'pulse-dot': 'pulseDot 1.8s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
        'pulse-row': 'pulseRow 2s ease-out',
        blink: 'blink 1.1s step-end infinite',
        'ticker': 'ticker 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%, 100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(0,208,132,0.5)' },
          '50%': { transform: 'scale(1.15)', boxShadow: '0 0 0 6px rgba(0,208,132,0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        pulseRow: {
          '0%': { backgroundColor: 'rgba(0, 208, 132, 0.18)' },
          '100%': { backgroundColor: 'rgba(0, 208, 132, 0)' },
        },
        blink: {
          '0%, 60%, 100%': { opacity: '1' },
          '30%, 90%': { opacity: '0' },
        },
        ticker: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(10,10,11,0.02) inset, 0 1px 2px rgba(10,10,11,0.04), 0 8px 24px -8px rgba(10,10,11,0.08)',
        'card-hover': '0 1px 0 0 rgba(10,10,11,0.03) inset, 0 2px 4px rgba(10,10,11,0.06), 0 16px 40px -12px rgba(10,10,11,0.14)',
        'ledger': '0 1px 2px rgba(120,90,30,0.08), 0 12px 32px -12px rgba(120,90,30,0.18)',
      },
    },
  },
  plugins: [],
};
