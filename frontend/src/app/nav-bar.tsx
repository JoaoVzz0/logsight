import { NavLink } from 'react-router-dom'

import { cn } from '../shared/lib/cn'

import { ThemeSelector } from './theme/theme-selector'

const LINKS: readonly { to: string; label: string }[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/issues', label: 'Issues' },
  { to: '/logs', label: 'Logs' },
  { to: '/imports', label: 'Imports' },
]

export function NavBar() {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-surface-raised px-6 py-3.5 shadow-sm">
      <span className="text-sm font-semibold tracking-tight text-foreground">
        logsight
      </span>
      <nav className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              )
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto">
        <ThemeSelector />
      </div>
    </header>
  )
}
