import type { ServiceFormValues } from '../hooks/useCreateService'

/** The two lists of name and value rows in the Request group. */
export type RowList = 'query_params' | 'headers'
export type RowPart = 'name' | 'value'

export type BodyType = 'none' | 'json' | 'text' | 'form'

/** The words and ids of each list, defined once. */
type RowWords = {
  idPrefix: string
  legend: string
  emptyText: string
  addLabel: string
  itemName: string
  hint?: string
}

export const ROW_LISTS: Record<RowList, RowWords> = {
  query_params: {
    idPrefix: 'service-query',
    legend: 'Query parameters',
    emptyText: 'No query parameters.',
    addLabel: 'Add parameter',
    itemName: 'Query parameter',
  },
  headers: {
    idPrefix: 'service-header',
    legend: 'Headers',
    emptyText: 'No headers.',
    addLabel: 'Add header',
    itemName: 'Header',
    hint: 'Values are shown in full.',
  },
}

export const ROW_LIST_NAMES: readonly RowList[] = ['query_params', 'headers']

/** The element id of a row's input. */
export const rowInputId = (list: RowList, index: number, part: RowPart) =>
  `${ROW_LISTS[list].idPrefix}-${index}-${part}`

/** The server `field` path of a list as a whole. */
export const listPath = (list: RowList) => `check.${list}` as const

/** The server `field` path of a row's input. */
export const rowPath = (list: RowList, index: number, part: RowPart) => `check.${list}[${index}].${part}` as const

const ROW_PATH = /^check\.(query_params|headers)\[(0|[1-9]\d*)\]\.(name|value)$/

/** The list, row and part a server path names; null when it is not a row path. */
export function parseRowPath(path: string): { list: RowList; index: number; part: RowPart } | null {
  const match = ROW_PATH.exec(path)
  if (match === null) return null
  return {
    list: match[1] as RowList,
    index: Number(match[2]),
    part: match[3] as RowPart,
  }
}

/** The label of a row's input, as the summary and the input's accessible name show it ("Header 2 value"). */
export const rowLabel = (list: RowList, index: number, part: RowPart) =>
  `${ROW_LISTS[list].itemName} ${index + 1} ${part}`

export const BODY_TEXT = {
  typeLabel: 'Body type',
  contentLabel: 'Body',
  hint: 'Sent as entered.',
} as const

/** The server paths of the body's two fields. */
export const BODY_TYPE_PATH = 'check.body.type'
export const BODY_CONTENT_PATH = 'check.body.content'

export const BODY_TYPE_ID = 'service-body-type'
export const BODY_CONTENT_ID = 'service-body-content'
export const BODY_HINT_ID = 'service-body-hint'

export const DEFAULT_BODY_TYPE: BodyType = 'none'

export const BODY_OPTIONS: readonly { value: BodyType; text: string }[] = [
  { value: 'none', text: 'None' },
  { value: 'json', text: 'JSON' },
  { value: 'text', text: 'Plain text' },
  { value: 'form', text: 'Form (URL-encoded)' },
]

type RequestParts = Pick<ServiceFormValues, 'query_params' | 'headers' | 'body_type' | 'body_content'>

/**
 * The request's rows and body as `createService` takes them (FR-35, FR-37): both lists always,
 * in row order, as typed; the body only when its type is not `none`. The server trims and refuses.
 */
export function requestParts({ query_params, headers, body_type, body_content }: RequestParts) {
  return {
    query_params: query_params.map(({ name, value }) => ({ name, value })),
    headers: headers.map(({ name, value }) => ({ name, value })),
    ...(body_type === 'none' ? {} : { body: { type: body_type, content: body_content } }),
  }
}
