import { useEffect, useRef, useState } from 'react'
import type { SignInFailure } from './useSignIn'

type Locked = Extract<SignInFailure, { kind: 'locked' }>

const TICK_MS = 500

const remainingFrom = (end: number) => Math.max(0, Math.ceil((end - Date.now()) / 1000))

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

  // The end time is fixed in the render that first sees a locked object, so the first value is the full wait.
  const seen = useRef<Locked | null>(null)
  const endRef = useRef<number | null>(null)
  if (seen.current !== locked) {
    seen.current = locked
    endRef.current = locked ? Date.now() + locked.seconds * 1000 : null
  }
  const end = endRef.current

  const [remaining, setRemaining] = useState<number | null>(locked ? locked.seconds : null)
  const [shownFor, setShownFor] = useState(locked)
  if (shownFor !== locked) {
    setShownFor(locked)
    setRemaining(locked ? locked.seconds : null)
  }

  useEffect(() => {
    if (locked === null || end === null) return
    const timer = setInterval(() => {
      const left = remainingFrom(end)
      if (left === 0) {
        clearInterval(timer)
        setRemaining(null)
        onEndRef.current()
      } else {
        setRemaining(left)
      }
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [locked, end])

  return locked ? remaining : null
}
