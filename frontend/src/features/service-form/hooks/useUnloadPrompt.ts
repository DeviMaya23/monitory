import { useEffect } from 'react'

/** Arms the browser's prompt on closing or reloading the tab while `armed` is true. */
export function useUnloadPrompt(armed: boolean) {
  useEffect(() => {
    if (!armed) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [armed])
}
