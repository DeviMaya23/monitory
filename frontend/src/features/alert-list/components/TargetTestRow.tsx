import type { Ref } from 'react'
import { CircleAlert, CircleCheck, LoaderCircle, Send } from 'lucide-react'
import type { TargetTestResult } from '../../../lib/api/targets'

const TEXT = {
  button: 'Send test alert',
  sending: 'Sending…',
  hint: 'Sends one alert to this target only, using the values above. Nothing is saved.',
  inFlight: 'Sending one test alert…',
  delivered: 'Delivered.',
  failed: 'Failed.',
  failedWith: 'Failed: ',
} as const

type Props = {
  /** A test is in flight. */
  testing: boolean
  /** The result that applies to the values now in the form; null shows the hint. */
  result: TargetTestResult | null
  onSend: () => void
  buttonRef: Ref<HTMLButtonElement>
}

function Result({ testing, result }: Pick<Props, 'testing' | 'result'>) {
  if (testing) {
    return (
      <p className="notice notice--muted">
        <LoaderCircle className="icon icon--sm spinner" aria-hidden="true" />
        <span>{TEXT.inFlight}</span>
      </p>
    )
  }
  if (result === null) return <span className="hint">{TEXT.hint}</span>
  if (result.delivered) {
    return (
      <p className="notice notice--ok">
        <CircleCheck className="icon icon--sm" aria-hidden="true" />
        <span>{TEXT.delivered}</span>
      </p>
    )
  }
  return (
    <p className="notice notice--bad">
      <CircleAlert className="icon icon--sm" aria-hidden="true" />
      {result.failure_reason ? (
        <span>
          {TEXT.failedWith}
          <span className="plain-text">{result.failure_reason}</span>
        </span>
      ) : (
        <span>{TEXT.failed}</span>
      )}
    </p>
  )
}

/** The dialog's "Send test alert" row (FR-107). The button is `aria-disabled` while testing, so that it keeps focus. */
export function TargetTestRow({ testing, result, onSend, buttonRef }: Props) {
  return (
    <div className="test-row">
      <button
        type="button"
        className="btn"
        ref={buttonRef}
        aria-disabled={testing ? 'true' : undefined}
        aria-busy={testing ? 'true' : undefined}
        onClick={() => {
          if (!testing) onSend()
        }}
      >
        {testing ? (
          <LoaderCircle className="icon icon--sm spinner" aria-hidden="true" />
        ) : (
          <Send className="icon icon--sm" aria-hidden="true" />
        )}
        <span>{testing ? TEXT.sending : TEXT.button}</span>
      </button>
      <div className="test-row__result" aria-live="polite">
        <Result testing={testing} result={result} />
      </div>
    </div>
  )
}
