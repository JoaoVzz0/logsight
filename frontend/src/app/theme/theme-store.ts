import { useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

let preference = readStoredPreference()

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isThemePreference(stored) ? stored : 'system'
}

function prefersDarkTheme(next: ThemePreference): boolean {
  if (next === 'system') return prefersDark.matches
  return next === 'dark'
}

function applyDocumentClass(): void {
  document.documentElement.classList.toggle('dark', prefersDarkTheme(preference))
}

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

prefersDark.addEventListener('change', () => {
  if (preference !== 'system') return
  applyDocumentClass()
  emit()
})

export function setThemePreference(next: ThemePreference): void {
  preference = next
  localStorage.setItem(STORAGE_KEY, next)
  applyDocumentClass()
  emit()
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => preference)
}
