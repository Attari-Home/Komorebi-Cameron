import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],

  // Theme is driven by <html data-theme="dark|light">, set before first paint
  // by the inline script in Layout.astro.
  darkMode: ['selector', '[data-theme="dark"]'],

  theme: {
    extend: {
      colors: {
        // Semantic tokens — values are swapped by CSS variables per theme.
        // Stored as space-separated RGB channels so opacity modifiers work
        // (e.g. bg-bg/80, text-fg/60, border-sakura-a/40).
        bg: 'rgb(var(--bg) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        'fg-muted': 'rgb(var(--fg-muted) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'sakura-a': 'rgb(var(--sakura-a) / <alpha-value>)',
        'sakura-b': 'rgb(var(--sakura-b) / <alpha-value>)',

        // Static brand constants (theme-independent).
        obsidian: '#0A0A0C',
        cream: '#F9F9FB',
        blossom: '#FAF7F8',
        sakura: {
          DEFAULT: '#FF70A6',
          light: '#FFB7C5',
        },
      },

      fontFamily: {
        display: [
          '"Cormorant Garamond"',
          '"Cormorant"',
          '"EB Garamond"',
          'Georgia',
          '"Times New Roman"',
          ...defaultTheme.fontFamily.serif,
        ],
        sans: [
          '"Plus Jakarta Sans Variable"',
          '"Plus Jakarta Sans"',
          ...defaultTheme.fontFamily.sans,
        ],
      },

      fontSize: {
        // Fluid hero scale.
        'display-xl': ['clamp(3.5rem, 9vw, 8.5rem)', { lineHeight: '0.95', letterSpacing: '-0.03em' }],
        'display-lg': ['clamp(2.25rem, 6vw, 5.5rem)', { lineHeight: '1', letterSpacing: '-0.025em' }],
        'display-md': ['clamp(1.75rem, 3.5vw, 3rem)', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      },

      backgroundImage: {
        'sakura-gradient': 'linear-gradient(120deg, #FF70A6 0%, #FFB7C5 100%)',
        'sakura-gradient-soft':
          'linear-gradient(120deg, rgb(var(--sakura-a) / 0.16) 0%, rgb(var(--sakura-b) / 0.06) 100%)',
        'radial-glow':
          'radial-gradient(60% 60% at 50% 40%, rgb(var(--sakura-a) / 0.18) 0%, transparent 70%)',
      },

      boxShadow: {
        'glow-sm': '0 0 18px -4px rgb(var(--sakura-a) / 0.55)',
        'glow-md': '0 0 40px -8px rgb(var(--sakura-a) / 0.55)',
        'glow-lg': '0 0 80px -12px rgb(var(--sakura-a) / 0.6)',
        glass: '0 8px 32px -8px rgb(0 0 0 / 0.35), inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
      },

      backdropBlur: {
        glass: '24px',
      },

      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-quart': 'cubic-bezier(0.76, 0, 0.24, 1)',
      },

      keyframes: {
        'petal-glow': {
          '0%, 100%': { opacity: '0.75', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.12)' },
        },
        'border-sweep': {
          '0%': { '--sweep-angle': '0deg' },
          '100%': { '--sweep-angle': '360deg' },
        },
        'fade-rise': {
          '0%': { opacity: '0', transform: 'translate3d(0, 24px, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-120%) skewX(-18deg)' },
          '100%': { transform: 'translateX(220%) skewX(-18deg)' },
        },
        'theme-spin': {
          '0%': { transform: 'rotate(-90deg) scale(0.6)', opacity: '0' },
          '100%': { transform: 'rotate(0deg) scale(1)', opacity: '1' },
        },
      },

      animation: {
        'petal-glow': 'petal-glow 4s ease-in-out infinite',
        'border-sweep': 'border-sweep 6s linear infinite',
        'fade-rise': 'fade-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
        'gradient-shift': 'gradient-shift 8s ease-in-out infinite',
        shimmer: 'shimmer 2.4s ease-in-out infinite',
        'theme-spin': 'theme-spin 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },

  plugins: [],
};
