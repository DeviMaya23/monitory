import { Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import { RadioGroup } from '../../../components/ui/RadioGroup'
import { Select } from '../../../components/ui/Select'
import type { ServiceFormValues } from '../lib/formValues'
import { useRowFocus } from '../hooks/useRowFocus'
import type { useServerErrors } from '../hooks/useServerErrors'
import { errorId } from '../lib/fieldIds'
import {
  DEFAULT_RULE_KIND,
  RULE_KIND_OPTIONS,
  RULE_MODE_ID,
  RULE_MODE_OPTIONS,
  RULE_MODE_PATH,
  ruleInputId,
  ruleKindName,
  rulePath,
  ruleRemoveName,
  RULES_ERROR_ID,
  RULES_PATH,
  RULES_TEXT,
  ruleTextName,
  ruleLabel,
} from '../lib/jsonRules'
import { FieldErrorText } from './FieldErrorText'

type ServerErrors = Pick<
  ReturnType<typeof useServerErrors>,
  'errorFor' | 'bareError' | 'clearField' | 'clearRulesList' | 'clearRuleRows' | 'clearBare'
>

type Props = {
  control: Control<ServiceFormValues>
  register: UseFormRegister<ServiceFormValues>
  /** A request is in flight: the inputs are locked, the choices and buttons disabled. */
  saving: boolean
  serverErrors: ServerErrors
}

const firstInputId = (index: number) => ruleInputId(index, 'field')

type RowProps = Props & { index: number; onRemove: () => void }

function RuleRow({ index, control, register, saving, serverErrors, onRemove }: RowProps) {
  const kind = useWatch({ control, name: `json_rules.${index}.kind` }) ?? DEFAULT_RULE_KIND
  const fieldId = ruleInputId(index, 'field')
  const kindId = ruleInputId(index, 'kind')
  const textId = ruleInputId(index, 'text')
  const fieldError = serverErrors.errorFor(rulePath(index, 'field'))
  const valueError = serverErrors.errorFor(rulePath(index, 'failing_value'))
  const clearValue = () => serverErrors.clearField(rulePath(index, 'failing_value'))
  return (
    <div className="rules-row">
      <div className="kv__cell">
        <span className="kv__label" aria-hidden="true">
          {RULES_TEXT.headField}
        </span>
        <input
          className="input input--mono"
          id={fieldId}
          type="text"
          aria-label={ruleLabel(index, 'field')}
          readOnly={saving}
          aria-invalid={fieldError ? 'true' : undefined}
          aria-describedby={fieldError ? errorId(fieldId) : undefined}
          {...register(`json_rules.${index}.field`, {
            onChange: () => serverErrors.clearField(rulePath(index, 'field')),
          })}
        />
        {fieldError && <FieldErrorText id={errorId(fieldId)} message={fieldError} />}
      </div>
      <div className="kv__cell">
        <span className="kv__label" aria-hidden="true">
          {RULES_TEXT.headKind}
        </span>
        <Controller
          name={`json_rules.${index}.kind`}
          control={control}
          render={({ field }) => (
            <Select
              id={kindId}
              label={ruleKindName(index)}
              value={field.value}
              onValueChange={(next) => {
                field.onChange(next)
                clearValue()
              }}
              options={RULE_KIND_OPTIONS}
              disabled={saving}
              invalid={valueError !== null}
              aria-describedby={valueError ? errorId(kindId) : undefined}
            />
          )}
        />
        {valueError && <FieldErrorText id={errorId(kindId)} message={valueError} />}
      </div>
      <div className="kv__cell">
        <span className="kv__label" aria-hidden="true">
          {RULES_TEXT.headText}
        </span>
        {kind === 'text' ? (
          <input
            className="input input--mono"
            id={textId}
            type="text"
            aria-label={ruleTextName(index)}
            readOnly={saving}
            {...register(`json_rules.${index}.text`, { onChange: clearValue })}
          />
        ) : (
          <span className="hint">{RULES_TEXT.noText}</span>
        )}
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        aria-label={ruleRemoveName(index)}
        disabled={saving}
        onClick={onRemove}
      >
        <Trash2 className="icon" aria-hidden="true" />
      </button>
    </div>
  )
}

/** The Health rules group: JSON rules and how they combine (FR-44, FR-46, FR-47). */
export function HealthRulesGroup({ control, register, saving, serverErrors }: Props) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'json_rules',
  })
  const { addButton, addRow, removeRow } = useRowFocus(fields, firstInputId)
  const listError = serverErrors.bareError(RULES_PATH)
  return (
    <fieldset className="group">
      <legend className="group__legend">
        {RULES_TEXT.legend} <span className="label opt">{RULES_TEXT.optional}</span>
      </legend>
      <p className="group__desc">{RULES_TEXT.description}</p>
      <div className="rows">
        {fields.length === 0 ? (
          <p className="rows__empty">{RULES_TEXT.empty}</p>
        ) : (
          <>
            <div className="rules-row rows__head" aria-hidden="true">
              <span>{RULES_TEXT.headField}</span>
              <span>{RULES_TEXT.headKind}</span>
              <span>{RULES_TEXT.headText}</span>
              <span />
            </div>
            {fields.map((row, index) => (
              <RuleRow
                key={row.id}
                index={index}
                control={control}
                register={register}
                saving={saving}
                serverErrors={serverErrors}
                onRemove={() =>
                  removeRow(index, () => {
                    remove(index)
                    serverErrors.clearRuleRows()
                  })
                }
              />
            ))}
          </>
        )}
        {listError && <FieldErrorText id={RULES_ERROR_ID} message={listError} />}
        <div className="rows__foot">
          <button
            type="button"
            className="btn"
            ref={addButton}
            disabled={saving}
            onClick={() =>
              addRow(() => {
                append({ field: '', kind: DEFAULT_RULE_KIND, text: '' })
                serverErrors.clearRulesList()
              })
            }
          >
            <Plus className="icon icon--sm" aria-hidden="true" />
            <span>{RULES_TEXT.add}</span>
          </button>
          <span className="hint">
            {RULES_TEXT.hintLead} <span className="mono">{RULES_TEXT.hintExample}</span>
          </span>
        </div>
      </div>
      <div className="field">
        <Controller
          name="json_rule_mode"
          control={control}
          render={({ field }) => (
            <RadioGroup
              id={RULE_MODE_ID}
              label={RULES_TEXT.modeLabel}
              value={field.value}
              onValueChange={(next) => {
                field.onChange(next)
                serverErrors.clearBare(RULE_MODE_PATH)
              }}
              options={RULE_MODE_OPTIONS}
              disabled={saving}
            />
          )}
        />
      </div>
    </fieldset>
  )
}
