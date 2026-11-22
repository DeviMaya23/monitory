import type { Ref } from 'react'
import { FlaskConical, LoaderCircle } from 'lucide-react'
import type { TestState } from '../hooks/useTestCheck'
import { TEST_TEXT } from '../lib/testResult'
import { TestResult } from './TestResult'

const TITLE_ID = 'test-panel-title'

type Props = {
  state: TestState
  /** The test button is off: a save is in flight. */
  saving: boolean
  onRun: () => void
  buttonRef?: Ref<HTMLButtonElement>
}

/** The panel beside (or after) the form: the button and the area of the last test's result (FR-104). */
export function TestPanel({ state, saving, onRun, buttonRef }: Props) {
  const running = state.kind === 'running'
  return (
    <aside className="test-panel" aria-labelledby={TITLE_ID}>
      <div className="test-panel__head">
        <h2 className="test-panel__title" id={TITLE_ID}>
          {TEST_TEXT.title}
        </h2>
      </div>
      <p className="hint">{TEST_TEXT.hint}</p>
      <button
        type="button"
        className="btn"
        ref={buttonRef}
        disabled={running || saving}
        aria-busy={running ? 'true' : undefined}
        onClick={onRun}
      >
        {running ? (
          <LoaderCircle className="icon icon--sm spinner" aria-hidden="true" />
        ) : (
          <FlaskConical className="icon icon--sm" aria-hidden="true" />
        )}
        <span>{running ? TEST_TEXT.running : TEST_TEXT.run}</span>
      </button>
      <div aria-live="polite">
        <TestResult state={state} />
      </div>
    </aside>
  )
}
