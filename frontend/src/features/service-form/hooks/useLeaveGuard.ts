import { useRef, useState } from 'react'
import { useBlocker } from 'react-router'
import { useRegisterLeaveAsk } from '../../../hooks/useLeaveGate'
import { useUnloadPrompt } from './useUnloadPrompt'

/**
 * The router state of a link that leaves the form on purpose (the banner's "Back to services").
 * It is let through only for a new navigation: Back and Forward to an entry made by such a link still ask.
 */
export const LEAVE_WITHOUT_ASKING = { leaveWithoutAsking: true } as const

function leavesWithoutAsking(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'leaveWithoutAsking' in state && state.leaveWithoutAsking === true
}

type Options = {
  /** The form differs from where it started (`isFormChanged`). */
  changed: boolean
  /** A save is in flight. */
  saving: boolean
}

/**
 * Asks before a changed form is left: whether the form is changed, and the "Discard unsaved
 * changes?" dialog for every navigation (a blocker) and for Sign out (a registration with the
 * shell). The browser's own prompt on closing the tab is `useUnloadPrompt`.
 */
export function useLeaveGuard({ changed, saving }: Options) {
  const [saved, setSaved] = useState(false)
  // Read at navigation time: the state is a render behind a save that navigates in the same tick.
  const savedRef = useRef(false)
  const [signOutAsked, setSignOutAsked] = useState(false)
  const signOutProceed = useRef<(() => void) | null>(null)
  // While saving the form is left at once: the request is not cancelled.
  const asks = () => changed && !saving && !savedRef.current

  const blocker = useBlocker(({ currentLocation, nextLocation, historyAction }) => {
    if (!asks()) return false
    if (currentLocation.pathname === nextLocation.pathname) return false
    if (historyAction !== 'POP' && leavesWithoutAsking(nextLocation.state)) return false
    return true
  })
  const blocked = blocker.state === 'blocked'

  // Sign out is not a navigation: the shell asks through this registration.
  useRegisterLeaveAsk((proceed) => {
    if (!asks()) return false
    // The navigation question is open already; it stays the one question.
    if (blocked) return true
    signOutProceed.current = proceed
    setSignOutAsked(true)
    return true
  })
  useUnloadPrompt(changed && !saving && !saved)

  const closeSignOut = () => {
    signOutProceed.current = null
    setSignOutAsked(false)
  }

  return {
    changed,
    dialogOpen: blocked || signOutAsked,
    /** The save succeeded: the navigation that follows is not asked about. */
    markSaved: () => {
      savedRef.current = true
      setSaved(true)
    },
    /** "Keep editing", Esc and the backdrop: stay, and ask again next time. */
    keepEditing: () => {
      closeSignOut()
      if (blocked) blocker.reset()
    },
    /** "Discard changes": goes on with the latest exit that was tried. */
    discard: () => {
      const proceed = signOutProceed.current
      closeSignOut()
      // A navigation made while the sign-out question was open replaces it.
      if (blocked) blocker.proceed()
      else proceed?.()
    },
  }
}
