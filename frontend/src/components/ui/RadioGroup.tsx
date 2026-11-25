import { useId, type ReactNode } from 'react'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group'

type Option<T extends string> = { value: T; text: string; icon?: ReactNode }

type Props<T extends string> = {
  /** The group's accessible name; the caller shows it as the group's label. */
  label: string
  value: T
  onValueChange: (value: T) => void
  options: readonly Option<T>[]
  disabled?: boolean
  /** The id of the group element. */
  id?: string
  /** The id of the element that describes the group (a hint); set as `aria-describedby` on the group. */
  describedBy?: string
}

/**
 * A segmented choice of one option (a radio group). The label is rendered above the control
 * and names the group; arrow keys move the choice, Tab enters and leaves the group once.
 */
export function RadioGroup<T extends string>({ label, value, onValueChange, options, disabled = false, id, describedBy }: Props<T>) {
  const labelId = useId()
  return (
    <>
      <span className="label" id={labelId}>
        {label}
      </span>
      <BaseRadioGroup
        className="segmented"
        id={id}
        value={value}
        onValueChange={(next) => onValueChange(next as T)}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
      >
        {options.map((option) => (
          <label key={option.value}>
            <Radio.Root className="segmented__radio" value={option.value} aria-label={option.text} />
            {option.icon}
            <span>{option.text}</span>
          </label>
        ))}
      </BaseRadioGroup>
    </>
  )
}
