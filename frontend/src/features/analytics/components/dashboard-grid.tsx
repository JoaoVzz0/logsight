import type { ReactNode } from 'react'

export function DashboardGrid({ children }: { readonly children: ReactNode }) {
  return (
    <div
      data-testid="dashboard-grid"
      className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {children}
    </div>
  )
}
