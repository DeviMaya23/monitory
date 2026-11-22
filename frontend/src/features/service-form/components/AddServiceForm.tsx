import { useRef } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '../../../components/ui/useToast'
import { useCreateService } from '../hooks/useCreateService'
import { ADD_DEFAULT_VALUES } from '../lib/formValues'
import { ServiceForm } from './ServiceForm'

/** The Add service screen: `ServiceForm` saved through `createService` (FR-6). */
export function AddServiceForm() {
  const navigate = useNavigate()
  const toast = useToast()
  // The form is built after the hook; the ref hands the hook's callback the guard's `markSaved`.
  const markSavedRef = useRef<() => void>(() => {})
  const save = useCreateService((service) => {
    // First, in the same tick: the navigation below must not be asked about.
    markSavedRef.current()
    toast.show({ kind: 'success', message: `Service “${service.name}” added.` })
    void navigate('/')
  })
  return <ServiceForm title="Add service" initialValues={ADD_DEFAULT_VALUES} save={save} markSavedRef={markSavedRef} />
}
