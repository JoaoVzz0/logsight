import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './app-layout'
import { DashboardPage } from '../features/analytics/pages/dashboard-page'
import { IssuesPage } from '../features/issues/pages/issues-page'
import { LogsPage } from '../features/logs/pages/logs-page'
import { ImportsPage } from '../features/imports/pages/imports-page'

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'issues', element: <IssuesPage /> },
      { path: 'logs', element: <LogsPage /> },
      { path: 'imports', element: <ImportsPage /> },
    ],
  },
])
