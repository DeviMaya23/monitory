import type { ReactNode, Ref } from 'react'
import { CircleAlert } from 'lucide-react'
import { CsrfBanner, UnexpectedBanner } from '../../../components/FailureBanners'
import type { SaveFailure } from '../hooks/useSaveTarget'

type Props = {
  /** The failure of the action started last; only the kinds that are banners show here. */
  failure: SaveFailure | null
  /** An edit is open: `full` is not a banner there. */
  editing: boolean
  /** "Try again": repeat the action that failed, the save or the test, as the form is. */
  onRetry: () => void
  /** "Close and refresh" of a target that is gone. */
  onCloseAndRefresh: () => void
  /** That banner's button, so focus can be moved to it. */
  refreshRef: Ref<HTMLButtonElement>
  /** The error summary, which sits in the same live region. */
  children?: ReactNode
}

function Banner({ failure, editing, onRetry, onCloseAndRefresh, refreshRef }: Omit<Props, 'children'>) {
  switch (failure?.kind) {
    case 'full':
      return (
        <div className="banner banner--error" role="alert">
          <CircleAlert className="icon" aria-hidden="true" />
          <div className="banner__body">
            <span className="banner__title">This alert list is full.</span>
            <span>Remove a target before adding another.</span>
          </div>
        </div>
      )
    case 'not-found':
      // On an add the dialog has closed already.
      if (!editing) return null
      return (
        <div className="banner banner--error" role="alert">
          <CircleAlert className="icon" aria-hidden="true" />
          <div className="banner__body">
            <span className="banner__title">This target no longer exists.</span>
            <span>It was removed, perhaps in another tab.</span>
          </div>
          <div className="banner__actions">
            <button type="button" className="btn" ref={refreshRef} onClick={onCloseAndRefresh}>
              <span>Close and refresh</span>
            </button>
          </div>
        </div>
      )
    case 'csrf':
      return <CsrfBanner />
    case 'unexpected':
      return <UnexpectedBanner onRetry={onRetry} />
    default:
      return null
  }
}

/** The dialog's live region: the error summary first, then the banner of a save that failed as a whole. */
export function TargetDialogBanners({ children, ...banner }: Props) {
  return (
    <div className="form-banners" aria-live="polite">
      {children}
      <Banner {...banner} />
    </div>
  )
}
