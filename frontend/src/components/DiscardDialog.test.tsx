import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DiscardDialog } from './DiscardDialog'

function setup(open = true, body = 'The changes to this service will be lost.') {
  const onKeep = vi.fn()
  const onDiscard = vi.fn()
  render(<DiscardDialog open={open} body={body} onKeep={onKeep} onDiscard={onDiscard} />)
  return { onKeep, onDiscard }
}

describe('DiscardDialog', () => {
  it('renders nothing while closed', () => {
    setup(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks the question, shows the given sentence and focuses Keep editing', async () => {
    setup()
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    expect(screen.getByText('The changes to this service will be lost.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus())
  })

  it('shows the target sentence as given', async () => {
    setup(true, 'The changes to this target will be lost.')
    expect(await screen.findByText('The changes to this target will be lost.')).toBeInTheDocument()
  })

  it('calls onKeep for Keep editing, Esc and the backdrop, and not onDiscard', async () => {
    const { onKeep, onDiscard } = setup()
    const user = userEvent.setup()
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(onKeep).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onKeep).toHaveBeenCalledTimes(2)
    const backdrop = document.querySelector('.dialog-backdrop') as Element
    fireEvent.pointerDown(backdrop)
    fireEvent.mouseDown(backdrop)
    fireEvent.pointerUp(backdrop)
    fireEvent.mouseUp(backdrop)
    fireEvent.click(backdrop)
    expect(onKeep).toHaveBeenCalledTimes(3)
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('calls onDiscard for Discard changes', async () => {
    const { onKeep, onDiscard } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onKeep).not.toHaveBeenCalled()
  })
})
