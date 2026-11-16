import { Navigate } from 'react-router'
import { useSession } from '../app-shell/useSession'
import { SignInForm } from '../features/sign-in/components/SignInForm'

/** `/sign-in`: connects the session state to the sign-in form. */
export default function SignInPage() {
  const { state, rechecking, notice, signedIn, recheck } = useSession()

  if (state === 'checking') return null
  if (state === 'signed-in') return <Navigate to="/" replace />

  return (
    <SignInForm
      sessionEnded={notice}
      unreachable={state === 'unreachable'}
      rechecking={rechecking}
      onSignedIn={signedIn}
      onRecheck={recheck}
    />
  )
}
