import type { UseFormRegister } from 'react-hook-form'
import type { ServiceFormValues } from '../hooks/useCreateService'
import { errorId } from '../lib/fieldIds'
import { HOST_ID, PORT_HINT_ID, PORT_ID, TCP_TEXT } from '../lib/serviceType'
import { TIMING_TEXT, readWholeNumber } from '../lib/timingGroup'
import { FieldErrorText } from './FieldErrorText'

type Props = {
  register: UseFormRegister<ServiceFormValues>
  /** A request is in flight: both inputs are read-only. */
  saving: boolean
  /** The message under each input (the client's, else the server's), or null. */
  hostError: string | null
  portError: string | null
  /** An input was edited: its errors go. */
  onEditHost: () => void
  onEditPort: () => void
}

/** The TCP port group: the host and the port of a TCP check (FR-49, FR-74). */
export function TcpGroup({ register, saving, hostError, portError, onEditHost, onEditPort }: Props) {
  const host = register('host', { onChange: onEditHost })
  const port = register('port', {
    // Only a TCP service has a port to check; the range is the server's.
    validate: (value, values) => values.type !== 'tcp' || readWholeNumber(value) !== null || TIMING_TEXT.notWhole,
    onChange: onEditPort,
  })
  return (
    <fieldset className="group">
      <legend className="group__legend">{TCP_TEXT.legend}</legend>
      <div className="url-row url-row--host-port">
        <div className="field">
          <label className="label" htmlFor={HOST_ID}>
            {TCP_TEXT.hostLabel}
          </label>
          <input
            className="input input--mono"
            id={HOST_ID}
            type="text"
            placeholder={TCP_TEXT.hostPlaceholder}
            readOnly={saving}
            aria-invalid={hostError ? 'true' : undefined}
            aria-describedby={hostError ? errorId(HOST_ID) : undefined}
            {...host}
          />
          {hostError && <FieldErrorText id={errorId(HOST_ID)} message={hostError} />}
        </div>
        <div className="field">
          <label className="label" htmlFor={PORT_ID}>
            {TCP_TEXT.portLabel}
          </label>
          <input
            className="input input--mono"
            id={PORT_ID}
            type="text"
            inputMode="numeric"
            placeholder={TCP_TEXT.portPlaceholder}
            readOnly={saving}
            aria-invalid={portError ? 'true' : undefined}
            aria-describedby={portError ? errorId(PORT_ID) : PORT_HINT_ID}
            {...port}
          />
          {portError ? (
            <FieldErrorText id={errorId(PORT_ID)} message={portError} />
          ) : (
            <p className="hint" id={PORT_HINT_ID}>
              {TCP_TEXT.portHint}
            </p>
          )}
        </div>
      </div>
    </fieldset>
  )
}
