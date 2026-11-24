import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { ServiceFormValues } from '../lib/formValues'
import { HealthRulesGroup } from './HealthRulesGroup'

type Errors = Partial<Record<string, string>>

function setup({ saving = false, errors = {} }: { saving?: boolean; errors?: Errors } = {}) {
  const serverErrors = {
    errorFor: vi.fn((target: string) => errors[target] ?? null),
    bareError: vi.fn((path: string) => errors[path] ?? null),
    clearField: vi.fn(),
    clearRulesList: vi.fn(),
    clearRuleRows: vi.fn(),
    clearBare: vi.fn(),
  }
  let values: () => ServiceFormValues = () => {
    throw new Error('not rendered')
  }
  function Harness() {
    const { control, register, getValues } = useForm<ServiceFormValues>({
      defaultValues: { json_rules: [], json_rule_mode: 'any' },
    })
    values = getValues
    return (
      <HealthRulesGroup
        control={control}
        register={register}
        saving={saving}
        serverErrors={serverErrors as unknown as Parameters<typeof HealthRulesGroup>[0]['serverErrors']}
      />
    )
  }
  render(<Harness />)
  return { user: userEvent.setup({ delay: null }), serverErrors, values: () => values() }
}

const addRule = () => screen.getByRole('button', { name: 'Add rule' })
const kindTrigger = (n: number) => screen.getByRole('combobox', { name: `Rule ${n} failing value type` })

describe('HealthRulesGroup', () => {
  it('shows the description, the empty line, Add rule, the path hint and the mode on Any rule matches (FR-44, FR-46, FR-47)', () => {
    setup()
    expect(document.querySelector('legend')).toHaveTextContent('Health rules (optional)')
    expect(
      screen.getByText(
        'The response is parsed as JSON. A rule matches when the value at the field path equals the failing value.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('No JSON rules. Any 2xx response counts as healthy.')).toBeInTheDocument()
    expect(addRule()).toBeEnabled()
    expect(screen.getByText('checks.db.status')).toHaveClass('mono')
    expect(document.querySelector('.rows__foot .hint')).toHaveTextContent('Path example: checks.db.status')
    expect(screen.getByRole('radiogroup', { name: 'Mark unhealthy when' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Any rule matches' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'All rules match' })).not.toBeChecked()
  })

  it('Add rule adds a row with the path focused, the kind on Text and a text input, and clears the list error', async () => {
    const { user, serverErrors } = setup()
    await user.click(addRule())
    expect(screen.getByLabelText('Rule 1 field path')).toHaveFocus()
    expect(kindTrigger(1)).toHaveTextContent('Text')
    expect(screen.getByLabelText('Rule 1 failing text')).toBeInTheDocument()
    expect(screen.queryByText('No JSON rules. Any 2xx response counts as healthy.')).not.toBeInTheDocument()
    expect(serverErrors.clearRulesList).toHaveBeenCalledTimes(1)
  })

  it('choosing true replaces the text input and keeps the path and the kind; choosing Text again shows what was typed', async () => {
    const { user, values } = setup()
    await user.click(addRule())
    await user.type(screen.getByLabelText('Rule 1 field path'), 'a.b')
    await user.type(screen.getByLabelText('Rule 1 failing text'), 'abc')
    await user.click(kindTrigger(1))
    await user.click(await screen.findByRole('option', { name: 'true' }))
    expect(screen.queryByLabelText('Rule 1 failing text')).not.toBeInTheDocument()
    expect(screen.getByText('Not needed for true/false')).toBeInTheDocument()
    expect(screen.getByLabelText('Rule 1 field path')).toHaveValue('a.b')
    expect(kindTrigger(1)).toHaveTextContent('true')
    expect(values().json_rules[0]).toEqual({ field: 'a.b', kind: 'true', text: 'abc' })
    await user.click(kindTrigger(1))
    await user.click(await screen.findByRole('option', { name: 'Text' }))
    expect(screen.getByLabelText('Rule 1 failing text')).toHaveValue('abc')
  })

  it('Remove moves focus to the next rule, the previous one when the last went, and Add rule when none is left', async () => {
    const { user } = setup()
    for (let i = 0; i < 3; i++) await user.click(addRule())
    await user.type(screen.getByLabelText('Rule 2 field path'), 'second')
    await user.click(screen.getByRole('button', { name: 'Remove rule 1' }))
    expect(screen.getByLabelText('Rule 1 field path')).toHaveValue('second')
    expect(screen.getByLabelText('Rule 1 field path')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Remove rule 2' }))
    expect(screen.getByLabelText('Rule 1 field path')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Remove rule 1' }))
    expect(addRule()).toHaveFocus()
    expect(screen.getByText('No JSON rules. Any 2xx response counts as healthy.')).toBeInTheDocument()
  })

  it('Remove clears every rule row error', async () => {
    const { user, serverErrors } = setup()
    await user.click(addRule())
    await user.click(screen.getByRole('button', { name: 'Remove rule 1' }))
    expect(serverErrors.clearRuleRows).toHaveBeenCalledTimes(1)
  })

  it('has no limit on the client: 21 rules can be added', () => {
    setup()
    for (let i = 0; i < 21; i++) fireEvent.click(addRule())
    expect(screen.getAllByLabelText(/^Rule \d+ field path$/)).toHaveLength(21)
    expect(addRule()).toBeEnabled()
  })

  it('shows a path error under the path input, and a failing value error under the kind, each linked and marked', async () => {
    const { user } = setup({
      errors: {
        'check.json_rules[0].field': 'Rule needs a field.',
        'check.json_rules[0].failing_value': 'Needs a <b>value</b>.',
      },
    })
    await user.click(addRule())
    const path = screen.getByLabelText('Rule 1 field path')
    expect(path).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById(path.getAttribute('aria-describedby') ?? '')).toHaveTextContent(
      'Rule needs a field.',
    )
    expect(kindTrigger(1)).toHaveAttribute('aria-invalid', 'true')
    const valueError = document.getElementById(kindTrigger(1).getAttribute('aria-describedby') ?? '')
    expect(valueError).toHaveTextContent('Needs a <b>value</b>.')
    expect(valueError?.querySelector('b')).toBeNull()
    const text = screen.getByLabelText('Rule 1 failing text')
    expect(text).not.toHaveAttribute('aria-invalid')
    expect(text).not.toHaveAttribute('aria-describedby')
  })

  it('shows the list error under the rows with nothing marked invalid', async () => {
    const { user } = setup({ errors: { 'check.json_rules': 'Too many rules.' } })
    await user.click(addRule())
    const message = screen.getByText('Too many rules.')
    expect(message.closest('.rows')).not.toBeNull()
    expect(within(message.closest('.rows') as HTMLElement).getByLabelText('Rule 1 field path')).not.toHaveAttribute(
      'aria-invalid',
    )
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
  })

  it('clears the mode error when the mode changes, and the failing value error when the kind or text changes', async () => {
    const { user, serverErrors } = setup()
    await user.click(screen.getByRole('radio', { name: 'All rules match' }))
    expect(serverErrors.clearBare).toHaveBeenCalledWith('check.json_rule_mode')
    await user.click(addRule())
    await user.type(screen.getByLabelText('Rule 1 failing text'), 'x')
    expect(serverErrors.clearField).toHaveBeenCalledWith('check.json_rules[0].failing_value')
    serverErrors.clearField.mockClear()
    await user.type(screen.getByLabelText('Rule 1 field path'), 'x')
    expect(serverErrors.clearField).toHaveBeenCalledWith('check.json_rules[0].field')
    expect(serverErrors.clearField).not.toHaveBeenCalledWith('check.json_rules[0].failing_value')
  })

  it('locks the inputs and disables the choices and buttons while saving', async () => {
    function Locked() {
      const { control, register } = useForm<ServiceFormValues>({
        defaultValues: { json_rules: [{ field: 'a', kind: 'text', text: 'b' }], json_rule_mode: 'any' },
      })
      return (
        <HealthRulesGroup
          control={control}
          register={register}
          saving
          serverErrors={
            {
              errorFor: () => null,
              bareError: () => null,
              clearField: vi.fn(),
              clearRulesList: vi.fn(),
              clearRuleRows: vi.fn(),
              clearBare: vi.fn(),
            } as unknown as Parameters<typeof HealthRulesGroup>[0]['serverErrors']
          }
        />
      )
    }
    render(<Locked />)
    expect(screen.getByLabelText('Rule 1 field path')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Rule 1 failing text')).toHaveAttribute('readonly')
    expect(kindTrigger(1)).toBeDisabled()
    expect(addRule()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove rule 1' })).toBeDisabled()
    for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveAttribute('aria-disabled', 'true')
  })
})
