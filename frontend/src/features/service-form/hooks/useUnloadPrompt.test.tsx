import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useUnloadPrompt } from './useUnloadPrompt'

function Harness({ armed }: { armed: boolean }) {
  useUnloadPrompt(armed)
  return null
}

/** Dispatches `beforeunload` as the browser does; true when the prompt would show. */
function unloadPrompts(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('useUnloadPrompt', () => {
  it('is armed only while its argument is true', () => {
    const { rerender } = render(<Harness armed={false} />)
    expect(unloadPrompts()).toBe(false)
    rerender(<Harness armed />)
    expect(unloadPrompts()).toBe(true)
    rerender(<Harness armed={false} />)
    expect(unloadPrompts()).toBe(false)
  })

  it('is removed on unmount', () => {
    const { unmount } = render(<Harness armed />)
    expect(unloadPrompts()).toBe(true)
    unmount()
    expect(unloadPrompts()).toBe(false)
  })
})
