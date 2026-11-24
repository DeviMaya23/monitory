import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SignInFailure } from './useSignIn'

type Locked = Extract<SignInFailure, { kind: 'locked' }>

const TICK_MS = 500

/**
 * The whole seconds left of a sign-in lock, or null when there is none. `onEnd` runs once when it reaches 0.
 * The value is always read from the clock against a fixed end time, never counted per tick. A new `locked`
 * object restarts it, even with the same seconds.
 */
export function useLockCountdown(locked: Locked | null, onEnd: () => void): number | null {
  const onEndRef = useRef(onEnd)
  useEffect(() => {
    onEndRef.current = onEnd
  })

  // The last value a tick showed, with the lock it belongs to. A lock without a tick yet shows its full wait.
  const [shown, setShown] = useState<{ lock: Locked; seconds: number } | null>(null)

  // A layout effect, so the end time is taken before the first paint of the lock and the clock is never read in render.
  useLayoutEffect(() => {
    if (locked === null) return
    const end = Date.now() + locked.seconds * 1000
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      if (left === 0) {
        clearInterval(timer)
        setShown({ lock: locked, seconds: 0 })
        onEndRef.current()
      } else {
        setShown((previous) =>
          previous?.lock === locked && previous.seconds === left ? previous : { lock: locked, seconds: left },
        )
      }
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [locked])

  if (locked === null) return null
  const seconds = shown?.lock === locked ? shown.seconds : locked.seconds
  return seconds === 0 ? null : seconds
}
