import { Activity, LogOut } from 'lucide-react'
import { Link, Navigate, Outlet } from 'react-router'
import { useSession } from './useSession'

/** The gate for admin routes, and the top bar every admin page sits under. */
export function AdminLayout() {
  const { state, signingOut, signOut } = useSession()

  if (state === 'checking') return null
  if (state !== 'signed-in') return <Navigate to="/sign-in" replace />

  return (
    <>
      <header className="topbar">
        <Link className="brand" to="/">
          <Activity className="icon" aria-hidden="true" />
          <span>Monitory</span>
        </Link>
        <span className="topbar__spacer" />
        <button type="button" className="btn btn--ghost" disabled={signingOut} onClick={signOut}>
          <LogOut className="icon icon--sm" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </header>
      <Outlet />
    </>
  )
}
