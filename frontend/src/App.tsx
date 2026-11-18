import { Outlet, Route, Routes } from 'react-router'
import { ToastProvider } from './components/ui/Toast'
import { AdminLayout } from './app-shell/AdminLayout'
import { NotBuilt } from './app-shell/NotBuilt'
import { SessionProvider } from './app-shell/SessionProvider'
import AlertListPage from './pages/AlertListPage'
import AddServicePage from './pages/AddServicePage'
import DashboardPage from './pages/DashboardPage'
import SignInPage from './pages/SignInPage'

/** The route table (ARCHITECTURE.md). Each page replaces its placeholder when its task builds it. */
export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route
          element={
            <SessionProvider>
              <Outlet />
            </SessionProvider>
          }
        >
          <Route path="/sign-in" element={<SignInPage />} />
          <Route element={<AdminLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/services/new" element={<AddServicePage />} />
            <Route path="/services/:serviceId" element={<NotBuilt page="edit service" />} />
            <Route path="/services/:serviceId/alerts" element={<AlertListPage />} />
            <Route path="*" element={<NotBuilt page="requested" />} />
          </Route>
        </Route>
        <Route path="/status" element={<NotBuilt page="public status" />} />
      </Routes>
    </ToastProvider>
  )
}
