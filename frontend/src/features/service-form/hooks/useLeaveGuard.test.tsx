import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TIMING_DEFAULTS, TIMING_NAMES, type TimingTexts } from '../lib/timingGroup'
import { useLeaveGuard } from './useLeaveGuard'

type Props = { saving?: boolean; saved?: boolean; onLeave?: () => void }

/** The hook over three real inputs, since "changed" reads what the inputs hold and the unload prompt is a window listener. */
function Harness({ saving = false, saved = false, onLeave = vi.fn() }: Props) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState('GET')
  const [queryRows, setQueryRows] = useState(0)
  const [headerRows, setHeaderRows] = useState(0)
  const [bodyType, setBodyType] = useState('none')
  const [bodyContent, setBodyContent] = useState('')
  const [ruleCount, setRuleCount] = useState(0)
  const [ruleMode, setRuleMode] = useState('any')
  const [certEnabled, setCertEnabled] = useState(false)
  const [certDays, setCertDays] = useState('14')
  const [ignoreCertErrors, setIgnoreCertErrors] = useState(false)
  const [alertsEnabled, setAlertsEnabled] = useState(true)
  const [unhealthyMessage, setUnhealthyMessage] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [timing, setTiming] = useState<TimingTexts>(TIMING_DEFAULTS)
  const guard = useLeaveGuard({
    name,
    method,
    url,
    queryRowCount: queryRows,
    headerRowCount: headerRows,
    bodyType,
    bodyContent,
    ruleCount,
    ruleMode,
    certEnabled,
    certDays,
    ignoreCertErrors,
    alertsEnabled,
    unhealthyMessage,
    recoveryMessage,
    timing,
    saving,
    saved,
    onLeave,
  })
  return (
    <>
      <input aria-label="name" value={name} onChange={(event) => setName(event.target.value)} />
      <input aria-label="url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} />
      <input aria-label="body" value={bodyContent} onChange={(event) => setBodyContent(event.target.value)} />
      <button onClick={() => setQueryRows((n) => n + 1)}>add query</button>
      <button onClick={() => setQueryRows((n) => Math.max(0, n - 1))}>remove query</button>
      <button onClick={() => setHeaderRows((n) => n + 1)}>add header</button>
      <button onClick={() => setHeaderRows((n) => Math.max(0, n - 1))}>remove header</button>
      <button onClick={() => setRuleCount((n) => n + 1)}>add rule</button>
      <button onClick={() => setRuleCount((n) => Math.max(0, n - 1))}>remove rule</button>
      <button onClick={() => setRuleMode('all')}>mode all</button>
      <button onClick={() => setRuleMode('any')}>mode any</button>
      <button onClick={() => setCertEnabled((on) => !on)}>toggle expiry</button>
      <button onClick={() => setIgnoreCertErrors((on) => !on)}>toggle ignore</button>
      <input aria-label="days" value={certDays} onChange={(event) => setCertDays(event.target.value)} />
      <button onClick={() => setBodyType('json')}>type json</button>
      <button onClick={() => setBodyType('none')}>type none</button>
      <input
        aria-label="unhealthy"
        value={unhealthyMessage}
        onChange={(event) => setUnhealthyMessage(event.target.value)}
      />
      <input
        aria-label="recovery"
        value={recoveryMessage}
        onChange={(event) => setRecoveryMessage(event.target.value)}
      />
      {TIMING_NAMES.map((key) => (
        <input
          key={key}
          aria-label={key}
          value={timing[key]}
          onChange={(event) => setTiming({ ...timing, [key]: event.target.value })}
        />
      ))}
      <button onClick={() => setAlertsEnabled(false)}>alerts off</button>
      <button onClick={() => setAlertsEnabled(true)}>alerts on</button>
      <button onClick={() => setMethod('HEAD')}>method HEAD</button>
      <button onClick={() => setMethod('GET')}>method GET</button>
      <button onClick={guard.cancel}>cancel</button>
      <a href="/" {...guard.backLinkProps}>
        back
      </a>
      <button onClick={guard.keepEditing}>keep</button>
      <button onClick={guard.discard}>discard</button>
      <p data-testid="changed">{String(guard.changed)}</p>
      <p data-testid="dialog">{String(guard.dialogOpen)}</p>
    </>
  )
}

const changed = () => screen.getByTestId('changed').textContent
const dialog = () => screen.getByTestId('dialog').textContent
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const click = (name: string) => fireEvent.click(screen.getByText(name))

/** Dispatches `beforeunload` as the browser does; true when the prompt would show. */
function unloadPrompts(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

/** Clicks the back link; true when the link was left to navigate by itself. */
function backLinkNavigates(): boolean {
  return fireEvent.click(screen.getByText('back'))
}

describe('changed', () => {
  it('is false with an empty name and URL and the method GET', () => {
    render(<Harness />)
    expect(changed()).toBe('false')
  })

  it.each([
    ['check_interval', '61'],
    ['timeout', '11'],
    ['retries', '3'],
    ['retry_interval', '11'],
    ['timeout', '10 '],
  ])('is true when %s holds %j (even a trailing space), and false again when put back', (label, value) => {
    render(<Harness />)
    const start = (screen.getByLabelText(label) as HTMLInputElement).value
    type(label, value)
    expect(changed()).toBe('true')
    type(label, start)
    expect(changed()).toBe('false')
  })

  it.each([
    ['one rule, even an empty one', 'add rule', 'remove rule'],
    ['the mode All rules match', 'mode all', 'mode any'],
    ['the expiry switch on', 'toggle expiry', 'toggle expiry'],
    ['the ignore switch on', 'toggle ignore', 'toggle ignore'],
  ])('is true with %s, and false again when put back', (_label, on, off) => {
    render(<Harness />)
    click(on)
    expect(changed()).toBe('true')
    click(off)
    expect(changed()).toBe('false')
  })

  it.each(['14 ', '7'])('is true when the days text is %j, and false again when put back to 14', (days) => {
    render(<Harness />)
    type('days', days)
    expect(changed()).toBe('true')
    type('days', '14')
    expect(changed()).toBe('false')
  })

  it('is true by a name, and false again when it is emptied', () => {
    render(<Harness />)
    type('name', 'a')
    expect(changed()).toBe('true')
    type('name', '')
    expect(changed()).toBe('false')
  })

  it('is true by a name of only spaces (compared as typed)', () => {
    render(<Harness />)
    type('name', '  ')
    expect(changed()).toBe('true')
  })

  it('is true by a URL, compared as the input holds it', () => {
    render(<Harness />)
    type('url', 'https://x')
    expect(changed()).toBe('true')
    // A url input strips the spaces around its value: only spaces is held as empty.
    type('url', '   ')
    expect(screen.getByLabelText('url')).toHaveValue('')
    expect(changed()).toBe('false')
  })

  it('is true by another method, and false again with GET', () => {
    render(<Harness />)
    click('method HEAD')
    expect(changed()).toBe('true')
    click('method GET')
    expect(changed()).toBe('false')
  })
})

describe('changed by the request rows and body (FR-35, FR-37)', () => {
  it('is true with one query parameter row, even an empty one, and false again when it is removed', () => {
    render(<Harness />)
    click('add query')
    expect(changed()).toBe('true')
    click('remove query')
    expect(changed()).toBe('false')
  })

  it('is true with one header row, and false again when it is removed', () => {
    render(<Harness />)
    click('add header')
    expect(changed()).toBe('true')
    click('remove header')
    expect(changed()).toBe('false')
  })

  it('is true with a body type other than None, and false again with None', () => {
    render(<Harness />)
    click('type json')
    expect(changed()).toBe('true')
    click('type none')
    expect(changed()).toBe('false')
  })

  it('is true with body text while the type is None, and false again when it is cleared', () => {
    render(<Harness />)
    type('body', 'x')
    expect(changed()).toBe('true')
    type('body', '')
    expect(changed()).toBe('false')
  })
})

describe('changed by the alert settings (FR-20, FR-65)', () => {
  it('is true with alerts off, and false again with alerts on', () => {
    render(<Harness />)
    click('alerts off')
    expect(changed()).toBe('true')
    click('alerts on')
    expect(changed()).toBe('false')
  })

  it.each(['unhealthy', 'recovery'])('is true by a %s message of one space or of text, false once emptied', (label) => {
    render(<Harness />)
    type(label, ' ')
    expect(changed()).toBe('true')
    type(label, 'down')
    expect(changed()).toBe('true')
    type(label, '')
    expect(changed()).toBe('false')
  })
})

describe('Cancel and the back link', () => {
  it('on a pristine form go on at once and open no dialog', () => {
    const onLeave = vi.fn()
    render(<Harness onLeave={onLeave} />)
    click('cancel')
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(dialog()).toBe('false')
    expect(backLinkNavigates()).toBe(true)
    expect(dialog()).toBe('false')
  })

  it('on a changed form open the dialog and do not go on', () => {
    const onLeave = vi.fn()
    render(<Harness onLeave={onLeave} />)
    type('name', 'a')
    click('cancel')
    expect(dialog()).toBe('true')
    click('keep')
    expect(dialog()).toBe('false')
    expect(backLinkNavigates()).toBe(false)
    expect(dialog()).toBe('true')
    expect(onLeave).not.toHaveBeenCalled()
  })

  it('Keep editing closes the dialog and stays', () => {
    const onLeave = vi.fn()
    render(<Harness onLeave={onLeave} />)
    type('name', 'a')
    click('cancel')
    click('keep')
    expect(dialog()).toBe('false')
    expect(onLeave).not.toHaveBeenCalled()
    expect(screen.getByLabelText('name')).toHaveValue('a')
  })

  it('Discard changes closes the dialog and goes on', () => {
    const onLeave = vi.fn()
    render(<Harness onLeave={onLeave} />)
    type('name', 'a')
    click('cancel')
    click('discard')
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(dialog()).toBe('false')
  })

  it('while saving the back link navigates at once with no dialog, even when changed', () => {
    const { rerender } = render(<Harness />)
    type('name', 'a')
    rerender(<Harness saving />)
    expect(backLinkNavigates()).toBe(true)
    expect(dialog()).toBe('false')
  })
})

describe('the unload prompt', () => {
  it('is not armed on a pristine form', () => {
    render(<Harness />)
    expect(unloadPrompts()).toBe(false)
  })

  it('is armed while the form is changed, and not once it is pristine again', () => {
    render(<Harness />)
    type('name', 'a')
    expect(unloadPrompts()).toBe(true)
    type('name', '')
    expect(unloadPrompts()).toBe(false)
  })

  it('is not armed while saving, and is again after a failure', () => {
    const { rerender } = render(<Harness />)
    type('name', 'a')
    rerender(<Harness saving />)
    expect(unloadPrompts()).toBe(false)
    rerender(<Harness />)
    expect(unloadPrompts()).toBe(true)
  })

  it('is not armed after a success', () => {
    const { rerender } = render(<Harness />)
    type('name', 'a')
    rerender(<Harness saved />)
    expect(unloadPrompts()).toBe(false)
  })

  it('is removed on unmount', () => {
    const { unmount } = render(<Harness />)
    type('name', 'a')
    expect(unloadPrompts()).toBe(true)
    unmount()
    expect(unloadPrompts()).toBe(false)
  })
})
