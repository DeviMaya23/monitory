import { Controller, type Control } from 'react-hook-form'
import { RadioGroup } from '../../../components/ui/RadioGroup'
import type { ServiceFormValues } from '../lib/formValues'
import { TYPE_HINT_ID, TYPE_ID, TYPE_OPTIONS, TYPE_TEXT, type ServiceType } from '../lib/serviceType'

type Props = {
  control: Control<ServiceFormValues>
  /** A request is in flight: the choice is locked. */
  saving: boolean
  /** The type was changed to `next`, after the form's value took it. */
  onChange: (next: ServiceType) => void
}

/** The Type choice of the Service group: HTTP(S) or TCP port (FR-33). */
export function TypeField({ control, saving, onChange }: Props) {
  return (
    <div className="field">
      <Controller
        name="type"
        control={control}
        render={({ field }) => (
          <RadioGroup
            id={TYPE_ID}
            label={TYPE_TEXT.label}
            value={field.value}
            onValueChange={(next) => {
              field.onChange(next)
              onChange(next)
            }}
            options={TYPE_OPTIONS}
            disabled={saving}
          />
        )}
      />
      <p className="hint" id={TYPE_HINT_ID}>
        {TYPE_TEXT.hint}
      </p>
    </div>
  )
}
