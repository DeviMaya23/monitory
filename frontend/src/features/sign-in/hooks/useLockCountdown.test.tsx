import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLockCountdown } from './useLockCountdown'
import type { SignInFailure } from './useSignIn'

type Locked = Extract<SignInFailure, { kind: 'locked' }>

const locked = (seconds: number): Locked => ({ kind: 'locked', seconds })
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(initial: Locked | null, onEnd = vi.fn()) {
  const view = renderHook((props: { failure: Locked | null; onEnd: () => void }) => useLockCountdown(props.failure, props.onEnd), {
    initialProps: { failure: initial, onEnd },
  })
  return { ...view, onEnd }
}

describe('useLockCountdown', () => {
  it('returns the full wait at once, and null with no timer when there is no lock', () => {
    const active = setup(locked(292))
    expect(active.result.current).toBe(292)
    active.unmount()
    const idle = setup(null)
    expect(idle.result.current).toBeNull()
    idle.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('counts down from the clock without running the callback early', async () => {
    const { result, onEnd } = setup(locked(292))
    await advance(1000)
    expect(result.current).toBe(291)
    await advance(290_000)
    expect(result.current).toBe(1)
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('ends at exactly the wait, and not one millisecond before', async () => {
    const { result, onEnd } = setup(locked(292))
    await advance(292_000 - 1)
    expect(onEnd).not.toHaveBeenCalled()
    expect(result.current).toBe(1)
    await advance(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(result.current).toBeNull()
  })

  it('reads the clock, not the ticks: a jump forward is shown on the next tick', async () => {
    const { result } = setup(locked(292))
    vi.setSystemTime(Date.now() + 200_000)
    await advance(500)
    expect(result.current).toBe(92)
  })

  it('runs the callback once however long the timers keep advancing', async () => {
    const { onEnd } = setup(locked(3))
    await advance(60_000)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('restarts from its own seconds on a new failure object, even with the same seconds', async () => {
    const { result, rerender, onEnd } = setup(locked(10))
    await advance(6000)
    expect(result.current).toBe(4)
    rerender({ failure: locked(10), onEnd })
    expect(result.current).toBe(10)
    rerender({ failure: locked(60), onEnd })
    expect(result.current).toBe(60)
  })

  it('keeps one timer at a time: 1 while counting, 1 after a restart, 0 once ended', async () => {
    const { rerender, onEnd } = setup(locked(10))
    expect(vi.getTimerCount()).toBe(1)
    rerender({ failure: locked(10), onEnd })
    expect(vi.getTimerCount()).toBe(1)
    await advance(10_000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not restart for a callback with a new identity', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const failure = locked(10)
    const { result, rerender } = setup(failure, first)
    await advance(4000)
    rerender({ failure, onEnd: second })
    await advance(500)
    expect(result.current).toBe(6)
    await advance(10_000)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('clears the timer on unmount and never runs the callback', async () => {
    const { unmount, onEnd } = setup(locked(10))
    await advance(2000)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    await advance(20_000)
    expect(onEnd).not.toHaveBeenCalled()
  })
})
