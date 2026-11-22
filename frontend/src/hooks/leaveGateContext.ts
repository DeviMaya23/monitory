import { createContext } from 'react'

/**
 * Asks before the page is left by something that is not a navigation. Returns true when it took
 * over (it opened its question and keeps `proceed` for the answer) and false when there is
 * nothing to ask.
 */
export type LeaveAsk = (proceed: () => void) => boolean

export interface LeaveGateValue {
  /** Runs `proceed` at once, or hands it to the registered `ask` when that has something to ask. */
  confirmLeave: (proceed: () => void) => void
  /** Sets or removes the one registered `ask`. */
  register: (ask: LeaveAsk | null) => void
}

/** The default does nothing, so a form outside a provider is simply not guarded. */
export const LeaveGateContext = createContext<LeaveGateValue>({
  confirmLeave: (proceed) => proceed(),
  register: () => {},
})
