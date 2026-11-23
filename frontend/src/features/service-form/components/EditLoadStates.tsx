import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft, CircleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { LoadFailedBanner } from '../../../components/FailureBanners'

/** The back link and the heading, which the loading and load-failed states keep. */
function Head({ children }: { children: ReactNode }) {
  return (
    <main className="page">
      <Link className="back-link" to="/">
        <ArrowLeft className="icon icon--sm" aria-hidden="true" />
        Services
      </Link>
      <div className="page-head">
        <div className="page-head__titles">
          <h1 className="page-title">Edit service</h1>
        </div>
      </div>
      {children}
    </main>
  )
}

/** `getService` has not answered: no form, only a status for assistive technology. */
export function EditLoading() {
  return (
    <Head>
      <p className="sr-only" role="status">
        Loading service…
      </p>
    </Head>
  )
}

/** `getService` failed (not a 404 `not_found`, not a 401): a banner with `Try again`. */
export function EditLoadFailed({ fetching, onRetry }: { fetching: boolean; onRetry: () => void }) {
  return (
    <Head>
      <LoadFailedBanner fetching={fetching} onRetry={onRetry} />
    </Head>
  )
}

/** `getService` answered 404 `not_found`: the whole page is replaced, and the heading takes focus. */
export function EditNotFound() {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <main className="page">
      <div className="empty">
        <CircleAlert className="icon empty__icon" aria-hidden="true" />
        <h2 className="empty__title" ref={heading} tabIndex={-1}>
          This service no longer exists
        </h2>
        <p>It was deleted, so it can’t be edited.</p>
        <Link className="btn btn--primary" to="/">
          Back to services
        </Link>
      </div>
    </main>
  )
}
