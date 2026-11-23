import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useToast } from '../components/ui/useToast'
import { ApiError } from '../lib/api/ApiError'
import { setCsrfToken, setUnauthenticatedHandler } from '../lib/api/request'
import { getSession, signOut as signOutRequest, type SessionInfo } from '../lib/api/session'
import { SessionContext, type SessionState, type SessionValue } from './sessionContext'
import { csrfToast } from '../lib/requestNotAccepted'

const SESSION_KEY = ['session'] as const

async function fetchSession(): Promise<SessionInfo | null> {
  try {
    const info = await getSession()
    setCsrfToken(info.csrf_token)
    return info
  } catch (error) {
    if (error instanceof ApiError && error.code === 'unauthenticated') return null
    throw error
  }
}

/** Marks the session as ended and drops every other cached query (the next admin sees none of it). */
function endSession(queryClient: QueryClient): void {
  queryClient.setQueryData<SessionInfo | null>(SESSION_KEY, null)
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] })
}

/** Holds the one session query for the page load; everything else reads it through `useSession`. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [notice, setNotice] = useState(false)
  // Set before a sign-out request starts and cleared when it settles, so a 401 it
  // causes is not reported as a session that ended.
  const signOutInFlight = useRef(false)

  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: fetchSession,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retryOnMount: false,
  })

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      if (signOutInFlight.current) return
      if (!queryClient.getQueryData<SessionInfo | null>(SESSION_KEY)) return
      endSession(queryClient)
      setNotice(true)
    })
    return () => setUnauthenticatedHandler(null)
  }, [queryClient])

  const signOutMutation = useMutation({
    mutationFn: async () => {
      try {
        await signOutRequest()
      } catch (error) {
        if (!(error instanceof ApiError && error.code === 'unauthenticated')) throw error
      }
    },
    onSuccess: () => {
      setCsrfToken(null)
      endSession(queryClient)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'csrf_failed') {
        toast.show(csrfToast())
      } else {
        toast.show({ kind: 'error', message: 'Couldn’t sign out. Try again.' })
      }
    },
    onSettled: () => {
      signOutInFlight.current = false
    },
  })

  const data = query.data
  let state: SessionState
  if (data) state = 'signed-in'
  else if (data === null) state = 'signed-out'
  else if (!query.isFetched) state = 'checking'
  else state = 'unreachable'

  const value: SessionValue = {
    state,
    rechecking: state === 'unreachable' && query.isFetching,
    notice,
    signingOut: signOutMutation.isPending,
    signedIn: (info) => {
      setCsrfToken(info.csrf_token)
      queryClient.setQueryData<SessionInfo | null>(SESSION_KEY, info)
      setNotice(false)
    },
    signOut: () => {
      signOutInFlight.current = true
      signOutMutation.mutate()
    },
    recheck: () => {
      void query.refetch()
    },
  }

  return <SessionContext value={value}>{children}</SessionContext>
}
