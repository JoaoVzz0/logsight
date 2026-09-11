import { Outlet } from 'react-router-dom'
import { NavBar } from './nav-bar'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />
      <main className="mx-auto max-w-[1180px] px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
