import { Activity, LogOut } from 'lucide-react'
import { Link, Navigate, Outlet } from 'react-router'
import { LeaveGateProvider } from '../components/LeaveGateProvider'
import { useLeaveGate } from '../hooks/useLeaveGate'
import { useSession } from './useSession'

/** The gate for admin routes, and the top bar every admin page sits under. */
export function AdminLayout() {
  const { state } = useSession()

  if (state === 'checking') return null
  if (state !== 'signed-in') return <Navigate to="/sign-in" replace />

  return (
    <LeaveGateProvider>
      <Shell />
    </LeaveGateProvider>
  )
}

function Shell() {
  const { signingOut, signOut } = useSession()
  const { confirmLeave } = useLeaveGate()

  return (
    <>
      <header className="topbar">
        <Link className="brand" to="/">
          <Activity className="icon" aria-hidden="true" />
          <span>Monitory</span>
        </Link>
        <span className="topbar__spacer" />
        <button type="button" className="btn btn--ghost" disabled={signingOut} onClick={() => confirmLeave(signOut)}>
          <LogOut className="icon icon--sm" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </header>
      <Outlet />
    </>
  )
}
