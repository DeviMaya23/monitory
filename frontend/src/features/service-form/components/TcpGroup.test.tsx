import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { ServiceFormValues } from '../lib/formValues'
import { TcpGroup } from './TcpGroup'

type Props = {
  saving?: boolean
  hostError?: string | null
  portError?: string | null
  onEditHost?: () => void
  onEditPort?: () => void
}

function Harness({
  saving = false,
  hostError = null,
  portError = null,
  onEditHost = vi.fn(),
  onEditPort = vi.fn(),
}: Props) {
  const { register, handleSubmit, formState } = useForm<ServiceFormValues>({
    defaultValues: { type: 'tcp', host: '', port: '' },
  })
  return (
    <form onSubmit={(event) => void handleSubmit(() => {})(event)}>
      <TcpGroup
        register={register}
        saving={saving}
        hostError={hostError}
        portError={portError}
        onEditHost={onEditHost}
        onEditPort={onEditPort}
      />
      <p data-testid="port-error">{formState.errors.port?.message}</p>
      <button type="submit">go</button>
    </form>
  )
}

describe('TcpGroup', () => {
  it('shows an empty Host and Port, with the hint on the port', () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'TCP port' })).toBeInTheDocument()
    expect(screen.getByLabelText('Host')).toHaveValue('')
    expect(screen.getByLabelText('Port')).toHaveAccessibleDescription('1 to 65535')
  })

  it('replaces the hint with the error, and marks only that input invalid', () => {
    render(<Harness portError="Must be between 1 and 65535." hostError="Enter a host." />)
    expect(screen.getByLabelText('Port')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Port')).toHaveAccessibleDescription('Must be between 1 and 65535.')
    expect(screen.getByLabelText('Host')).toHaveAccessibleDescription('Enter a host.')
    expect(screen.queryByText('1 to 65535')).toBeNull()
  })

  it('reports an edit of each input', async () => {
    const onEditHost = vi.fn()
    const onEditPort = vi.fn()
    render(<Harness onEditHost={onEditHost} onEditPort={onEditPort} />)
    await userEvent.type(screen.getByLabelText('Host'), 'a')
    expect(onEditHost).toHaveBeenCalledTimes(1)
    expect(onEditPort).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Port'), '1')
    expect(onEditPort).toHaveBeenCalledTimes(1)
  })

  it.each(['', 'abc', '1.5', '-3'])('refuses the port %j on submit', async (port) => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: port } })
    fireEvent.click(screen.getByText('go'))
    expect(await screen.findByText('Enter a whole number.')).toBeInTheDocument()
  })

  it.each(['0', '70000', ' 5432 '])('does not refuse the port %j', async (port) => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: port } })
    fireEvent.click(screen.getByText('go'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByTestId('port-error')).toBeEmptyDOMElement()
  })

  it('makes both inputs read-only while saving', () => {
    render(<Harness saving />)
    expect(screen.getByLabelText('Host')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Port')).toHaveAttribute('readonly')
  })
})
