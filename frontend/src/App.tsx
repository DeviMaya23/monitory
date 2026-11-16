import { Outlet, Route, Routes } from 'react-router'
import { AdminLayout } from './app-shell/AdminLayout'
import { NotBuilt } from './app-shell/NotBuilt'
import { SessionProvider } from './app-shell/SessionProvider'
import SignInPage from './pages/SignInPage'

/** The route table (ARCHITECTURE.md). Each page replaces its placeholder when its task builds it. */
export default function App() {
  return (
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
          <Route path="/" element={<NotBuilt page="dashboard" />} />
          <Route path="/services/new" element={<NotBuilt page="add service" />} />
          <Route path="/services/:serviceId" element={<NotBuilt page="edit service" />} />
          <Route path="/services/:serviceId/alerts" element={<NotBuilt page="alert list" />} />
          <Route path="*" element={<NotBuilt page="requested" />} />
        </Route>
      </Route>
      <Route path="/status" element={<NotBuilt page="public status" />} />
    </Routes>
  )
}
