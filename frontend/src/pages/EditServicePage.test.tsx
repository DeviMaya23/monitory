import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Outlet } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/ui/Toast'
import { getService, servicesQueryKey, type Service } from '../lib/api/services'
import { makeService, problem } from '../test/fixtures'
import { renderRoutes } from '../test/renderRoutes'
import EditServicePage from './EditServicePage'

vi.mock('../lib/api/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api/services')>()),
  getService: vi.fn(),
}))

function setup(client = new QueryClient()) {
  const { router } = renderRoutes(
    [
      {
        element: (
          <ToastProvider>
            <Outlet />
          </ToastProvider>
        ),
        children: [
          { path: '/', element: <p>dashboard marker</p> },
          { path: '/services/:serviceId', element: <EditServicePage /> },
        ],
      },
    ],
    { initialEntries: ['/services/0190-abc'], client },
  )
  return { client, router, user: userEvent.setup() }
}

function pending() {
  let resolve: (service: Service) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  vi.mocked(getService).mockReturnValueOnce(
    new Promise<Service>((res, rej) => {
      resolve = res
      reject = rej
    }),
  )
  return { resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('EditServicePage states', () => {
  it('loading: shows the back link, the heading and the status, no form, and asks for the address id', () => {
    pending()
    setup()
    expect(screen.getByRole('link', { name: 'Services' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('heading', { level: 1, name: 'Edit service' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading service…')
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save service' })).not.toBeInTheDocument()
    expect(document.querySelector('.page-sub')).toBeNull()
    expect(getService).toHaveBeenCalledWith('0190-abc')
  })

  it('load failed (a 500): shows the warning banner and no form; Try again is disabled in flight and a 200 shows the form', async () => {
    vi.mocked(getService).mockRejectedValueOnce(problem(500, 'internal_error'))
    const { user } = setup()
    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument()
    expect(screen.getByText('The server couldn’t be reached or returned an error.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('banner--warn')
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    const retry = pending()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled())
    retry.resolve(makeService({ id: '0190-abc', name: 'Late one' }))
    expect(await screen.findByLabelText('Name')).toHaveValue('Late one')
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
  })

  it('load failed again on a retry keeps the banner', async () => {
    vi.mocked(getService).mockRejectedValue(new TypeError('Failed to fetch'))
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(getService).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeEnabled()
  })

  it('not found: replaces the page, drops the list entry, and focuses the heading; Back to services goes to /', async () => {
    vi.mocked(getService).mockRejectedValue(problem(404, 'not_found'))
    const client = new QueryClient()
    client.setQueryData(servicesQueryKey, [makeService()])
    const { user, router } = setup(client)
    const title = await screen.findByRole('heading', { level: 2, name: 'This service no longer exists' })
    expect(screen.getByText('It was deleted, so it can’t be edited.')).toBeInTheDocument()
    expect(document.activeElement).toBe(title)
    expect(screen.queryByRole('link', { name: 'Services' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(client.getQueryData(servicesQueryKey)).toBeUndefined()
    await user.click(screen.getByRole('link', { name: 'Back to services' }))
    expect(router.state.location.pathname).toBe('/')
  })

  it('session ended: a 401 renders no content, no banner and no form', async () => {
    vi.mocked(getService).mockRejectedValue(problem(401, 'unauthenticated'))
    setup()
    await waitFor(() => expect(getService).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(document.querySelector('main')).toBeNull()
  })
})
