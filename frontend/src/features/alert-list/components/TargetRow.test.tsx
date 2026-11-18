import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeEmailTarget, makeWebhookTarget } from '../../../test/fixtures'
import type { Target } from '../../../lib/api/targets'
import { TargetRow } from './TargetRow'

const TEXT = 'Last delivery failed. Shown until a later delivery succeeds.'

function renderRow(target: Target, state: { asking?: boolean; removing?: boolean } = {}) {
  return render(
    <ul>
      <TargetRow
        target={target}
        asking={state.asking ?? false}
        removing={state.removing ?? false}
        removeRef={vi.fn()}
        editRef={vi.fn()}
        onEdit={vi.fn()}
        onAsk={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    </ul>,
  )
}

const kinds: [string, (o: Partial<Target>) => Target][] = [
  ['email', (o) => makeEmailTarget(o as never)],
  ['webhook', (o) => makeWebhookTarget(o as never)],
]

describe.each(kinds)('%s target', (_kind, make) => {
  it('shows one warning notice with the fixed text after the address when the last delivery failed (FR-86)', () => {
    const { container } = renderRow(make({ last_delivery_failed: true }))
    const notices = container.querySelectorAll('.notice')
    expect(notices).toHaveLength(1)
    const notice = container.querySelector('.target__main .notice--warn') as HTMLElement
    expect(notice).toBe(notices[0])
    expect(notice.textContent).toBe(TEXT)
    expect(notice.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    const addr = container.querySelector('.target__addr') as HTMLElement
    expect(addr.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows nothing when it did not (FR-86)', () => {
    const { container } = renderRow(make({ last_delivery_failed: false }))
    expect(container.querySelector('.notice')).toBeNull()
    expect(container.textContent).not.toMatch(/delivery/)
  })

  it('keeps the name fallback, chip, address and button names when flagged and unnamed', () => {
    const target = make({ name: undefined, last_delivery_failed: true })
    const label = target.type === 'email' ? target.address : target.url
    const { container, getByRole } = renderRow(target)
    expect(container.querySelector('.target__name')?.textContent).toBe(
      target.type === 'email' ? 'Unnamed email' : 'Unnamed webhook',
    )
    expect(container.querySelector('.chip')?.textContent).toBe(target.type === 'email' ? 'EMAIL' : 'WEBHOOK')
    expect(container.querySelector('.target__addr')?.textContent).toBe(label)
    expect(getByRole('button', { name: `Edit ${label}` })).toBeInTheDocument()
    expect(getByRole('button', { name: `Remove ${label}` })).toBeInTheDocument()
  })

  it.each([
    ['asking', { asking: true }],
    ['asking and removing', { asking: true, removing: true }],
  ])('follows the flag while %s', (_name, state) => {
    const flagged = renderRow(make({ last_delivery_failed: true }), state)
    expect(flagged.container.querySelectorAll('.notice')).toHaveLength(1)
    expect(flagged.container.querySelector('.notice')?.textContent).toBe(TEXT)
    flagged.unmount()
    const plain = renderRow(make({ last_delivery_failed: false }), state)
    expect(plain.container.querySelector('.notice')).toBeNull()
  })

  it('is not a live region and has no role', () => {
    const { container } = renderRow(make({ last_delivery_failed: true }))
    expect(container.querySelector('[role], [aria-live]')).toBeNull()
  })

  it('renders a flagged name as text with the same fixed notice (NFR-7)', () => {
    const { container } = renderRow(make({ name: '<b>x</b>', last_delivery_failed: true }))
    expect(container.querySelector('.notice')?.textContent).toBe(TEXT)
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('.target__name')?.textContent).toBe('<b>x</b>')
  })
})
