import { CircleAlert, RefreshCw, TriangleAlert } from 'lucide-react'
import type { ServiceTestResult } from '../../../lib/api/services'
import type { FailedKind, TestState } from '../hooks/useTestCheck'
import { resultView, TEST_TEXT } from '../lib/testResult'
import type { ServiceType } from '../lib/serviceType'

function Completed({ result, type }: { result: ServiceTestResult; type: ServiceType }) {
  const view = resultView(result, type)
  const { detail } = view
  return (
    <div className="test-result" role="status">
      <div className="test-result__verdict">
        {view.healthy ? (
          <span className="status status--ok">{TEST_TEXT.healthy}</span>
        ) : (
          <>
            <span className="status status--bad">{TEST_TEXT.failed}</span>
            <span className="test-result__reason">{view.reason}</span>
          </>
        )}
      </div>
      <dl className="meta">
        <div>
          <dt>{TEST_TEXT.took}</dt>
          <dd>{view.took}</dd>
        </div>
        {view.httpStatus !== null && (
          <div>
            <dt>{TEST_TEXT.http}</dt>
            <dd>{view.httpStatus}</dd>
          </div>
        )}
      </dl>
      {detail.kind === 'tcp' && <p className="hint">{TEST_TEXT.tcp}</p>}
      {detail.kind === 'no-response' && <p className="hint">{TEST_TEXT.noResponse}</p>}
      {(detail.kind === 'body' || detail.kind === 'no-body') && (
        <>
          <div className="body-head">
            <span className="body-head__label">{TEST_TEXT.bodyLabel}</span>
            <span className="subtle">{detail.label}</span>
          </div>
          {detail.kind === 'body' ? (
            <>
              <pre className="code-block" tabIndex={0} aria-label={TEST_TEXT.bodyLabel}>
                {detail.body}
              </pre>
              {detail.truncated && (
                <p className="truncated">
                  <TriangleAlert className="icon icon--sm" aria-hidden="true" />
                  {TEST_TEXT.truncated}
                </p>
              )}
            </>
          ) : (
            <p className="hint">{TEST_TEXT.noBody}</p>
          )}
        </>
      )}
    </div>
  )
}

const FAILED_TEXT: Record<FailedKind, string> = {
  csrf: TEST_TEXT.csrf,
  'too-large': TEST_TEXT.tooLarge,
  unexpected: TEST_TEXT.unexpected,
}

/** What the result area shows for the test's state; nothing while idle. */
export function TestResult({ state }: { state: TestState }) {
  switch (state.kind) {
    case 'running':
      return (
        <div className="test-result" role="status">
          <p className="notice notice--muted">{TEST_TEXT.runningNotice}</p>
        </div>
      )
    case 'result':
      return <Completed result={state.result} type={state.type} />
    case 'refused':
      return (
        <div className="test-result" role="alert">
          <p className="notice notice--bad">
            <CircleAlert className="icon icon--sm" aria-hidden="true" />
            {TEST_TEXT.notRun}
          </p>
        </div>
      )
    case 'failed':
      return (
        <div className="test-result" role="alert">
          <p className="notice notice--bad">
            <CircleAlert className="icon icon--sm" aria-hidden="true" />
            {FAILED_TEXT[state.reason]}
          </p>
          {state.reason === 'csrf' && (
            <div>
              <button type="button" className="btn" onClick={() => window.location.reload()}>
                <RefreshCw className="icon icon--sm" aria-hidden="true" />
                <span>{TEST_TEXT.reload}</span>
              </button>
            </div>
          )}
        </div>
      )
    default:
      return null
  }
}
