import { useContext, useEffect } from 'react'
import { LeaveGateContext, type LeaveAsk } from './leaveGateContext'

/** For the shell: `confirmLeave(proceed)` runs `proceed`, after the registered form has asked if it wants to. */
export function useLeaveGate() {
  const { confirmLeave } = useContext(LeaveGateContext)
  return { confirmLeave }
}

/** For a form: registers `ask` while mounted. The latest `ask` is the one used. */
export function useRegisterLeaveAsk(ask: LeaveAsk) {
  const { register } = useContext(LeaveGateContext)
  useEffect(() => {
    register(ask)
  }, [register, ask])
  useEffect(() => () => register(null), [register])
}
