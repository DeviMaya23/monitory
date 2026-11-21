import { describe, expect, it } from 'vitest'
import { readWholeNumber } from './timingGroup'
import { DEFAULT_SERVICE_TYPE, tcpCheck, TYPE_OPTIONS } from './serviceType'

describe('tcpCheck', () => {
  it('sends the host as typed and the port as an integer, and nothing else', () => {
    const check = tcpCheck('db.internal', readWholeNumber(' 5432 ') as number)
    expect(check).toStrictEqual({ type: 'tcp', host: 'db.internal', port: 5432 })
  })

  it('does not trim the host', () => {
    expect(tcpCheck(' db ', 1).host).toBe(' db ')
  })
})

describe('the type options', () => {
  it('start at HTTP(S) and offer the two types in order', () => {
    expect(DEFAULT_SERVICE_TYPE).toBe('http')
    expect(TYPE_OPTIONS).toEqual([
      { value: 'http', text: 'HTTP(S)' },
      { value: 'tcp', text: 'TCP port' },
    ])
  })
})
