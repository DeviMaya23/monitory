import { useId, useState, type ReactElement } from 'react'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { getPortalHost } from './portalHost'

type Props = {
  /** The tooltip text, rendered as text. */
  content: string
  /** One element that becomes the trigger itself; it must forward refs and props, as a router `Link` does. */
  children: ReactElement
}

/**
 * A tooltip on hover and keyboard focus. The child is the trigger (no wrapper element). Each
 * tooltip has its own provider, so no hover-skip is shared between instances. Base UI adds no
 * role or description link, so both are added here.
 */
export function Tooltip({ content, children }: Props) {
  const popupId = useId()
  const [open, setOpen] = useState(false)
  return (
    <BaseTooltip.Provider>
      <BaseTooltip.Root open={open} onOpenChange={setOpen}>
        <BaseTooltip.Trigger render={children} aria-describedby={open ? popupId : undefined} />
        <BaseTooltip.Portal container={getPortalHost()}>
          <BaseTooltip.Positioner side="bottom" align="start" sideOffset={6}>
            <BaseTooltip.Popup id={popupId} role="tooltip" className="tooltip">
              {content}
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  )
}
