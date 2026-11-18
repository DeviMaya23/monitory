import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_VALUES, type TargetFormValues } from '../lib/targetForm'
import { useTargetLeaveGuard } from './useTargetLeaveGuard'

function Harness({ saving = false, onLeave }: { saving?: boolean; onLeave: () => void }) {
  const [values, setValues] = useState<TargetFormValues>(EMPTY_VALUES)
  const guard = useTargetLeaveGuard({ initial: EMPTY_VALUES, values, saving, onLeave })
  return (
    <div>
      <p data-testid="state">{`${guard.changed ? 'changed' : 'unchanged'} ${guard.questionOpen ? 'asking' : 'quiet'}`}</p>
      <button onClick={() => setValues({ ...values, url: 'x' })}>type url</button>
      <button onClick={() => setValues({ ...values, headers: [{ name: '', value: '' }] })}>add row</button>
      <button onClick={() => setValues(EMPTY_VALUES)}>reset</button>
      <button onClick={guard.requestLeave}>leave</button>
      <button onClick={guard.keepEditing}>keep</button>
      <button onClick={guard.discard}>discard</button>
    </div>
  )
}

const state = (getBy: (id: string) => HTMLElement) => getBy('state').textContent

afterEach(() => vi.restoreAllMocks())

describe('useTargetLeaveGuard', () => {
  it('is unchanged at the start, changed for the inactive type’s field and for a row, unchanged when values return', async () => {
    const view = render(<Harness onLeave={vi.fn()} />)
    const user = userEvent.setup()
    expect(state(view.getByTestId)).toBe('unchanged quiet')
    await user.click(view.getByText('type url'))
    expect(state(view.getByTestId)).toBe('changed quiet')
    await user.click(view.getByText('reset'))
    await user.click(view.getByText('add row'))
    expect(state(view.getByTestId)).toBe('changed quiet')
    await user.click(view.getByText('reset'))
    expect(state(view.getByTestId)).toBe('unchanged quiet')
  })

  it('leaves at once when unchanged, asks when changed, and keep or discard answer it', async () => {
    const onLeave = vi.fn()
    const view = render(<Harness onLeave={onLeave} />)
    const user = userEvent.setup()
    await user.click(view.getByText('leave'))
    expect(onLeave).toHaveBeenCalledTimes(1)
    await user.click(view.getByText('type url'))
    await user.click(view.getByText('leave'))
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(state(view.getByTestId)).toBe('changed asking')
    await user.click(view.getByText('keep'))
    expect(state(view.getByTestId)).toBe('changed quiet')
    await user.click(view.getByText('leave'))
    await user.click(view.getByText('discard'))
    expect(onLeave).toHaveBeenCalledTimes(2)
    expect(state(view.getByTestId)).toBe('changed quiet')
  })

  it('does nothing while saving', async () => {
    const onLeave = vi.fn()
    const view = render(<Harness saving onLeave={onLeave} />)
    await userEvent.setup().click(view.getByText('leave'))
    expect(onLeave).not.toHaveBeenCalled()
  })

  it('adds the beforeunload listener only while changed and not saving', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const count = (spy: typeof add) => spy.mock.calls.filter(([type]) => type === 'beforeunload').length
    const view = render(<Harness onLeave={vi.fn()} />)
    const user = userEvent.setup()
    expect(count(add)).toBe(0)
    await user.click(view.getByText('type url'))
    expect(count(add)).toBe(1)
    await user.click(view.getByText('reset'))
    expect(count(remove)).toBe(1)
    await user.click(view.getByText('type url'))
    expect(count(add)).toBe(2)
    view.rerender(<Harness saving onLeave={vi.fn()} />)
    expect(count(remove)).toBe(2)
    view.unmount()
    expect(count(add)).toBe(2)
  })
})
