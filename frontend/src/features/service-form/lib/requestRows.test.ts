import { describe, expect, it } from 'vitest'
import {
  BODY_OPTIONS,
  listPath,
  parseRowPath,
  requestParts,
  rowInputId,
  rowLabel,
  rowPath,
  type RowList,
  type RowPart,
} from './requestRows'

const NONE = { body_type: 'none', body_content: '' } as const

describe('ids, paths and labels of a row', () => {
  it.each([
    ['query_params', 0, 'name', 'service-query-0-name', 'check.query_params[0].name', 'Query parameter 1 name'],
    ['query_params', 2, 'value', 'service-query-2-value', 'check.query_params[2].value', 'Query parameter 3 value'],
    ['headers', 0, 'name', 'service-header-0-name', 'check.headers[0].name', 'Header 1 name'],
    ['headers', 11, 'value', 'service-header-11-value', 'check.headers[11].value', 'Header 12 value'],
  ] as [RowList, number, RowPart, string, string, string][])('%s row %d %s', (list, index, part, id, path, label) => {
    expect(rowInputId(list, index, part)).toBe(id)
    expect(rowPath(list, index, part)).toBe(path)
    expect(rowLabel(list, index, part)).toBe(label)
    expect(parseRowPath(path)).toEqual({ list, index, part })
  })

  it('names the list paths', () => {
    expect(listPath('query_params')).toBe('check.query_params')
    expect(listPath('headers')).toBe('check.headers')
  })

  it.each([
    'check.headers',
    'check.headers[].name',
    'check.headers[01].name',
    'check.headers[-1].name',
    'check.headers[1].other',
    'check.headers[1].name.x',
    'x.check.headers[1].name',
    'check.body.content',
  ])('does not read %j as a row path', (path) => {
    expect(parseRowPath(path)).toBeNull()
  })
})

describe('body options', () => {
  it('are None, JSON, Plain text and Form (URL-encoded)', () => {
    expect(BODY_OPTIONS).toEqual([
      { value: 'none', text: 'None' },
      { value: 'json', text: 'JSON' },
      { value: 'text', text: 'Plain text' },
      { value: 'form', text: 'Form (URL-encoded)' },
    ])
  })
})

describe('requestParts (FR-35, FR-37)', () => {
  it('sends both lists empty, and no body, with nothing set', () => {
    const parts = requestParts({ query_params: [], headers: [], ...NONE })
    expect(parts).toStrictEqual({ query_params: [], headers: [] })
    expect('body' in parts).toBe(false)
  })

  it('sends the rows in order, with the texts untrimmed and an empty row as it is', () => {
    expect(
      requestParts({
        query_params: [
          { name: ' a ', value: ' 1 ' },
          { name: '', value: '' },
        ],
        headers: [{ name: 'X-Key', value: 'a very long value '.repeat(300) }],
        ...NONE,
      }),
    ).toStrictEqual({
      query_params: [
        { name: ' a ', value: ' 1 ' },
        { name: '', value: '' },
      ],
      headers: [{ name: 'X-Key', value: 'a very long value '.repeat(300) }],
    })
  })

  it('sends markup, quotes, a 5 000-character header value, a 70 000-character body and 21 rows as typed', () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ name: `n${i}`, value: `v${i}` }))
    const odd = { name: '<b>"a" \'b\'</b>', value: ' x  y ' }
    const long = 'v'.repeat(5000)
    const body = 'b'.repeat(70_000)
    const parts = requestParts({
      query_params: [...rows, odd],
      headers: [{ name: 'X-Long', value: long }],
      body_type: 'text',
      body_content: body,
    })
    expect(parts.query_params).toHaveLength(22)
    expect(parts.query_params[20]).toStrictEqual({ name: 'n20', value: 'v20' })
    expect(parts.query_params[21]).toStrictEqual(odd)
    expect(parts.headers[0].value).toBe(long)
    expect(parts.body).toStrictEqual({ type: 'text', content: body })
  })

  it.each(['json', 'text', 'form'] as const)('sends the body as typed for %s', (type) => {
    expect(requestParts({ query_params: [], headers: [], body_type: type, body_content: ' {"a":1}\n' })).toStrictEqual({
      query_params: [],
      headers: [],
      body: { type, content: ' {"a":1}\n' },
    })
  })

  it('sends an empty text for a typed body, and no body key at all for none even with text', () => {
    expect(requestParts({ query_params: [], headers: [], body_type: 'json', body_content: '' }).body).toEqual({
      type: 'json',
      content: '',
    })
    const none = requestParts({ query_params: [], headers: [], body_type: 'none', body_content: 'typed' })
    expect('body' in none).toBe(false)
  })
})
