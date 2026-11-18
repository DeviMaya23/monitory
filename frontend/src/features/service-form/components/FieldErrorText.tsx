import { CircleAlert } from 'lucide-react'

/** A field's error: the icon and the message as text (NFR-7). */
export function FieldErrorText({ id, message }: { id: string; message: string }) {
  return (
    <p className="error-text" id={id}>
      <CircleAlert className="icon icon--sm" aria-hidden="true" />
      <span>{message}</span>
    </p>
  )
}
