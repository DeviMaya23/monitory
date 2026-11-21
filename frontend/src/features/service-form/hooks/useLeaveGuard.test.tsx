import { useState } from 'react'
import { act, fireEvent, screen } from '@testing-library/react'
import { Outlet, useNavigate, type Location } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { LeaveGateProvider } from '../../../components/LeaveGateProvider'
import { useLeaveGate } from '../../../hooks/useLeaveGate'
import { renderRoutes } from '../../../test/renderRoutes'
import { TIMING_DEFAULTS, TIMING_NAMES, type TimingTexts } from '../lib/timingGroup'
import { LEAVE_WITHOUT_ASKING, useLeaveGuard } from './useLeaveGuard'

/** The hook over real inputs, since "changed" reads what the inputs hold and the unload prompt is a window listener. */
function Harness({ proceed }: { proceed: () => void }) {
  const navigate = useNavigate()
  const { confirmLeave } = useLeaveGate()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('http')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
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
    type,
    host,
    port,
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
  })
  return (
    <>
      <input aria-label="name" value={name} onChange={(event) => setName(event.target.value)} />
      <input aria-label="host" value={host} onChange={(event) => setHost(event.target.value)} />
      <input aria-label="port" value={port} onChange={(event) => setPort(event.target.value)} />
      <button onClick={() => setType('tcp')}>type tcp</button>
      <button onClick={() => setType('http')}>type http</button>
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
      <button onClick={() => setSaving(true)}>saving on</button>
      <button onClick={() => setSaving(false)}>saving off</button>
      <button onClick={guard.markSaved}>mark saved</button>
      <button
        onClick={() => {
          guard.markSaved()
          void navigate('/other')
        }}
      >
        save and go
      </button>
      <button onClick={() => confirmLeave(proceed)}>sign out</button>
      <button onClick={guard.keepEditing}>keep</button>
      <button onClick={guard.discard}>discard</button>
      <p data-testid="changed">{String(guard.changed)}</p>
      <p data-testid="dialog">{String(guard.dialogOpen)}</p>
    </>
  )
}

type RenderOptions = { provider?: boolean } & Parameters<typeof renderRoutes>[1]

/** The harness at `/` and a second page at `/other`, in a memory data router; `proceed` stands for Sign out. */
function renderGuard({ provider = true, initialEntries, initialIndex }: RenderOptions = {}) {
  const proceed = vi.fn()
  const root = provider ? (
    <LeaveGateProvider>
      <Outlet />
    </LeaveGateProvider>
  ) : (
    <Outlet />
  )
  const { router } = renderRoutes(
    [
      {
        element: root,
        children: [
          { path: '/', element: <Harness proceed={proceed} /> },
          { path: '/other', element: <p>other page</p> },
          { path: '/third', element: <p>third page</p> },
        ],
      },
    ],
    { initialEntries, initialIndex },
  )
  return { router, proceed }
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

describe('changed', () => {
  it('is false with an empty name and URL and the method GET', () => {
    renderGuard()
    expect(changed()).toBe('false')
  })

  it.each([
    ['check_interval', '61'],
    ['timeout', '11'],
    ['retries', '3'],
    ['retry_interval', '11'],
    ['timeout', '10 '],
  ])('is true when %s holds %j (even a trailing space), and false again when put back', (label, value) => {
    renderGuard()
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
    renderGuard()
    click(on)
    expect(changed()).toBe('true')
    click(off)
    expect(changed()).toBe('false')
  })

  it.each(['14 ', '7'])('is true when the days text is %j, and false again when put back to 14', (days) => {
    renderGuard()
    type('days', days)
    expect(changed()).toBe('true')
    type('days', '14')
    expect(changed()).toBe('false')
  })

  it.each([
    ['the type TCP port', () => click('type tcp'), () => click('type http')],
    ['a host', () => type('host', 'db'), () => type('host', '')],
    ['a port', () => type('port', '5432'), () => type('port', '')],
  ])('is true with %s (also while HTTP(S) is chosen for the text), and false again when put back', (_label, on, off) => {
    renderGuard()
    on()
    expect(changed()).toBe('true')
    off()
    expect(changed()).toBe('false')
  })

  it('is true by a name, and false again when it is emptied', () => {
    renderGuard()
    type('name', 'a')
    expect(changed()).toBe('true')
    type('name', '')
    expect(changed()).toBe('false')
  })

  it('is true by a name of only spaces (compared as typed)', () => {
    renderGuard()
    type('name', '  ')
    expect(changed()).toBe('true')
  })

  it('is true by a URL, compared as the input holds it', () => {
    renderGuard()
    type('url', 'https://x')
    expect(changed()).toBe('true')
    // A url input strips the spaces around its value: only spaces is held as empty.
    type('url', '   ')
    expect(screen.getByLabelText('url')).toHaveValue('')
    expect(changed()).toBe('false')
  })

  it('is true by another method, and false again with GET', () => {
    renderGuard()
    click('method HEAD')
    expect(changed()).toBe('true')
    click('method GET')
    expect(changed()).toBe('false')
  })
})

describe('changed by the request rows and body (FR-35, FR-37)', () => {
  it('is true with one query parameter row, even an empty one, and false again when it is removed', () => {
    renderGuard()
    click('add query')
    expect(changed()).toBe('true')
    click('remove query')
    expect(changed()).toBe('false')
  })

  it('is true with one header row, and false again when it is removed', () => {
    renderGuard()
    click('add header')
    expect(changed()).toBe('true')
    click('remove header')
    expect(changed()).toBe('false')
  })

  it('is true with a body type other than None, and false again with None', () => {
    renderGuard()
    click('type json')
    expect(changed()).toBe('true')
    click('type none')
    expect(changed()).toBe('false')
  })

  it('is true with body text while the type is None, and false again when it is cleared', () => {
    renderGuard()
    type('body', 'x')
    expect(changed()).toBe('true')
    type('body', '')
    expect(changed()).toBe('false')
  })
})

describe('changed by the alert settings (FR-20, FR-65)', () => {
  it('is true with alerts off, and false again with alerts on', () => {
    renderGuard()
    click('alerts off')
    expect(changed()).toBe('true')
    click('alerts on')
    expect(changed()).toBe('false')
  })

  it.each(['unhealthy', 'recovery'])('is true by a %s message of one space or of text, false once emptied', (label) => {
    renderGuard()
    type(label, ' ')
    expect(changed()).toBe('true')
    type(label, 'down')
    expect(changed()).toBe('true')
    type(label, '')
    expect(changed()).toBe('false')
  })
})


const here = (router: { state: { location: Location } }) => router.state.location.pathname
const go = (action: () => Promise<void>) => act(action)

describe('asking before a navigation', () => {
  it('lets a pristine form go', async () => {
    const { router } = renderGuard()
    await go(() => router.navigate('/other'))
    expect(here(router)).toBe('/other')
    expect(screen.getByText('other page')).toBeInTheDocument()
  })

  it('stops a changed form, opens the dialog, and Keep editing closes it and asks again next time', async () => {
    const { router } = renderGuard()
    type('name', 'a')
    await go(() => router.navigate('/other'))
    expect(here(router)).toBe('/')
    expect(dialog()).toBe('true')

    click('keep')
    expect(dialog()).toBe('false')
    expect(screen.getByLabelText('name')).toHaveValue('a')

    await go(() => router.navigate('/other'))
    expect(here(router)).toBe('/')
    expect(dialog()).toBe('true')
  })

  it('Discard changes arrives at the target', async () => {
    const { router } = renderGuard()
    type('name', 'a')
    await go(() => router.navigate('/other'))
    click('discard')
    await screen.findByText('other page')
    expect(here(router)).toBe('/other')
  })

  it('lets a push through whose state is leaveWithoutAsking, and asks for the same target without it', async () => {
    const { router } = renderGuard()
    type('name', 'a')
    await go(() => router.navigate('/other'))
    expect(dialog()).toBe('true')
    click('keep')
    await go(() => router.navigate('/other', { state: LEAVE_WITHOUT_ASKING }))
    expect(here(router)).toBe('/other')
  })

  it('asks for a POP to an entry that carries the state', async () => {
    const { router } = renderGuard({
      initialEntries: [{ pathname: '/other', state: LEAVE_WITHOUT_ASKING }, '/'],
      initialIndex: 1,
    })
    type('name', 'a')
    await go(() => router.navigate(-1))
    expect(here(router)).toBe('/')
    expect(dialog()).toBe('true')
  })

  it('does not ask while a request is in flight', async () => {
    const { router } = renderGuard()
    type('name', 'a')
    click('saving on')
    await go(() => router.navigate('/other'))
    expect(here(router)).toBe('/other')
  })

  it('asks again after a request that failed', async () => {
    const { router } = renderGuard()
    type('name', 'a')
    click('saving on')
    click('saving off')
    await go(() => router.navigate('/other'))
    expect(here(router)).toBe('/')
    expect(dialog()).toBe('true')
  })

  it('does not ask after markSaved', async () => {
    const { router } = renderGuard()
    type('name', 'a')
    click('mark saved')
    await go(() => router.navigate('/other'))
    expect(here(router)).toBe('/other')
  })

  it('reads markSaved at once: marking and navigating in one handler arrives with no dialog', async () => {
    const { router } = renderGuard()
    type('name', 'a')
    await act(async () => {
      click('save and go')
    })
    expect(here(router)).toBe('/other')
    expect(screen.getByText('other page')).toBeInTheDocument()
  })

  it.each(['/?a=1', '/#section'])('does not ask for a change of only the search or hash (%s)', async (target) => {
    const { router } = renderGuard()
    type('name', 'a')
    await go(() => router.navigate(target))
    expect(dialog()).toBe('false')
    expect(router.state.location.search + router.state.location.hash).not.toBe('')
  })

  it('replaces the pending navigation with a second one while the dialog is open', async () => {
    const { router } = renderGuard()
    type('name', 'a')
    await go(() => router.navigate('/other'))
    await go(() => router.navigate('/third'))
    expect(dialog()).toBe('true')
    click('discard')
    await screen.findByText('third page')
    expect(here(router)).toBe('/third')
  })
})

describe('asking before Sign out', () => {
  it('opens the dialog for a changed form without calling proceed; Keep editing never calls it', () => {
    const { proceed } = renderGuard()
    type('name', 'a')
    click('sign out')
    expect(dialog()).toBe('true')
    expect(proceed).not.toHaveBeenCalled()
    click('keep')
    expect(dialog()).toBe('false')
    expect(proceed).not.toHaveBeenCalled()
  })

  it('calls proceed once after Discard changes', () => {
    const { proceed } = renderGuard()
    type('name', 'a')
    click('sign out')
    click('discard')
    expect(proceed).toHaveBeenCalledTimes(1)
    expect(dialog()).toBe('false')
  })

  it('calls proceed at once, with no dialog, for a pristine form', () => {
    const { proceed } = renderGuard()
    click('sign out')
    expect(proceed).toHaveBeenCalledTimes(1)
    expect(dialog()).toBe('false')
  })

  it('calls proceed at once, with no dialog, while saving', () => {
    const { proceed } = renderGuard()
    type('name', 'a')
    click('saving on')
    click('sign out')
    expect(proceed).toHaveBeenCalledTimes(1)
    expect(dialog()).toBe('false')
  })

  it('a navigation while the question is open replaces it: Discard navigates and never calls proceed', async () => {
    const { router, proceed } = renderGuard()
    type('name', 'a')
    click('sign out')
    await go(() => router.navigate('/other'))
    expect(dialog()).toBe('true')
    click('discard')
    await screen.findByText('other page')
    expect(proceed).not.toHaveBeenCalled()
  })

  it('a sign-out ask while the navigation question is open does nothing more', async () => {
    const { router, proceed } = renderGuard()
    type('name', 'a')
    await go(() => router.navigate('/other'))
    click('sign out')
    click('keep')
    expect(dialog()).toBe('false')
    expect(proceed).not.toHaveBeenCalled()
  })

  it('outside a provider the sign-out runs proceed at once', () => {
    const { proceed } = renderGuard({ provider: false })
    type('name', 'a')
    click('sign out')
    expect(proceed).toHaveBeenCalledTimes(1)
    expect(dialog()).toBe('false')
  })
})

describe('the unload prompt follows the guard', () => {
  it('is not armed after markSaved', () => {
    renderGuard()
    type('name', 'a')
    expect(unloadPrompts()).toBe(true)
    click('mark saved')
    expect(unloadPrompts()).toBe(false)
  })
})
