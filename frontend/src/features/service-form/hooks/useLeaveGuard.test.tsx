import { useState } from 'react'
import { act, fireEvent, screen } from '@testing-library/react'
import { Outlet, useNavigate, type Location } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { LeaveGateProvider } from '../../../components/LeaveGateProvider'
import { useLeaveGate } from '../../../hooks/useLeaveGate'
import { renderRoutes } from '../../../test/renderRoutes'
import { LEAVE_WITHOUT_ASKING, useLeaveGuard } from './useLeaveGuard'

/** The hook over a name input: the form counts as changed while the name is not empty. */
function Harness({ proceed }: { proceed: () => void }) {
  const navigate = useNavigate()
  const { confirmLeave } = useLeaveGate()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const guard = useLeaveGuard({ changed: name !== '', saving })
  return (
    <>
      <input aria-label="name" value={name} onChange={(event) => setName(event.target.value)} />
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
  it('returns the value it was given', () => {
    renderGuard()
    expect(changed()).toBe('false')
    type('name', 'a')
    expect(changed()).toBe('true')
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

  it.each([
    ['false', { leaveWithoutAsking: false }],
    ['the string "true"', { leaveWithoutAsking: 'true' }],
    ['a bare string', 'leaveWithoutAsking'],
    ['an unrelated object', { other: true }],
  ])('asks for a push whose state is not exactly leaveWithoutAsking: true (%s)', async (_name, state) => {
    const { router } = renderGuard()
    type('name', 'a')
    await go(() => router.navigate('/other', { state }))
    expect(here(router)).toBe('/')
    expect(dialog()).toBe('true')
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
