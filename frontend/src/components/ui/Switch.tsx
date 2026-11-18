import { useId } from 'react'
import { Switch as BaseSwitch } from '@base-ui/react/switch'

type Props = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** The visible text that names the switch. */
  label: string
  disabled?: boolean
  /** Optional hint under the label; the switch's description, not part of its name. */
  description?: string
}

/** An on/off switch with a visible text label and its state in words; clicking the label toggles it too. */
export function Switch({ checked, onCheckedChange, label, disabled = false, description }: Props) {
  const labelId = useId()
  const hintId = useId()
  return (
    <label className="switch-row">
      <BaseSwitch.Root
        className="switch"
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        disabled={disabled}
        // The wrapping label would add the hint to the name, so the name points at the label text alone.
        aria-labelledby={description === undefined ? undefined : labelId}
        aria-describedby={description === undefined ? undefined : hintId}
      >
        <BaseSwitch.Thumb className="switch__thumb" />
      </BaseSwitch.Root>
      <span className="switch-row__text">
        <span className="label" id={description === undefined ? undefined : labelId}>
          {label}
        </span>
        {description !== undefined && (
          <span className="hint" id={hintId}>
            {description}
          </span>
        )}
      </span>
      <span className="switch-row__state" aria-hidden="true">
        {checked ? 'On' : 'Off'}
      </span>
    </label>
  )
}
