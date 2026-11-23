import { ExternalLink } from 'lucide-react'
import { Switch } from '../../../components/ui/Switch'
import type { PublicViewFlow } from '../hooks/usePublicView'

/** The toolbar's "Public page" switch and the link that opens the public page in a new tab (FR-26, FR-28). */
export function PublicToggle({ publicView }: { publicView: PublicViewFlow }) {
  const settled = publicView.state === 'on' || publicView.state === 'off'
  return (
    <div className="public-toggle">
      <Switch
        label="Public page"
        checked={publicView.state === 'on'}
        onCheckedChange={publicView.toggle}
        disabled={!settled}
        hideState={!settled}
      />
      <span className="public-toggle__sep" aria-hidden="true" />
      <a className="btn btn--ghost btn--sm public-toggle__link" href="/status" target="_blank" rel="noopener noreferrer">
        <ExternalLink className="icon icon--sm" aria-hidden="true" />
        <span>Open</span>
        {/* The space is its own text node: a name computed with the span's leading space dropped reads "Openpublic". */}
        {' '}
        <span className="sr-only">public page (new tab)</span>
      </a>
    </div>
  )
}
