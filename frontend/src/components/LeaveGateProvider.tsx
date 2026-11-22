import { useMemo, useRef, type ReactNode } from 'react'
import { LeaveGateContext, type LeaveAsk, type LeaveGateValue } from '../hooks/leaveGateContext'

/** Holds at most one registered "ask before leaving" function, for exits that are not navigations. */
export function LeaveGateProvider({ children }: { children: ReactNode }) {
  const asked = useRef<LeaveAsk | null>(null)
  const value = useMemo<LeaveGateValue>(
    () => ({
      confirmLeave: (proceed) => {
        if (!asked.current?.(proceed)) proceed()
      },
      register: (ask) => {
        asked.current = ask
      },
    }),
    [],
  )
  return <LeaveGateContext value={value}>{children}</LeaveGateContext>
}
