import { NavLink } from 'react-router-dom'
import { ThemeSelector } from './theme/theme-selector'

const LINKS: readonly { to: string; label: string }[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/issues', label: 'Issues' },
  { to: '/logs', label: 'Logs' },
  { to: '/imports', label: 'Imports' },
]

export function NavBar() {
  return (
    <header className="flex items-center gap-5 border-b border-border bg-surface-raised px-4 py-3">
      <span className="font-semibold">logsight</span>
      <nav className="flex items-center gap-5">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              isActive
                ? 'border-b-2 border-foreground pb-0.5 text-sm font-medium text-foreground'
                : 'border-b-2 border-transparent pb-0.5 text-sm text-muted-foreground hover:text-foreground'
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
