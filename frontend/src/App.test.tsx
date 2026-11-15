import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App routes', () => {
  it.each([
    ['/', 'dashboard'],
    ['/sign-in', 'sign-in'],
    ['/services/new', 'add service'],
    ['/services/0190-abc', 'edit service'],
    ['/services/0190-abc/alerts', 'alert list'],
    ['/status', 'public status'],
    ['/nothing/here', 'requested'],
  ])('%s is the %s page', (path, page) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByText(`The ${page} page is not built yet.`)).toBeInTheDocument()
  })
})
