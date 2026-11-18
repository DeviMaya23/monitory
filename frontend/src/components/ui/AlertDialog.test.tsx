import { useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AlertDialog } from './AlertDialog'
import { Dialog } from './Dialog'

function Harness({
  busy = false,
  onClose = vi.fn(),
  finalFocus,
}: {
  busy?: boolean
  onClose?: () => void
  finalFocus?: () => HTMLElement | null
}) {
  const [open, setOpen] = useState(false)
  const second = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <button>Elsewhere</button>
      <AlertDialog
        open={open}
        title="Delete it?"
        busy={busy}
        initialFocus={second}
        finalFocus={finalFocus}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        footer={<button>Footer action</button>}
      >
        <button>first</button>
        <button ref={second}>second</button>
        <p>This can’t be undone.</p>
      </AlertDialog>
    </>
  )
}

async function open() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Open' }))
  await screen.findByRole('alertdialog', { name: 'Delete it?' })
  return user
}

function clickBackdrop() {
  const backdrop = document.querySelector('.dialog-backdrop')
  if (!backdrop) throw new Error('no backdrop')
  fireEvent.pointerDown(backdrop)
  fireEvent.mouseDown(backdrop)
  fireEvent.pointerUp(backdrop)
  fireEvent.mouseUp(backdrop)
  fireEvent.click(backdrop)
}

describe('AlertDialog', () => {
  it('is an alertdialog named by its title and described by its body, and focuses the marked element', async () => {
    render(<Harness />)
    await open()
    const dialog = screen.getByRole('alertdialog', { name: 'Delete it?' })
    expect(dialog).toHaveAccessibleDescription(/This can’t be undone\./)
    await waitFor(() => expect(screen.getByRole('button', { name: 'second' })).toHaveFocus())
  })

  it('closes on Esc once, gives focus back to the opener and renders the footer', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const user = await open()
    expect(screen.getByRole('button', { name: 'Footer action' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus())
  })

  it('does not close on a backdrop click', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await open()
    clickBackdrop()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('ignores Esc while busy', async () => {
    const onClose = vi.fn()
    render(<Harness busy onClose={onClose} />)
    const user = await open()
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('goes back to the opener when finalFocus returns null', async () => {
    render(<Harness finalFocus={() => null} />)
    const user = await open()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus())
  })

  it('sends focus to finalFocus on close instead of the opener', async () => {
    render(<Harness finalFocus={() => screen.getByText('Elsewhere', { selector: 'button' })} />)
    const user = await open()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus())
  })

  it('renders inside the app-scoped portal host, outside the page content', async () => {
    const { container } = render(<Harness />)
    await open()

    const host = screen.getByRole('alertdialog').closest('.app.portal-host')
    expect(host).not.toBeNull()
    expect(host?.parentElement).toBe(document.body)
    expect(container.contains(host)).toBe(false)
  })

  it('shares the one host with a Dialog open beside it', async () => {
    render(
      <>
        <Dialog open title="First" onClose={vi.fn()}>
          <p>body</p>
        </Dialog>
        <AlertDialog open title="Second" onClose={vi.fn()}>
          <p>body</p>
        </AlertDialog>
      </>,
    )
    const dialog = await screen.findByRole('dialog', { name: 'First', hidden: true })
    const alert = await screen.findByRole('alertdialog', { name: 'Second', hidden: true })
    const host = dialog.closest('.app.portal-host')
    expect(host).not.toBeNull()
    expect(alert.closest('.app.portal-host')).toBe(host)
    expect(document.querySelectorAll('[data-portal-host]')).toHaveLength(1)
  })
})
