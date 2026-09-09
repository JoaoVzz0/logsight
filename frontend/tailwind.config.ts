import type { Config } from 'tailwindcss'

const hsl = (name: string) => `hsl(var(--${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: hsl('background'),
        foreground: hsl('foreground'),
        card: {
          DEFAULT: hsl('card'),
          foreground: hsl('card-foreground'),
        },
        popover: {
          DEFAULT: hsl('popover'),
          foreground: hsl('popover-foreground'),
        },
        primary: {
          DEFAULT: hsl('primary'),
          foreground: hsl('primary-foreground'),
        },
        secondary: {
          DEFAULT: hsl('secondary'),
          foreground: hsl('secondary-foreground'),
        },
        muted: {
          DEFAULT: hsl('muted'),
          foreground: hsl('muted-foreground'),
        },
        accent: {
          DEFAULT: hsl('accent'),
          foreground: hsl('accent-foreground'),
          subtle: hsl('accent-subtle'),
        },
        destructive: {
          DEFAULT: hsl('destructive'),
          foreground: hsl('destructive-foreground'),
        },
        border: {
          DEFAULT: hsl('border'),
          strong: hsl('border-strong'),
        },
        input: hsl('input'),
        ring: hsl('ring'),
        surface: {
          DEFAULT: hsl('surface'),
          raised: hsl('surface-raised'),
        },
        severity: {
          trace: hsl('severity-trace'),
          debug: hsl('severity-debug'),
          info: hsl('severity-info'),
          warn: hsl('severity-warn'),
          error: hsl('severity-error'),
          fatal: hsl('severity-fatal'),
        },
        'severity-subtle': {
          trace: hsl('severity-trace-subtle'),
          debug: hsl('severity-debug-subtle'),
          info: hsl('severity-info-subtle'),
          warn: hsl('severity-warn-subtle'),
          error: hsl('severity-error-subtle'),
          fatal: hsl('severity-fatal-subtle'),
        },
        chart: {
          1: hsl('chart-1'),
          2: hsl('chart-2'),
          3: hsl('chart-3'),
          4: hsl('chart-4'),
          5: hsl('chart-5'),
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      spacing: {
        row: 'var(--row-height)',
      },
    },
  },
} satisfies Config
