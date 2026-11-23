import { Info } from 'lucide-react'
import { Controller, useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import { Switch } from '../../../components/ui/Switch'
import type { ServiceFormValues } from '../lib/formValues'
import type { useServerErrors } from '../hooks/useServerErrors'
import {
  CERT_DAYS_ID,
  CERT_ENABLED_ERROR_ID,
  CERT_DAYS_PATH,
  CERT_ENABLED_PATH,
  HTTPS_NOTE_ID,
  HTTPS_TEXT,
  IGNORE_CERT_ERROR_ID,
  IGNORE_CERT_PATH,
  startsWithHttps,
} from '../lib/certificateOptions'
import { errorId } from '../lib/fieldIds'
import { readWholeNumber, TIMING_TEXT } from '../lib/timingGroup'
import { FieldErrorText } from '../../../components/FieldErrorText'

type ServerErrors = Pick<
  ReturnType<typeof useServerErrors>,
  'errorFor' | 'bareError' | 'clearField' | 'clearBare' | 'clearExpiryOff'
>

type Props = {
  control: Control<ServiceFormValues>
  register: UseFormRegister<ServiceFormValues>
  /** A request is in flight: the days are locked and the switches disabled. */
  saving: boolean
  /** The days' message from the client's check, else the server's, or null. */
  daysError: string | null
  /** The days were edited, or the expiry switch went off: the client's message goes. */
  clearDaysError: () => void
  serverErrors: ServerErrors
}

/** The HTTPS group: the certificate-expiry check and "ignore certificate errors", for an `https://` URL (FR-34, FR-50, FR-64, FR-74). */
export function HttpsGroup({ control, register, saving, daysError, clearDaysError, serverErrors }: Props) {
  const url = useWatch({ control, name: 'url' })
  const expiryOn = useWatch({ control, name: 'cert_enabled' })
  const https = startsWithHttps(url)
  const expiryError = serverErrors.bareError(CERT_ENABLED_PATH)
  const ignoreError = serverErrors.bareError(IGNORE_CERT_PATH)
  const daysField = register('cert_days', {
    validate: (value, values) =>
      values.type === 'tcp' || !values.cert_enabled || readWholeNumber(value) !== null || TIMING_TEXT.notWhole,
    onChange: () => {
      clearDaysError()
      serverErrors.clearField(CERT_DAYS_PATH)
    },
  })
  return (
    <fieldset className="group" aria-describedby={https ? undefined : HTTPS_NOTE_ID}>
      <legend className="group__legend">{HTTPS_TEXT.legend}</legend>
      {!https && (
        <p className="notice notice--muted" id={HTTPS_NOTE_ID}>
          <Info className="icon icon--sm" aria-hidden="true" />
          <span>{HTTPS_TEXT.note}</span>
        </p>
      )}
      <div className="stack">
        <div>
          <Controller
            name="cert_enabled"
            control={control}
            render={({ field }) => (
              <Switch
                label={HTTPS_TEXT.expiryLabel}
                description={HTTPS_TEXT.expiryHint}
                checked={field.value}
                onCheckedChange={(next) => {
                  field.onChange(next)
                  if (next) serverErrors.clearBare(CERT_ENABLED_PATH)
                  else {
                    serverErrors.clearExpiryOff()
                    clearDaysError()
                  }
                }}
                disabled={saving || !https}
              />
            )}
          />
          {expiryError && <FieldErrorText id={CERT_ENABLED_ERROR_ID} message={expiryError} />}
        </div>
        <div className="sub-switch">
          <div className="field">
            <label className="label" htmlFor={CERT_DAYS_ID}>
              {HTTPS_TEXT.daysLabel}
            </label>
            <div className="input-group">
              <input
                className="input input--mono"
                id={CERT_DAYS_ID}
                type="text"
                inputMode="numeric"
                readOnly={saving}
                disabled={!expiryOn || !https}
                aria-invalid={daysError ? 'true' : undefined}
                aria-describedby={daysError ? errorId(CERT_DAYS_ID) : undefined}
                {...daysField}
              />
              <span className="input-group__addon" aria-hidden="true">
                {HTTPS_TEXT.daysAddon}
              </span>
            </div>
            {daysError && <FieldErrorText id={errorId(CERT_DAYS_ID)} message={daysError} />}
          </div>
        </div>
        <div>
          <Controller
            name="ignore_cert_errors"
            control={control}
            render={({ field }) => (
              <Switch
                label={HTTPS_TEXT.ignoreLabel}
                description={HTTPS_TEXT.ignoreHint}
                checked={field.value}
                onCheckedChange={(next) => {
                  field.onChange(next)
                  serverErrors.clearBare(IGNORE_CERT_PATH)
                }}
                disabled={saving || !https}
              />
            )}
          />
          {ignoreError && <FieldErrorText id={IGNORE_CERT_ERROR_ID} message={ignoreError} />}
        </div>
      </div>
    </fieldset>
  )
}
