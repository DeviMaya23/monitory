import { useEffect, useRef, type BaseSyntheticEvent, type MutableRefObject } from 'react'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { Select } from '../../../components/ui/Select'
import type { HttpMethod } from '../../../lib/api/services'
import { useLeaveGuard } from '../hooks/useLeaveGuard'
import type { useSaveService } from '../hooks/useSaveService'
import { useTestCheck } from '../hooks/useTestCheck'
import { useFieldErrorSet, useServerErrors } from '../hooks/useServerErrors'
import { errorId, FIELD_IDS, fieldId, focusById, focusField } from '../lib/fieldIds'
import { CERT_DAYS_PATH, startsWithHttps } from '../lib/certificateOptions'
import { isFormChanged } from '../lib/formChanged'
import type { ServiceFormValues } from '../lib/formValues'
import { HOST_PATH, PORT_PATH } from '../lib/serviceType'
import { TIMING_FIELDS, TIMING_NAMES, type TimingName } from '../lib/timingGroup'
import { AlertsGroup } from './AlertsGroup'
import { DiscardDialog } from '../../../components/DiscardDialog'
import { ErrorSummary } from '../../../components/ErrorSummary'
import { FieldErrorText } from '../../../components/FieldErrorText'
import { FormBanners } from './FormBanners'
import { HealthRulesGroup } from './HealthRulesGroup'
import { HttpsGroup } from './HttpsGroup'
import { PublicPageGroup } from './PublicPageGroup'
import { RequestRowsGroup } from './RequestRowsGroup'
import { TestPanel } from './TestPanel'
import { TcpGroup } from './TcpGroup'
import { TimingGroup } from './TimingGroup'
import { TypeField } from './TypeField'
import '../service-form.css'

// The methods the contract allows (FR-36), in the order the select lists them.
const METHODS: readonly HttpMethod[] = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH']
const METHOD_OPTIONS = METHODS.map((method) => ({ value: method, label: method }))

const SAVING = 'Saving…'
const NAME_TAKEN = 'Another service already uses this name (names ignore case).'
const URL_HINT_ID = 'service-url-hint'
const URL_HINT = 'Starts with http:// or https://. Query parameters can go here or below.'

const filled = (value: string) => value.trim() !== ''

/** The inputs that failed a client check, as the form library names them in `errors`, in the order of the page. */
function invalidInputs(errors: FieldErrors<ServiceFormValues>): HTMLElement[] {
  const found: HTMLElement[] = []
  const walk = (node: unknown) => {
    if (typeof node !== 'object' || node === null) return
    const { ref } = node as { ref?: unknown }
    if (ref instanceof HTMLElement) found.push(ref)
    for (const child of Object.values(node)) if (child !== ref) walk(child)
  }
  walk(errors)
  return sortByPage(found)
}

/** Elements in the order of the page. */
function sortByPage(elements: HTMLElement[]): HTMLElement[] {
  return elements.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
}

type Props = {
  /** The page heading. */
  title: string
  /** Shown under the heading as plain text (the saved name on the Edit screen). */
  subtitle?: string
  /** Where the form starts, and what "changed" is measured against. */
  initialValues: ServiceFormValues
  /** The save state of the screen's own hook (`useCreateService` or `useUpdateService`). */
  save: Pick<ReturnType<typeof useSaveService>, 'saving' | 'failure' | 'submit' | 'clearFailure'>
  /** The wrapper's `onSaved` calls this; the form puts the guard's `markSaved` in it. */
  markSavedRef: MutableRefObject<() => void>
}

/** The service form, shared by the Add and Edit screens (FR-6, FR-7): the groups, the guard and the footer. */
export function ServiceForm({ title, subtitle, initialValues, save: saveState, markSavedRef }: Props) {
  const navigate = useNavigate()
  const {
    register,
    control,
    handleSubmit,
    trigger,
    getFieldState,
    getValues,
    clearErrors,
    setValue,
    formState: { errors: clientErrors },
  } = useForm<ServiceFormValues>({
    defaultValues: initialValues,
    // A client error goes when its field is edited, not when it becomes valid.
    reValidateMode: 'onSubmit',
    // Groups that mount later register later: focus goes by the order of the page instead (see invalidInputs).
    shouldFocusError: false,
  })
  const { saving, failure, submit, clearFailure } = saveState
  const fieldSet = useFieldErrorSet(failure?.kind === 'field-errors' ? failure.errors : null)
  const serverErrors = useServerErrors(fieldSet.errors)
  const test = useTestCheck(fieldSet.showTest)
  const values = useWatch({ control }) as ServiceFormValues
  const { type } = values
  const guard = useLeaveGuard({ changed: isFormChanged(values, initialValues), saving })
  useEffect(() => {
    markSavedRef.current = guard.markSaved
  })
  const summaryRef = useRef<HTMLDivElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const testRef = useRef<HTMLButtonElement>(null)
  // The test button had focus when the test started, so focus comes back to it with the answer.
  const testHadFocus = useRef(false)
  const notFoundLinkRef = useRef<HTMLAnchorElement>(null)
  // The service is gone: nothing can be saved, and editing does not clear this.
  const gone = failure?.kind === 'not-found'

  useEffect(() => {
    focusField('name')
  }, [])

  // Focus goes where the outcome of a save is.
  useEffect(() => {
    if (failure === null) return
    if (failure.kind === 'field-errors') summaryRef.current?.focus()
    else if (failure.kind === 'name-taken') focusField('name')
    else if (failure.kind === 'not-found') notFoundLinkRef.current?.focus()
    else saveRef.current?.focus()
  }, [failure])

  // A test's 422 takes focus to the summary, as a save's does.
  useEffect(() => {
    if (fieldSet.source === 'test') summaryRef.current?.focus()
  }, [fieldSet.errors, fieldSet.source])

  // The answer of a test is in (not a refusal: that moves focus to its own place).
  const testKind = test.state.kind
  useEffect(() => {
    if (testKind !== 'result' && testKind !== 'failed') return
    const active = document.activeElement
    if (testHadFocus.current && (active === null || active === document.body || active === testRef.current)) {
      testRef.current?.focus()
    }
    testHadFocus.current = false
  }, [testKind, test.state])

  const save = handleSubmit(submit, (errors) => invalidInputs(errors)[0]?.focus())
  /** A new attempt: what the last one left goes first, then the client checks, then the request. */
  const onSubmit = (event?: BaseSyntheticEvent) => {
    event?.preventDefault()
    // A disabled button does not stop Enter in a field.
    if (saving || gone) return
    clearFailure()
    fieldSet.startSave()
    void save(event)
  }

  /** Runs one test: only the checks a test needs, then the request. Saves nothing. */
  const onRunTest = async () => {
    if (test.running || saving) return
    testHadFocus.current = document.activeElement === testRef.current
    const current = getValues()
    const names: Array<'url' | 'cert_days' | 'port' | 'timeout'> =
      current.type === 'tcp' ? ['port', 'timeout'] : ['url', 'cert_days', 'timeout']
    fieldSet.startTest()
    if (!(await trigger(names))) {
      const refs = names.flatMap((name) => {
        const ref = getFieldState(name).error?.ref
        return ref instanceof HTMLElement ? [ref] : []
      })
      sortByPage(refs)[0]?.focus()
      testHadFocus.current = false
      test.refuse()
      return
    }
    await test.run(getValues())
  }

  const nameField = register('name', {
    validate: (value) => filled(value) || 'Enter a name.',
    onChange: () => {
      clearErrors('name')
      serverErrors.clearField('name')
      if (failure?.kind === 'name-taken') clearFailure()
    },
  })
  const urlField = register('url', {
    validate: (value, values) => values.type === 'tcp' || filled(value) || 'Enter a URL.',
    onChange: (event) => {
      clearErrors(['url', 'cert_days'])
      serverErrors.clearUrl()
      // The HTTPS options belong to an https:// URL: they go off the moment it stops being one.
      if (!startsWithHttps(event.target.value)) {
        setValue('cert_enabled', false)
        setValue('ignore_cert_errors', false)
      }
    },
  })

  /** A type change: the client errors of the fields going away and every `check.` error (answered for the other type) go. */
  const onTypeChange = () => {
    clearErrors(['url', 'cert_days', 'port'])
    serverErrors.clearCheck()
  }

  const nameError =
    clientErrors.name?.message ?? (failure?.kind === 'name-taken' ? NAME_TAKEN : serverErrors.errorFor('name'))
  const methodError = serverErrors.errorFor('check.method')
  const urlError = clientErrors.url?.message ?? serverErrors.errorFor('check.url')
  const timingErrors = Object.fromEntries(
    TIMING_NAMES.map((key) => [key, clientErrors[key]?.message ?? serverErrors.errorFor(TIMING_FIELDS[key].path)]),
  ) as Record<TimingName, string | null>
  const hostError = serverErrors.errorFor(HOST_PATH)
  const portError = clientErrors.port?.message ?? serverErrors.errorFor(PORT_PATH)
  const daysError = clientErrors.cert_days?.message ?? serverErrors.errorFor(CERT_DAYS_PATH)
  const status = saving ? SAVING : guard.changed ? 'Unsaved changes' : ''

  return (
    <main className="page">
      <Link className="back-link" to="/">
        <ArrowLeft className="icon icon--sm" aria-hidden="true" />
        Services
      </Link>
      <div className="page-head">
        <div className="page-head__titles">
          <h1 className="page-title">{title}</h1>
          {subtitle !== undefined && <p className="page-sub plain-text">{subtitle}</p>}
        </div>
      </div>

      <form noValidate onSubmit={onSubmit}>
        <div className="form-layout">
          <div className="form-main">
            <FormBanners failure={failure} onRetry={onSubmit} notFoundLinkRef={notFoundLinkRef}>
              {serverErrors.count > 0 && (
                <ErrorSummary
                  entries={serverErrors.entries.map(({ target, ...entry }) => ({
                    ...entry,
                    inputId: target === null ? null : fieldId(target),
                  }))}
                  onGoToField={focusById}
                  ref={summaryRef}
                />
              )}
            </FormBanners>

            <fieldset className="group">
              <legend className="group__legend">Service</legend>
              <div className="grid">
                <div className="field">
                  <label className="label" htmlFor={FIELD_IDS.name}>
                    Name
                  </label>
                  <input
                    className="input"
                    id={FIELD_IDS.name}
                    type="text"
                    placeholder="e.g. API gateway"
                    readOnly={saving}
                    aria-invalid={nameError ? 'true' : undefined}
                    aria-describedby={nameError ? errorId(FIELD_IDS.name) : undefined}
                    {...nameField}
                  />
                  {nameError && <FieldErrorText id={errorId(FIELD_IDS.name)} message={nameError} />}
                </div>
                <TypeField control={control} saving={saving} onChange={onTypeChange} />
              </div>
            </fieldset>

            {type === 'tcp' ? (
              <TcpGroup
                register={register}
                saving={saving}
                hostError={hostError}
                portError={portError}
                onEditHost={serverErrors.clearHost}
                onEditPort={() => {
                  clearErrors('port')
                  serverErrors.clearPort()
                }}
              />
            ) : (
              <>
                <fieldset className="group">
                  <legend className="group__legend">Request</legend>
                  <div className="stack">
                    <div className="url-row">
                      <div className="field">
                        <Controller
                          name="method"
                          control={control}
                          render={({ field }) => (
                            <Select
                              id={FIELD_IDS['check.method']}
                              label="Method"
                              value={field.value}
                              onValueChange={(next) => {
                                field.onChange(next)
                                serverErrors.clearField('check.method')
                              }}
                              options={METHOD_OPTIONS}
                              disabled={saving}
                              invalid={methodError !== null}
                              aria-describedby={methodError ? errorId(FIELD_IDS['check.method']) : undefined}
                            />
                          )}
                        />
                        {methodError && (
                          <FieldErrorText id={errorId(FIELD_IDS['check.method'])} message={methodError} />
                        )}
                      </div>
                      <div className="field">
                        <label className="label" htmlFor={FIELD_IDS['check.url']}>
                          URL
                        </label>
                        <input
                          className="input input--mono"
                          id={FIELD_IDS['check.url']}
                          type="url"
                          placeholder="https://"
                          readOnly={saving}
                          aria-invalid={urlError ? 'true' : undefined}
                          aria-describedby={urlError ? errorId(FIELD_IDS['check.url']) : URL_HINT_ID}
                          {...urlField}
                        />
                        {urlError ? (
                          <FieldErrorText id={errorId(FIELD_IDS['check.url'])} message={urlError} />
                        ) : (
                          <p className="hint" id={URL_HINT_ID}>
                            {URL_HINT}
                          </p>
                        )}
                      </div>
                    </div>
                    <RequestRowsGroup
                      control={control}
                      register={register}
                      saving={saving}
                      serverErrors={serverErrors}
                    />
                  </div>
                </fieldset>

                <HealthRulesGroup control={control} register={register} saving={saving} serverErrors={serverErrors} />

                <HttpsGroup
                  control={control}
                  register={register}
                  saving={saving}
                  daysError={daysError}
                  clearDaysError={() => clearErrors('cert_days')}
                  serverErrors={serverErrors}
                />
              </>
            )}

            <TimingGroup
              control={control}
              register={register}
              saving={saving}
              errors={timingErrors}
              groupError={serverErrors.groupError()}
              onEdit={(key) => {
                clearErrors(key)
                serverErrors.clearTiming(TIMING_FIELDS[key].path)
              }}
            />

            <AlertsGroup
              control={control}
              register={register}
              saving={saving}
              unhealthyError={serverErrors.errorFor('unhealthy_message')}
              recoveryError={serverErrors.errorFor('recovery_message')}
              clearField={serverErrors.clearField}
            />

            <PublicPageGroup control={control} saving={saving} />
          </div>
          <TestPanel state={test.state} saving={saving} onRun={() => void onRunTest()} buttonRef={testRef} />
        </div>

        <div className="form-foot">
          <span className="form-foot__status" aria-live="polite">
            {status}
          </span>
          <button type="button" className="btn" disabled={saving} onClick={() => void navigate('/')}>
            <span>Cancel</span>
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            ref={saveRef}
            disabled={saving || gone}
            aria-busy={saving ? 'true' : undefined}
          >
            {saving && <LoaderCircle className="icon icon--sm spinner" aria-hidden="true" />}
            <span>{saving ? SAVING : 'Save service'}</span>
          </button>
        </div>
      </form>

      <DiscardDialog
        open={guard.dialogOpen}
        body="The changes to this service will be lost."
        onKeep={guard.keepEditing}
        onDiscard={guard.discard}
      />
    </main>
  )
}
