import { useEffect, useState, type MouseEvent } from 'react'
import type { HttpMethod } from '../../../lib/api/services'

/** The method a new service starts with. */
export const DEFAULT_METHOD: HttpMethod = 'GET'

type Options = {
  /** The values as the inputs hold them. */
  name: string
  method: string
  url: string
  /** A save is in flight. */
  saving: boolean
  /** The save succeeded; the page is about to go. */
  saved: boolean
  /** Leaves the form (goes to the dashboard). */
  onLeave: () => void
}

/**
 * Guards the form's own exits: whether the form is changed, the "Discard unsaved changes?"
 * dialog for Cancel and the back link, and the browser's prompt on closing or reloading the tab.
 */
export function useLeaveGuard({ name, method, url, saving, saved, onLeave }: Options) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const changed = name !== '' || url !== '' || method !== DEFAULT_METHOD
  // While saving the form is left at once: the request is not cancelled.
  const asks = changed && !saving
  const armed = changed && !saving && !saved

  useEffect(() => {
    if (!armed) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [armed])

  return {
    changed,
    dialogOpen,
    /** Cancel: leaves at once, or asks first when the form is changed. */
    cancel: () => {
      if (asks) setDialogOpen(true)
      else onLeave()
    },
    /** For the back link: it navigates by itself unless the form is changed, when the dialog opens instead. */
    backLinkProps: {
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        if (!asks) return
        event.preventDefault()
        setDialogOpen(true)
      },
    },
    /** "Keep editing", Esc and the backdrop. */
    keepEditing: () => setDialogOpen(false),
    /** "Discard changes". */
    discard: () => {
      setDialogOpen(false)
      onLeave()
    },
  }
}
