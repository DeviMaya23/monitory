import { Switch as BaseSwitch } from '@base-ui/react/switch'

type Props = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** The visible text that names the switch. */
  label: string
  disabled?: boolean
}

/** An on/off switch with a visible text label and its state in words; clicking the label toggles it too. */
export function Switch({ checked, onCheckedChange, label, disabled = false }: Props) {
  return (
    <label className="switch-row">
      <BaseSwitch.Root
        className="switch"
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        disabled={disabled}
      >
        <BaseSwitch.Thumb className="switch__thumb" />
      </BaseSwitch.Root>
      <span className="switch-row__text">
        <span className="label">{label}</span>
      </span>
      <span className="switch-row__state" aria-hidden="true">
        {checked ? 'On' : 'Off'}
      </span>
    </label>
  )
}
