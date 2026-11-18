import { Controller, useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import { Switch } from '../../../components/ui/Switch'
import type { ServiceFormValues } from '../hooks/useCreateService'
import { errorId, FIELD_IDS } from '../lib/fieldIds'
import type { FieldTarget } from '../lib/fieldLabels'
import { ALERTS_TEXT, countCharacters, MESSAGE_MAX } from '../lib/alertsGroup'
import { FieldErrorText } from './FieldErrorText'

type MessageName = 'unhealthy_message' | 'recovery_message'

type Props = {
  control: Control<ServiceFormValues>
  register: UseFormRegister<ServiceFormValues>
  /** A request is in flight: the switch and the text areas are locked. */
  saving: boolean
  /** The server's message for each text area, or null. */
  unhealthyError: string | null
  recoveryError: string | null
  /** The text area was edited: its server error goes. */
  clearField: (target: FieldTarget) => void
}

type MessageFieldProps = {
  name: MessageName
  label: string
  control: Control<ServiceFormValues>
  register: UseFormRegister<ServiceFormValues>
  saving: boolean
  error: string | null
  clearField: (target: FieldTarget) => void
}

function MessageField({ name, label, control, register, saving, error, clearField }: MessageFieldProps) {
  const text = useWatch({ control, name })
  const id = FIELD_IDS[name]
  const field = register(name, { onChange: () => clearField(name) })
  return (
    <div className="field">
      <div className="field__top">
        <label className="label" htmlFor={id}>
          {label} <span className="opt">{ALERTS_TEXT.optional}</span>
        </label>
        <span className="counter">
          {countCharacters(text)}/{MESSAGE_MAX}
        </span>
      </div>
      <textarea
        className="textarea textarea--sans"
        id={id}
        rows={3}
        placeholder={ALERTS_TEXT.placeholder}
        readOnly={saving}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId(id) : undefined}
        {...field}
      />
      {error && <FieldErrorText id={errorId(id)} message={error} />}
    </div>
  )
}

/** The Alerts group: the `Send alerts` switch and the two optional messages (FR-20, FR-65). */
export function AlertsGroup({ control, register, saving, unhealthyError, recoveryError, clearField }: Props) {
  return (
    <fieldset className="group">
      <legend className="group__legend">{ALERTS_TEXT.legend}</legend>
      <div className="stack">
        <Controller
          name="alerts_enabled"
          control={control}
          render={({ field }) => (
            <Switch
              label={ALERTS_TEXT.switchLabel}
              description={ALERTS_TEXT.switchHint}
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={saving}
            />
          )}
        />
        <div className="grid">
          <MessageField
            name="unhealthy_message"
            label={ALERTS_TEXT.unhealthyLabel}
            control={control}
            register={register}
            saving={saving}
            error={unhealthyError}
            clearField={clearField}
          />
          <MessageField
            name="recovery_message"
            label={ALERTS_TEXT.recoveryLabel}
            control={control}
            register={register}
            saving={saving}
            error={recoveryError}
            clearField={clearField}
          />
        </div>
      </div>
    </fieldset>
  )
}
