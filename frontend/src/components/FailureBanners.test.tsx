import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfBanner, LoadFailedBanner, UnexpectedBanner } from './FailureBanners'

afterEach(() => vi.unstubAllGlobals())

describe('CsrfBanner (NFR-8)', () => {
  it('shows its title and text, and Reload reloads the page once', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(<CsrfBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('The request wasn’t accepted.')).toBeInTheDocument()
    expect(screen.getByText('Reload the page and try again.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('UnexpectedBanner', () => {
  it('shows its texts, and Try again calls the handler', async () => {
    const onRetry = vi.fn()
    render(<UnexpectedBanner onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
    expect(
      screen.getByText('The server couldn’t be reached or returned an error. Your values are still here.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('LoadFailedBanner', () => {
  it('is a status with its texts, and Try again calls the handler', async () => {
    const onRetry = vi.fn()
    render(<LoadFailedBanner fetching={false} onRetry={onRetry} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
    expect(screen.getByText('The server couldn’t be reached or returned an error.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('disables Try again while a request is in flight', () => {
    render(<LoadFailedBanner fetching onRetry={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
  })
})
