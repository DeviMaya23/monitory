import { Controller, type Control } from 'react-hook-form'
import { Switch } from '../../../components/ui/Switch'
import type { ServiceFormValues } from '../lib/formValues'
import { PUBLIC_PAGE_TEXT } from '../lib/publicPageGroup'

type Props = {
  control: Control<ServiceFormValues>
  /** A request is in flight: the switch is locked. */
  saving: boolean
}

/** The Public page group: the `Show on public page` switch (FR-27, FR-68). */
export function PublicPageGroup({ control, saving }: Props) {
  return (
    <fieldset className="group">
      <legend className="group__legend">{PUBLIC_PAGE_TEXT.legend}</legend>
      <div className="stack">
        <Controller
          name="shown_on_public_view"
          control={control}
          render={({ field }) => (
            <Switch
              label={PUBLIC_PAGE_TEXT.switchLabel}
              description={PUBLIC_PAGE_TEXT.switchHint}
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={saving}
            />
          )}
        />
      </div>
    </fieldset>
  )
}
