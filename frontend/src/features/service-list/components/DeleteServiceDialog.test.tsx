import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeService } from '../../../test/fixtures'
import { DeleteServiceDialog } from './DeleteServiceDialog'

function show(props: Partial<React.ComponentProps<typeof DeleteServiceDialog>> = {}) {
  return render(
    <DeleteServiceDialog
      service={makeService({ name: 'API gateway', target_count: 3 })}
      deleting={false}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
      {...props}
    />,
  )
}

describe('DeleteServiceDialog', () => {
  it('names the service and counts its targets in bold (FR-72)', async () => {
    show()
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “API gateway”?' })
    expect(dialog).toHaveAccessibleDescription(
      'Its alert list goes with it: 3 notification targets. Checks stop and its current state is removed. This can’t be undone.',
    )
    expect(screen.getByText('3 notification targets').tagName).toBe('STRONG')
  })

  it.each([
    [1, '1 notification target', 'Its alert list goes with it: 1 notification target.'],
    [0, null, 'It has no notification targets.'],
  ])('with %i targets', async (count, bold, text) => {
    show({ service: makeService({ target_count: count }) })
    await screen.findByRole('alertdialog')
    expect(document.querySelector('.dialog__body p')?.textContent).toBe(text)
    if (bold) expect(screen.getByText(bold).tagName).toBe('STRONG')
    else expect(document.querySelector('.dialog__body strong')).toBeNull()
    expect(screen.getByText('Checks stop and its current state is removed. This can’t be undone.')).toBeInTheDocument()
  })

  it('shows a name with markup as text (NFR-7)', async () => {
    show({ service: makeService({ name: '<b>x</b>' }) })
    const title = await screen.findByRole('heading', { name: 'Delete “<b>x</b>”?' })
    expect(title.querySelector('b')).toBeNull()
  })

  it('starts on Cancel and has a Delete service button with the Trash2 icon', async () => {
    show()
    await screen.findByRole('alertdialog')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())
    const confirm = screen.getByRole('button', { name: 'Delete service' })
    expect(confirm.querySelector('svg.lucide-trash-2')).not.toBeNull()
    expect(confirm).not.toHaveAttribute('aria-busy')
  })

  it('while deleting disables both buttons and shows Deleting… as busy', async () => {
    show({ deleting: true })
    await screen.findByRole('alertdialog')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    const busy = screen.getByRole('button', { name: 'Deleting…' })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy.querySelector('.spinner')).not.toBeNull()
  })

  it('is closed without a service', () => {
    show({ service: null })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
