import { Controller, useFieldArray, useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import { NameValueRows } from '../../../components/NameValueRows'
import { RadioGroup } from '../../../components/ui/RadioGroup'
import type { ServiceFormValues } from '../hooks/useCreateService'
import type { useServerErrors } from '../hooks/useServerErrors'
import { errorId } from '../lib/fieldIds'
import {
  BODY_CONTENT_ID,
  BODY_HINT_ID,
  BODY_OPTIONS,
  BODY_TEXT,
  BODY_TYPE_ID,
  listPath,
  rowInputId,
  rowPath,
  ROW_LIST_NAMES,
  ROW_LISTS,
  type RowList,
} from '../lib/requestRows'
import { FieldErrorText } from './FieldErrorText'

type ServerErrors = Pick<
  ReturnType<typeof useServerErrors>,
  'errorFor' | 'bareError' | 'clearField' | 'clearList' | 'clearRows' | 'clearBodyType'
>

type Props = {
  control: Control<ServiceFormValues>
  register: UseFormRegister<ServiceFormValues>
  /** A request is in flight: the rows and the text are locked, the buttons and the choice disabled. */
  saving: boolean
  serverErrors: ServerErrors
}

type ListProps = Props & { list: RowList }

function RowsOf({ list, control, register, saving, serverErrors }: ListProps) {
  const { fields, append, remove } = useFieldArray({ control, name: list })
  const words = ROW_LISTS[list]
  return (
    <NameValueRows
      legend={words.legend}
      emptyText={words.emptyText}
      addLabel={words.addLabel}
      itemName={words.itemName}
      hint={words.hint}
      rows={fields}
      inputId={(index, part) => rowInputId(list, index, part)}
      register={(index, part) =>
        register(`${list}.${index}.${part}` as const, {
          onChange: () => serverErrors.clearField(rowPath(list, index, part)),
        })
      }
      errorFor={(index, part) => serverErrors.errorFor(rowPath(list, index, part))}
      listError={serverErrors.bareError(listPath(list))}
      readOnly={saving}
      onAdd={() => {
        append({ name: '', value: '' })
        serverErrors.clearList(list)
      }}
      onRemove={(index) => {
        remove(index)
        serverErrors.clearRows(list)
      }}
    />
  )
}

/** The Body type choice, and the Body text while the type is not `None`. */
function BodyFields({ control, register, saving, serverErrors }: Props) {
  const bodyType = useWatch({ control, name: 'body_type' })
  const error = serverErrors.errorFor('check.body.content')
  const field = register('body_content', {
    onChange: () => serverErrors.clearField('check.body.content'),
  })
  return (
    <>
      <div className="field">
        <Controller
          name="body_type"
          control={control}
          render={({ field: typeField }) => (
            <RadioGroup
              id={BODY_TYPE_ID}
              label={BODY_TEXT.typeLabel}
              value={typeField.value}
              onValueChange={(next) => {
                typeField.onChange(next)
                serverErrors.clearBodyType()
              }}
              options={BODY_OPTIONS}
              disabled={saving}
            />
          )}
        />
      </div>
      {bodyType !== 'none' && (
        <div className="field">
          <label className="label" htmlFor={BODY_CONTENT_ID}>
            {BODY_TEXT.contentLabel}
          </label>
          <textarea
            className="textarea"
            id={BODY_CONTENT_ID}
            rows={6}
            readOnly={saving}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? errorId(BODY_CONTENT_ID) : BODY_HINT_ID}
            {...field}
          />
          {error ? (
            <FieldErrorText id={errorId(BODY_CONTENT_ID)} message={error} />
          ) : (
            <p className="hint" id={BODY_HINT_ID}>
              {BODY_TEXT.hint}
            </p>
          )}
        </div>
      )}
    </>
  )
}

/** The Request group's rows and body: query parameters, headers, the body type and the body text (FR-35, FR-37). */
export function RequestRowsGroup(props: Props) {
  return (
    <>
      {ROW_LIST_NAMES.map((list) => (
        <RowsOf key={list} list={list} {...props} />
      ))}
      <BodyFields {...props} />
    </>
  )
}
