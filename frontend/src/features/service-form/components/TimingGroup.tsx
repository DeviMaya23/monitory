import { useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import type { ServiceFormValues } from '../hooks/useCreateService'
import { errorId, FIELD_IDS } from '../lib/fieldIds'
import type { StaticTarget } from '../lib/fieldLabels'
import {
  longestAttempt,
  readTiming,
  readWholeNumber,
  TIMING_ERROR_ID,
  TIMING_FIELDS,
  TIMING_NAMES,
  TIMING_SUM_ID,
  TIMING_TEXT,
  type TimingName,
} from '../lib/timingGroup'
import { FieldErrorText } from './FieldErrorText'

type Props = {
  control: Control<ServiceFormValues>
  register: UseFormRegister<ServiceFormValues>
  /** A request is in flight: the inputs are locked. */
  saving: boolean
  /** The message under each input (the client's, else the server's), or null. */
  errors: Record<TimingName, string | null>
  /** The server's message for the group as a whole, or null. */
  groupError: string | null
  /** An input was edited: its errors and the group's go. */
  onEdit: (name: TimingName) => void
}

const targetOf = (name: TimingName): StaticTarget => TIMING_FIELDS[name].path

/** The longest attempt against the interval, as text; null when it cannot be shown. */
function useSummaryLine(control: Control<ServiceFormValues>) {
  const [check_interval, timeout, retries, retry_interval] = useWatch({
    control,
    name: TIMING_NAMES.slice(),
  })
  const timing = readTiming({
    check_interval,
    timeout,
    retries,
    retry_interval,
  })
  if (timing === null) return null
  const longest = longestAttempt(timing.timeout, timing.retries, timing.retryInterval, timing.interval)
  if (longest === null) return null
  return { timing, ...longest }
}

/** The Timing group: check interval, timeout, retries and retry interval (FR-41, FR-51, FR-53, FR-57), with FR-56's worst case. */
export function TimingGroup({ control, register, saving, errors, groupError, onEdit }: Props) {
  const line = useSummaryLine(control)
  const describedBy = [line ? TIMING_SUM_ID : null, groupError ? TIMING_ERROR_ID : null].filter(Boolean).join(' ')
  return (
    <fieldset className={groupError ? 'group group--invalid' : 'group'} aria-describedby={describedBy || undefined}>
      <legend className="group__legend">{TIMING_TEXT.legend}</legend>
      {groupError && <FieldErrorText id={TIMING_ERROR_ID} message={groupError} />}
      <div className="grid grid--4">
        {TIMING_NAMES.map((name) => {
          const { label, addon } = TIMING_FIELDS[name]
          const id = FIELD_IDS[targetOf(name)]
          const error = errors[name]
          const field = register(name, {
            validate: (value) => readWholeNumber(value) !== null || TIMING_TEXT.notWhole,
            onChange: () => onEdit(name),
          })
          return (
            <div className="field" key={name}>
              <label className="label" htmlFor={id}>
                {label}
              </label>
              <div className="input-group">
                <input
                  className="input input--mono"
                  id={id}
                  type="text"
                  inputMode="numeric"
                  readOnly={saving}
                  aria-invalid={error ? 'true' : undefined}
                  aria-describedby={error ? errorId(id) : undefined}
                  {...field}
                />
                <span className="input-group__addon" aria-hidden="true">
                  {addon}
                </span>
              </div>
              {error && <FieldErrorText id={errorId(id)} message={error} />}
            </div>
          )
        })}
      </div>
      {line && (
        <p className="timing-sum" id={TIMING_SUM_ID}>
          <span>{TIMING_TEXT.longest}</span>{' '}
          <span className="mono">
            {line.timing.timeout} × (1 + {line.timing.retries}) + {line.timing.retryInterval} × {line.timing.retries} ={' '}
            {line.seconds} s
          </span>{' '}
          <span>
            {line.fits ? TIMING_TEXT.fits : TIMING_TEXT.exceeds} the {line.timing.interval} s interval.
          </span>
        </p>
      )}
    </fieldset>
  )
}
