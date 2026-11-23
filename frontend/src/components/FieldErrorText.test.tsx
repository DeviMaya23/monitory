import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldErrorText } from './FieldErrorText'

describe('FieldErrorText (NFR-7)', () => {
  it('renders p.error-text with the id, a hidden icon and the message', () => {
    const { container } = render(<FieldErrorText id="x-error" message="Too long." />)
    const p = container.querySelector('p.error-text')
    expect(p).toHaveAttribute('id', 'x-error')
    expect(p).toHaveTextContent('Too long.')
    expect(p?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows markup in the message literally', () => {
    const { container } = render(<FieldErrorText id="x-error" message="<b>x</b>" />)
    expect(container.querySelector('.error-text b')).toBeNull()
    expect(container.querySelector('.error-text')).toHaveTextContent('<b>x</b>')
  })
})
