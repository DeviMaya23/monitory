import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useLeaveGuard } from './useLeaveGuard'

type Props = { saving?: boolean; saved?: boolean; onLeave?: () => void }

/** The hook over three real inputs, since "changed" reads what the inputs hold and the unload prompt is a window listener. */
function Harness({ saving = false, saved = false, onLeave = vi.fn() }: Props) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState('GET')
  const guard = useLeaveGuard({ name, method, url, saving, saved, onLeave })
  return (
    <>
      <input aria-label="name" value={name} onChange={(event) => setName(event.target.value)} />
      <input aria-label="url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} />
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
