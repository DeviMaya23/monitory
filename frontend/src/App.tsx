import { Outlet, type RouteObject } from 'react-router'
import { ToastProvider } from './components/ui/Toast'
import { AdminLayout } from './app-shell/AdminLayout'
import { NotBuilt } from './app-shell/NotBuilt'
import { SessionProvider } from './app-shell/SessionProvider'
import AlertListPage from './pages/AlertListPage'
import AddServicePage from './pages/AddServicePage'
import EditServicePage from './pages/EditServicePage'
import DashboardPage from './pages/DashboardPage'
import PublicDashboardPage from './pages/PublicDashboardPage'
import SignInPage from './pages/SignInPage'

/**
 * The route table (ARCHITECTURE.md), as data for a data router. Each page replaces its
 * placeholder when its task builds it. The root element holds the toasts, so one outlives a route change.
 */
export const appRoutes: RouteObject[] = [
  {
    element: (
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    ),
    children: [
      {
        element: (
          <SessionProvider>
            <Outlet />
          </SessionProvider>
        ),
        children: [
          { path: '/sign-in', element: <SignInPage /> },
          {
            element: <AdminLayout />,
            children: [
              { path: '/', element: <DashboardPage /> },
              { path: '/services/new', element: <AddServicePage /> },
              { path: '/services/:serviceId', element: <EditServicePage /> },
              { path: '/services/:serviceId/alerts', element: <AlertListPage /> },
              { path: '*', element: <NotBuilt page="requested" /> },
            ],
          },
        ],
      },
      { path: '/status', element: <PublicDashboardPage /> },
    ],
  },
]
