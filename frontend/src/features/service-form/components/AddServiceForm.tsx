import { useEffect, useRef, type BaseSyntheticEvent } from 'react'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { Select } from '../../../components/ui/Select'
import { useToast } from '../../../components/ui/useToast'
import type { HttpMethod } from '../../../lib/api/services'
import { useCreateService, type ServiceFormValues } from '../hooks/useCreateService'
import { DEFAULT_METHOD, useLeaveGuard } from '../hooks/useLeaveGuard'
import { useServerErrors } from '../hooks/useServerErrors'
import { errorId, FIELD_IDS, focusField } from '../lib/fieldIds'
import { CERT_DAYS_PATH, DEFAULT_CERT_DAYS, startsWithHttps } from '../lib/certificateOptions'
import { DEFAULT_RULE_MODE } from '../lib/jsonRules'
import { DEFAULT_BODY_TYPE } from '../lib/requestRows'
import { DEFAULT_SERVICE_TYPE, HOST_PATH, PORT_PATH } from '../lib/serviceType'
import { TIMING_DEFAULTS, TIMING_FIELDS, TIMING_NAMES, type TimingName } from '../lib/timingGroup'
import { AlertsGroup } from './AlertsGroup'
import { DiscardDialog } from './DiscardDialog'
import { ErrorSummary } from './ErrorSummary'
import { FieldErrorText } from './FieldErrorText'
import { FormBanners } from './FormBanners'
import { HealthRulesGroup } from './HealthRulesGroup'
import { HttpsGroup } from './HttpsGroup'
import { RequestRowsGroup } from './RequestRowsGroup'
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
  return found.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
}

/** The Add service screen: name, method and URL of an HTTP(S) check, saved through `createService` (FR-6). */
export function AddServiceForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const {
    register,
    control,
    handleSubmit,
    clearErrors,
    setValue,
    formState: { errors: clientErrors },
  } = useForm<ServiceFormValues>({
    defaultValues: {
      name: '',
      type: DEFAULT_SERVICE_TYPE,
      host: '',
      port: '',
      method: DEFAULT_METHOD,
      url: '',
      query_params: [],
      headers: [],
      body_type: DEFAULT_BODY_TYPE,
      body_content: '',
      json_rules: [],
      json_rule_mode: DEFAULT_RULE_MODE,
      cert_enabled: false,
      cert_days: DEFAULT_CERT_DAYS,
      ignore_cert_errors: false,
      alerts_enabled: true,
      unhealthy_message: '',
      recovery_message: '',
      ...TIMING_DEFAULTS,
    },
    // A client error goes when its field is edited, not when it becomes valid.
    reValidateMode: 'onSubmit',
    // Groups that mount later register later: focus goes by the order of the page instead (see invalidInputs).
    shouldFocusError: false,
  })
  // The guard is built after this callback; the ref hands it the guard's `markSaved`.
  const markSavedRef = useRef<() => void>(() => {})
  const { saving, failure, submit, clearFailure } = useCreateService((service) => {
    // First, in the same tick: the navigation below must not be asked about.
    markSavedRef.current()
    toast.show({ kind: 'success', message: `Service “${service.name}” added.` })
    void navigate('/')
  })
  const serverErrors = useServerErrors(failure?.kind === 'field-errors' ? failure.errors : null)
  const [
    name,
    type,
    host,
    port,
    method,
    url,
    queryParams,
    headers,
    bodyType,
    bodyContent,
    rules,
    ruleMode,
    certEnabled,
    certDays,
    ignoreCertErrors,
    alertsEnabled,
    unhealthyMessage,
    recoveryMessage,
    ...timingTexts
  ] = useWatch({
    control,
    name: [
      'name',
      'type',
      'host',
      'port',
      'method',
      'url',
      'query_params',
      'headers',
      'body_type',
      'body_content',
      'json_rules',
      'json_rule_mode',
      'cert_enabled',
      'cert_days',
      'ignore_cert_errors',
      'alerts_enabled',
      'unhealthy_message',
      'recovery_message',
      ...TIMING_NAMES,
    ],
  })
  const timing = Object.fromEntries(TIMING_NAMES.map((key, i) => [key, timingTexts[i]])) as Record<TimingName, string>
  const guard = useLeaveGuard({
    name,
    type,
    host,
    port,
    method,
    url,
    queryRowCount: queryParams.length,
    headerRowCount: headers.length,
    bodyType,
    bodyContent,
    ruleCount: rules.length,
    ruleMode,
    certEnabled,
    certDays,
    ignoreCertErrors,
    alertsEnabled,
    unhealthyMessage,
    recoveryMessage,
    timing,
    saving,
  })
  useEffect(() => {
    markSavedRef.current = guard.markSaved
  })
  const summaryRef = useRef<HTMLDivElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    focusField('name')
  }, [])

  // Focus goes where the outcome of a save is.
  useEffect(() => {
    if (failure === null) return
    if (failure.kind === 'field-errors') summaryRef.current?.focus()
    else if (failure.kind === 'name-taken') focusField('name')
    else saveRef.current?.focus()
  }, [failure])

  const save = handleSubmit(submit, (errors) => invalidInputs(errors)[0]?.focus())
  /** A new attempt: what the last one left goes first, then the client checks, then the request. */
  const onSubmit = (event?: BaseSyntheticEvent) => {
    event?.preventDefault()
    if (saving) return
    clearFailure()
    void save(event)
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
          <h1 className="page-title">Add service</h1>
        </div>
      </div>

      <form noValidate onSubmit={onSubmit}>
        <div className="form-layout">
          <div className="form-main">
            <FormBanners failure={failure} onRetry={onSubmit}>
              {serverErrors.count > 0 && (
                <ErrorSummary entries={serverErrors.entries} onGoToField={focusField} ref={summaryRef} />
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
          </div>
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
            disabled={saving}
            aria-busy={saving ? 'true' : undefined}
          >
            {saving && <LoaderCircle className="icon icon--sm spinner" aria-hidden="true" />}
            <span>{saving ? SAVING : 'Save service'}</span>
          </button>
        </div>
      </form>

      <DiscardDialog open={guard.dialogOpen} onKeep={guard.keepEditing} onDiscard={guard.discard} />
    </main>
  )
}
