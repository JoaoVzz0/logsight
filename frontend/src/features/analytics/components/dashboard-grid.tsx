import type { ReactNode } from 'react'

export function DashboardGrid({ children }: { readonly children: ReactNode }) {
  return (
    <div
      data-testid="dashboard-grid"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {children}
    </div>
  )
}
