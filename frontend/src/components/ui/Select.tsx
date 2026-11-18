import { Select as BaseSelect } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { getPortalHost } from './portalHost'

export type SelectOption = { value: string; label: string }

type Props = {
  /** The id of the trigger; the label points at it. */
  id: string
  /** The visible text that names the select. */
  label: string
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectOption[]
  disabled?: boolean
  /** Marks the trigger invalid (`aria-invalid` and the invalid style). */
  invalid?: boolean
  'aria-describedby'?: string
}

/** A single-choice select with a visible label: a trigger that shows the chosen option and a popup list. */
export function Select({
  id,
  label,
  value,
  onValueChange,
  options,
  disabled = false,
  invalid = false,
  'aria-describedby': describedBy,
}: Props) {
  return (
    <>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <BaseSelect.Root
        items={options}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onValueChange(next)
        }}
        disabled={disabled}
      >
        <BaseSelect.Trigger
          id={id}
          className="select-trigger"
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={describedBy}
        >
          <BaseSelect.Value />
          <BaseSelect.Icon>
            <ChevronDown className="icon icon--sm" aria-hidden="true" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal container={getPortalHost()}>
          <BaseSelect.Positioner className="menu-layer" alignItemWithTrigger={false} sideOffset={4}>
            <BaseSelect.Popup className="menu">
              <BaseSelect.List>
                {options.map((option) => (
                  <BaseSelect.Item key={option.value} value={option.value} className="menu__item">
                    <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                    <BaseSelect.ItemIndicator>
                      <Check className="icon icon--sm" aria-hidden="true" />
                    </BaseSelect.ItemIndicator>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </>
  )
}
