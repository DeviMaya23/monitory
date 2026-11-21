import { useEffect, useState, type MouseEvent } from 'react'
import type { HttpMethod } from '../../../lib/api/services'
import { DEFAULT_CERT_DAYS } from '../lib/certificateOptions'
import { DEFAULT_RULE_MODE } from '../lib/jsonRules'
import { DEFAULT_BODY_TYPE } from '../lib/requestRows'
import { DEFAULT_SERVICE_TYPE } from '../lib/serviceType'
import { TIMING_DEFAULTS, TIMING_NAMES, type TimingTexts } from '../lib/timingGroup'

/** The method a new service starts with. */
export const DEFAULT_METHOD: HttpMethod = 'GET'

type Options = {
  /** The values as the inputs hold them. */
  name: string
  type: string
  host: string
  port: string
  method: string
  url: string
  /** How many query parameter and header rows there are (an empty row counts). */
  queryRowCount: number
  headerRowCount: number
  bodyType: string
  bodyContent: string
  /** How many rules there are (an empty one counts), and the mode. */
  ruleCount: number
  ruleMode: string
  certEnabled: boolean
  certDays: string
  ignoreCertErrors: boolean
  alertsEnabled: boolean
  unhealthyMessage: string
  recoveryMessage: string
  /** The four timing texts. */
  timing: TimingTexts
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
export function useLeaveGuard({
  name,
  type,
  host,
  port,
  method,
  url,
  queryRowCount,
  headerRowCount,
  bodyType,
  bodyContent,
  ruleCount,
  ruleMode,
  certEnabled,
  certDays,
  ignoreCertErrors,
  alertsEnabled,
  unhealthyMessage,
  recoveryMessage,
  timing,
  saving,
  saved,
  onLeave,
}: Options) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const changed =
    name !== '' ||
    type !== DEFAULT_SERVICE_TYPE ||
    host !== '' ||
    port !== '' ||
    url !== '' ||
    method !== DEFAULT_METHOD ||
    queryRowCount > 0 ||
    headerRowCount > 0 ||
    bodyType !== DEFAULT_BODY_TYPE ||
    bodyContent !== '' ||
    ruleCount > 0 ||
    ruleMode !== DEFAULT_RULE_MODE ||
    certEnabled ||
    certDays !== DEFAULT_CERT_DAYS ||
    ignoreCertErrors ||
    !alertsEnabled ||
    unhealthyMessage !== '' ||
    recoveryMessage !== '' ||
    TIMING_NAMES.some((key) => timing[key] !== TIMING_DEFAULTS[key])
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
