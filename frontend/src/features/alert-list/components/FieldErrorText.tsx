import { CircleAlert } from 'lucide-react'

/** The message of a field the server refused, under its input. */
export function FieldErrorText({ id, message }: { id: string; message: string }) {
  return (
    <p className="error-text" id={id}>
      <CircleAlert className="icon icon--sm" aria-hidden="true" />
      <span>{message}</span>
    </p>
  )
}
