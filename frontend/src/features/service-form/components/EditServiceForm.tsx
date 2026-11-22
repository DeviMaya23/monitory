import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '../../../components/ui/useToast'
import type { Service } from '../../../lib/api/services'
import { useUpdateService } from '../hooks/useUpdateService'
import { toFormValues } from '../lib/serviceInput'
import { ServiceForm } from './ServiceForm'

/**
 * The Edit service screen for a loaded service (FR-7). The form starts at the values of `service`
 * as it was when this mounted; a later answer never rewrites it (the page mounts it with a key).
 */
export function EditServiceForm({ service }: { service: Service }) {
  const navigate = useNavigate()
  const toast = useToast()
  const markSavedRef = useRef<() => void>(() => {})
  const save = useUpdateService(service, (saved) => {
    markSavedRef.current()
    toast.show({ kind: 'success', message: `Service “${saved.name}” saved.` })
    void navigate('/')
  })
  // Read once: the form's start is the first answer, whatever the cache holds later.
  const [initialValues] = useState(() => toFormValues(service))
  return (
    <ServiceForm
      title="Edit service"
      subtitle={initialValues.name}
      initialValues={initialValues}
      save={save}
      markSavedRef={markSavedRef}
    />
  )
}
