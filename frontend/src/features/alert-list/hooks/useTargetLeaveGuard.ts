import { useEffect, useState } from 'react'
import { sameValues, type TargetFormValues } from '../lib/targetForm'

type Options = {
  /** What the dialog opened with. */
  initial: TargetFormValues
  /** The values as the form holds them. */
  values: TargetFormValues
  /** A save is in flight: nothing closes the dialog. */
  saving: boolean
  /** Closes the dialog. */
  onLeave: () => void
}

/**
 * Guards the dialog's exits: whether the form is changed, the "Discard unsaved changes?" question
 * for Cancel, Close, Esc and the backdrop, and the browser's prompt on closing or reloading the tab.
 */
export function useTargetLeaveGuard({ initial, values, saving, onLeave }: Options) {
  const [questionOpen, setQuestionOpen] = useState(false)
  const changed = !sameValues(initial, values)
  const armed = changed && !saving

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
    questionOpen,
    /** Cancel, Close, Esc, the backdrop: leaves at once, asks first when changed, does nothing while saving. */
    requestLeave: () => {
      if (saving) return
      if (changed) setQuestionOpen(true)
      else onLeave()
    },
    /** "Keep editing", Esc and the backdrop on the question. */
    keepEditing: () => setQuestionOpen(false),
    /** "Discard changes". */
    discard: () => {
      setQuestionOpen(false)
      onLeave()
    },
  }
}
