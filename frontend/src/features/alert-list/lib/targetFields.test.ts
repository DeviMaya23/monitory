import { describe, expect, it } from 'vitest'
import { FIELD_IDS, NAME_MAX_LENGTH, fieldInfo, headerInputId, headerPath, summaryTitle } from './targetFields'

describe('fieldInfo', () => {
  it('turns header paths into one-based labels and the row inputs', () => {
    expect(fieldInfo('headers[0].name')).toEqual({ label: 'Header 1 name', inputId: headerInputId(0, 'name') })
    expect(fieldInfo('headers[2].value')).toEqual({ label: 'Header 3 value', inputId: headerInputId(2, 'value') })
  })

  it('labels the single fields and gives them their inputs', () => {
    expect(fieldInfo('name')).toEqual({ label: 'Name', inputId: FIELD_IDS.name })
    expect(fieldInfo('address')).toEqual({ label: 'Email address', inputId: FIELD_IDS.address })
    expect(fieldInfo('url')).toEqual({ label: 'Webhook URL', inputId: FIELD_IDS.url })
  })

  it('has no input for type, the bare headers path or an unknown path', () => {
    expect(fieldInfo('type').inputId).toBeNull()
    expect(fieldInfo('type').label).toBe('type')
    expect(fieldInfo('headers')).toEqual({ label: 'Custom headers', inputId: null })
    expect(fieldInfo('headers[x].name')).toEqual({ label: 'headers[x].name', inputId: null })
    expect(fieldInfo('something').inputId).toBeNull()
  })
})

describe('the rest', () => {
  it('fixes the name limit at 50', () => {
    expect(NAME_MAX_LENGTH).toBe(50)
  })
  it('builds the server path of a header input', () => {
    expect(headerPath(1, 'value')).toBe('headers[1].value')
  })
  it('words the summary title for one and for many', () => {
    expect(summaryTitle(1)).toBe('1 field needs fixing before this can be saved.')
    expect(summaryTitle(3)).toBe('3 fields need fixing before this can be saved.')
  })
})
