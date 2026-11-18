import { useEffect, useRef, type BaseSyntheticEvent } from 'react'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { Select } from '../../../components/ui/Select'
import { useToast } from '../../../components/ui/useToast'
import type { HttpMethod } from '../../../lib/api/services'
import { useCreateService, type ServiceFormValues } from '../hooks/useCreateService'
import { DEFAULT_METHOD, useLeaveGuard } from '../hooks/useLeaveGuard'
import { useServerErrors } from '../hooks/useServerErrors'
import { errorId, FIELD_IDS, focusField } from '../lib/fieldIds'
import { TIMING_DEFAULTS, TIMING_FIELDS, TIMING_NAMES, type TimingName } from '../lib/timingGroup'
import { AlertsGroup } from './AlertsGroup'
import { DiscardDialog } from './DiscardDialog'
import { ErrorSummary } from './ErrorSummary'
import { FieldErrorText } from './FieldErrorText'
import { FormBanners } from './FormBanners'
import { TimingGroup } from './TimingGroup'
import '../service-form.css'

// The methods the contract allows (FR-36), in the order the select lists them.
const METHODS: readonly HttpMethod[] = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH']
const METHOD_OPTIONS = METHODS.map((method) => ({ value: method, label: method }))

const SAVING = 'Saving…'
const NAME_TAKEN = 'Another service already uses this name (names ignore case).'
const URL_HINT_ID = 'service-url-hint'

const filled = (value: string) => value.trim() !== ''

/** The Add service screen: name, method and URL of an HTTP(S) check, saved through `createService` (FR-6). */
export function AddServiceForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const {
    register,
    control,
    handleSubmit,
    clearErrors,
    formState: { errors: clientErrors },
  } = useForm<ServiceFormValues>({
    defaultValues: {
      name: '',
      method: DEFAULT_METHOD,
      url: '',
      alerts_enabled: true,
      unhealthy_message: '',
      recovery_message: '',
      ...TIMING_DEFAULTS,
    },
    // A client error goes when its field is edited, not when it becomes valid.
    reValidateMode: 'onSubmit',
  })
  const { saving, saved, failure, submit, clearFailure } = useCreateService((service) => {
    toast.show({ kind: 'success', message: `Service “${service.name}” added.` })
    void navigate('/')
  })
  const serverErrors = useServerErrors(failure?.kind === 'field-errors' ? failure.errors : null)
  const [name, method, url, alertsEnabled, unhealthyMessage, recoveryMessage, ...timingTexts] = useWatch({
    control,
    name: ['name', 'method', 'url', 'alerts_enabled', 'unhealthy_message', 'recovery_message', ...TIMING_NAMES],
  })
  const timing = Object.fromEntries(TIMING_NAMES.map((key, i) => [key, timingTexts[i]])) as Record<TimingName, string>
  const guard = useLeaveGuard({
    name,
    method,
    url,
    alertsEnabled,
    unhealthyMessage,
    recoveryMessage,
    timing,
    saving,
    saved,
    onLeave: () => void navigate('/'),
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

  const save = handleSubmit(submit)
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
    validate: (value) => filled(value) || 'Enter a URL.',
    onChange: () => {
      clearErrors('url')
      serverErrors.clearField('check.url')
    },
  })

  const nameError =
    clientErrors.name?.message ?? (failure?.kind === 'name-taken' ? NAME_TAKEN : serverErrors.errorFor('name'))
  const methodError = serverErrors.errorFor('check.method')
  const urlError = clientErrors.url?.message ?? serverErrors.errorFor('check.url')
  const timingErrors = Object.fromEntries(
    TIMING_NAMES.map((key) => [key, clientErrors[key]?.message ?? serverErrors.errorFor(TIMING_FIELDS[key].path)]),
  ) as Record<TimingName, string | null>
  const status = saving ? SAVING : guard.changed ? 'Unsaved changes' : ''

  return (
    <main className="page">
      <Link className="back-link" to="/" {...guard.backLinkProps}>
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
              </div>
            </fieldset>

            <fieldset className="group">
              <legend className="group__legend">Request</legend>
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
                  {methodError && <FieldErrorText id={errorId(FIELD_IDS['check.method'])} message={methodError} />}
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
                      Starts with http:// or https://.
                    </p>
                  )}
                </div>
              </div>
            </fieldset>

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
          <button type="button" className="btn" disabled={saving} onClick={guard.cancel}>
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
