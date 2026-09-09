import { setThemePreference, useThemePreference, type ThemePreference } from './theme-store'

const OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
]

export function ThemeSelector() {
  const preference = useThemePreference()

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex rounded-lg border border-border bg-surface-raised p-0.5"
    >
      {OPTIONS.map((option) => {
        const isSelected = option.value === preference
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => setThemePreference(option.value)}
            className={
              isSelected
                ? 'rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground'
                : 'rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground'
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
