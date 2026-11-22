import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'

type Options = Pick<NonNullable<Parameters<typeof createMemoryRouter>[1]>, 'initialEntries' | 'initialIndex'> & {
  /** The query client to use; a new one when left out. */
  client?: QueryClient
}

/**
 * Renders `routes` in a memory data router inside a query client, and returns both, so a test
 * can navigate (`router.navigate(-1)`), read the location and read the cache. It adds no
 * `ToastProvider`: the routes bring their own.
 */
export function renderRoutes(routes: RouteObject[], { initialEntries, initialIndex, client }: Options = {}) {
  const queryClient = client ?? new QueryClient()
  const router = createMemoryRouter(routes, { initialEntries, initialIndex })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, client: queryClient }
}
