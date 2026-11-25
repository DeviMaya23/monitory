import { useEffect, useMemo, useRef, useState, type BaseSyntheticEvent } from 'react'
import { LoaderCircle, Mail, TriangleAlert, Webhook } from 'lucide-react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { NameValueRows } from '../../../components/NameValueRows'
import { Dialog } from '../../../components/ui/Dialog'
import { RadioGroup } from '../../../components/ui/RadioGroup'
import type { Target } from '../../../lib/api/targets'
import { useSaveTarget, type SaveFailure } from '../hooks/useSaveTarget'
import type { TargetDialogState } from '../hooks/useTargetDialog'
import { useTargetLeaveGuard } from '../hooks/useTargetLeaveGuard'
import { useTargetServerErrors } from '../hooks/useTargetServerErrors'
import { useTestTarget } from '../hooks/useTestTarget'
import { FIELD_IDS, NAME_MAX_LENGTH, headerInputId, headerPath } from '../lib/targetFields'
import { EMPTY_VALUES, sameValues, toInput, usesPlainHttp, valuesOf, type TargetFormValues } from '../lib/targetForm'
import { FieldErrorText } from '../../../components/FieldErrorText'
import { ErrorSummary } from '../../../components/ErrorSummary'
import { TargetDialogBanners } from './TargetDialogBanners'
import { DiscardDialog } from '../../../components/DiscardDialog'
import { TargetTestRow } from './TargetTestRow'

/** How the dialog ended, for the screen to decide where focus goes and what to fetch. */
export type TargetDialogOutcome =
  | { kind: 'left' }
  | { kind: 'added'; id: string }
  | { kind: 'saved'; id: string }
  /** A save of an add, or a test of an add or an edit, was answered 404: the service may be gone, so the list is fetched again. */
  | { kind: 'gone' }
  /** "Close and refresh" of a target that is gone. */
  | { kind: 'refresh'; targetId: string }

type Props = {
  serviceId: string
  state: Exclude<TargetDialogState, { mode: 'none' }>
  onFinish: (outcome: TargetDialogOutcome) => void
  /** Where focus goes when the dialog has closed. */
  finalFocus: () => HTMLElement | null
}

const FORM_ID = 'target-form'
const HTTP_WARNING = 'This URL uses http://, so the URL and headers are sent unencrypted. You can still save it.'
const URL_HINT_ID = 'target-url-hint'
const TYPE_OPTIONS = [
  {
    value: 'email',
    text: 'Email',
    icon: <Mail className="icon icon--sm" aria-hidden="true" />,
  },
  {
    value: 'webhook',
    text: 'Webhook',
    icon: <Webhook className="icon icon--sm" aria-hidden="true" />,
  },
] as const
const DUPLICATE_MESSAGE = {
  email: 'This address is already in this service’s alert list.',
  webhook: 'This URL is already in this service’s alert list.',
} as const

const errorId = (fieldId: string) => `${fieldId}-error`
const filled = (value: string) => value.trim() !== ''
const focusById = (id: string) => document.getElementById(id)?.focus()

/** The dialog that adds a target to a service's alert list, or edits one (FR-14, FR-15). */
export function TargetDialog({ serviceId, state, onFinish, finalFocus }: Props) {
  const editing: Target | null = state.mode === 'edit' ? state.target : null
  const initial = useMemo<TargetFormValues>(() => (editing ? valuesOf(editing) : EMPTY_VALUES), [editing])
  const {
    register,
    control,
    handleSubmit,
    clearErrors,
    trigger,
    getValues,
    formState: { errors: clientErrors },
  } = useForm<TargetFormValues>({
    defaultValues: initial,
    // A client error goes when its field is edited, not when it becomes valid.
    reValidateMode: 'onSubmit',
  })
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'headers',
  })
  const [name, type, address, url, headers] = useWatch({
    control,
    name: ['name', 'type', 'address', 'url', 'headers'],
  })
  const values: TargetFormValues = { name, type, address, url, headers }

  const { saving, failure: saveFailure, submit, clearFailure } = useSaveTarget(serviceId)
  const test = useTestTarget(serviceId)
  // Which action started last: only its failure is shown (a UI choice, not server data).
  const [lastAction, setLastAction] = useState<'save' | 'test'>('save')
  const answered = lastAction === 'test' ? test.failure : saveFailure
  // A test's 404 closes the dialog; it never reaches the banners.
  const failure: SaveFailure | null = answered?.kind === 'not-found' && lastAction === 'test' ? null : answered
  const serverErrors = useTargetServerErrors(failure?.kind === 'field-errors' ? failure.errors : null)
  const guard = useTargetLeaveGuard({
    initial,
    values,
    saving,
    onLeave: () => onFinish({ kind: 'left' }),
  })

  const nameRef = useRef<HTMLInputElement | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const testRef = useRef<HTMLButtonElement>(null)
  const refreshRef = useRef<HTMLButtonElement>(null)
  // A duplicate's message goes when its field is edited; this is the failure it was cleared for.
  const [dupCleared, setDupCleared] = useState<SaveFailure | null>(null)

  // Focus goes where the outcome of the action started last is. A test's answers that are not
  // a 422 or a 404 leave focus where it is (on the test button, which never loses it).
  useEffect(() => {
    if (answered === null) return
    if (lastAction === 'test') {
      if (answered.kind === 'field-errors') summaryRef.current?.focus()
      if (answered.kind === 'not-found') onFinish({ kind: 'gone' })
      return
    }
    switch (answered.kind) {
      case 'field-errors':
        summaryRef.current?.focus()
        break
      case 'duplicate':
        focusById(answered.type === 'email' ? FIELD_IDS.address : FIELD_IDS.url)
        break
      case 'not-found':
        if (editing) refreshRef.current?.focus()
        else onFinish({ kind: 'gone' })
        break
      default:
        saveRef.current?.focus()
    }
    // Only a new failure moves focus; `editing` and `onFinish` do not change within one dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered])

  const save = handleSubmit(async (submitted) => {
    const saved = await submit(toInput(submitted), editing?.id ?? null)
    if (saved) onFinish({ kind: editing ? 'saved' : 'added', id: saved.id })
  })
  /** A new attempt: what the last one left goes first, then the client checks, then the request. */
  const onSubmit = (event?: BaseSyntheticEvent) => {
    event?.preventDefault()
    if (saving) return
    setLastAction('save')
    clearFailure()
    test.clear()
    void save(event)
  }

  /** A test: what the last action left goes first, then the contact is checked, then the request. */
  const onTest = async () => {
    if (test.testing) return
    setLastAction('test')
    clearFailure()
    test.clear()
    if (!(await trigger(getValues('type') === 'email' ? 'address' : 'url', { shouldFocus: true }))) return
    // A copy: `getValues` hands out the form's own, live object, which later edits change in place.
    const current = getValues()
    const sent: TargetFormValues = {
      ...current,
      headers: current.headers.map(({ name: headerName, value }) => ({ name: headerName, value })),
    }
    await test.run(toInput(sent), sent)
  }
  // The result belongs to the values it was sent with; any edit hides it, putting them back shows it again.
  const testResult = test.sent !== null && sameValues(values, test.sent) ? test.result : null

  const duplicateFor = (field: 'email' | 'webhook') =>
    failure?.kind === 'duplicate' && failure.type === field && dupCleared !== failure ? DUPLICATE_MESSAGE[field] : null
  const clearDuplicate = (f: SaveFailure | null) => {
    if (f?.kind === 'duplicate') setDupCleared(f)
  }

  const nameField = register('name', {
    onChange: () => serverErrors.clearField('name'),
  })
  const addressField = register('address', {
    validate: (value, form) => form.type !== 'email' || filled(value) || 'Enter an email address.',
    onChange: () => {
      clearErrors('address')
      serverErrors.clearField('address')
      clearDuplicate(failure)
    },
  })
  const urlField = register('url', {
    validate: (value, form) =>
      form.type !== 'webhook' || filled(value) || 'Enter a URL that starts with http:// or https://.',
    onChange: () => {
      clearErrors('url')
      serverErrors.clearField('url')
      clearDuplicate(failure)
    },
  })

  const nameError = serverErrors.errorFor('name')
  const addressError = clientErrors.address?.message ?? duplicateFor('email') ?? serverErrors.errorFor('address')
  const urlError = clientErrors.url?.message ?? duplicateFor('webhook') ?? serverErrors.errorFor('url')

  return (
    <Dialog
      open
      wide
      sheet
      showClose
      title={editing ? 'Edit target' : 'Add target'}
      busy={saving}
      onClose={guard.requestLeave}
      initialFocus={nameRef}
      finalFocus={finalFocus}
      footer={
        <>
          <button type="button" className="btn" disabled={saving} onClick={guard.requestLeave}>
            Cancel
          </button>
          <button
            type="submit"
            form={FORM_ID}
            className="btn btn--primary"
            ref={saveRef}
            disabled={saving}
            aria-busy={saving ? 'true' : undefined}
          >
            {saving && <LoaderCircle className="icon icon--sm spinner" aria-hidden="true" />}
            <span>{saving ? 'Saving…' : editing ? 'Save target' : 'Add target'}</span>
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="stack" noValidate onSubmit={onSubmit}>
        {/* The footer's button is outside the form; this one is the form's own default button, so that Enter in an input submits. */}
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
        <TargetDialogBanners
          failure={failure}
          editing={editing !== null}
          onRetry={lastAction === 'test' ? () => void onTest() : onSubmit}
          onCloseAndRefresh={() => editing && onFinish({ kind: 'refresh', targetId: editing.id })}
          refreshRef={refreshRef}
        >
          {serverErrors.count > 0 && (
            <ErrorSummary entries={serverErrors.entries} onGoToField={focusById} ref={summaryRef} />
          )}
        </TargetDialogBanners>

        <div className="field">
          <div className="field__top">
            <label className="label" htmlFor={FIELD_IDS.name}>
              Name <span className="opt">(optional)</span>
            </label>
            <span className="counter">
              {name.length}/{NAME_MAX_LENGTH}
            </span>
          </div>
          <input
            className="input"
            id={FIELD_IDS.name}
            type="text"
            placeholder="e.g. On-call inbox"
            maxLength={NAME_MAX_LENGTH}
            readOnly={saving}
            aria-invalid={nameError ? 'true' : undefined}
            aria-describedby={nameError ? errorId(FIELD_IDS.name) : undefined}
            {...nameField}
            ref={(element) => {
              nameField.ref(element)
              nameRef.current = element
            }}
          />
          {nameError && <FieldErrorText id={errorId(FIELD_IDS.name)} message={nameError} />}
        </div>

        <div className="field">
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <RadioGroup
                id={FIELD_IDS.type}
                label="Type"
                value={field.value}
                onValueChange={(next) => {
                  field.onChange(next)
                  clearErrors(['address', 'url'])
                  serverErrors.clearType(next)
                }}
                options={TYPE_OPTIONS}
                disabled={saving}
              />
            )}
          />
        </div>

        {type === 'email' ? (
          <div className="field">
            <div className="field__top">
              <label className="label" htmlFor={FIELD_IDS.address}>
                Email address
              </label>
            </div>
            <input
              className="input"
              id={FIELD_IDS.address}
              type="email"
              placeholder="name@example.com"
              readOnly={saving}
              aria-invalid={addressError ? 'true' : undefined}
              aria-describedby={addressError ? errorId(FIELD_IDS.address) : undefined}
              {...addressField}
            />
            {addressError && <FieldErrorText id={errorId(FIELD_IDS.address)} message={addressError} />}
          </div>
        ) : (
          <>
            <div className="field">
              <div className="field__top">
                <label className="label" htmlFor={FIELD_IDS.url}>
                  Webhook URL
                </label>
              </div>
              <input
                className="input input--mono"
                id={FIELD_IDS.url}
                type="url"
                placeholder="https://"
                readOnly={saving}
                aria-invalid={urlError ? 'true' : undefined}
                aria-describedby={urlError ? errorId(FIELD_IDS.url) : URL_HINT_ID}
                {...urlField}
              />
              {urlError ? (
                <FieldErrorText id={errorId(FIELD_IDS.url)} message={urlError} />
              ) : (
                <p className="hint" id={URL_HINT_ID}>
                  Starts with http:// or https://.
                </p>
              )}
            </div>
            {usesPlainHttp(url) && (
              <p className="notice notice--warn">
                <TriangleAlert className="icon icon--sm" aria-hidden="true" />
                <span>{HTTP_WARNING}</span>
              </p>
            )}
            <NameValueRows
              legend={
                <>
                  Custom headers <span className="opt">(optional)</span>
                </>
              }
              emptyText="No custom headers."
              addLabel="Add header"
              itemName="Header"
              rows={fields}
              inputId={headerInputId}
              register={(index, part) =>
                register(`headers.${index}.${part}` as const, {
                  onChange: () => serverErrors.clearField(headerPath(index, part)),
                })
              }
              errorFor={(index, part) => serverErrors.errorFor(headerPath(index, part))}
              listError={serverErrors.errorFor('headers')}
              readOnly={saving}
              onAdd={() => {
                append({ name: '', value: '' })
                serverErrors.clearField('headers')
              }}
              onRemove={(index) => {
                remove(index)
                serverErrors.clearHeaders()
              }}
            />
          </>
        )}

        <TargetTestRow
          testing={test.testing}
          result={testResult}
          onSend={() => void onTest()}
          buttonRef={testRef}
        />
      </form>

      <DiscardDialog
        open={guard.questionOpen}
        body="The changes to this target will be lost."
        onKeep={guard.keepEditing}
        onDiscard={guard.discard}
      />
    </Dialog>
  )
}
