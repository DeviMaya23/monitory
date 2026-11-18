/** The target name's limit: a fixed one (FR-87), unlike the address, URL and header limits. */
export const NAME_MAX_LENGTH = 50

/** The element id of each single field's control. */
export const FIELD_IDS = {
  name: 'target-name',
  type: 'target-type',
  address: 'target-address',
  url: 'target-url',
} as const

export type HeaderPart = 'name' | 'value'

/** The element id of a header row's name or value input (`index` from 0). */
export function headerInputId(index: number, part: HeaderPart): string {
  return `target-header-${index}-${part}`
}

/** What the screen takes for a server path with the label it shows. */
export type FieldInfo = {
  label: string
  /** The input the entry links to; null when the path has no input. */
  inputId: string | null
}

const HEADER_PATH = /^headers\[(\d+)\]\.(name|value)$/

/** The label of a server `field` path and the input it belongs to; a path with no input is its own label. */
export function fieldInfo(path: string): FieldInfo {
  switch (path) {
    case 'name':
      return { label: 'Name', inputId: FIELD_IDS.name }
    case 'address':
      return { label: 'Email address', inputId: FIELD_IDS.address }
    case 'url':
      return { label: 'Webhook URL', inputId: FIELD_IDS.url }
    case 'headers':
      return { label: 'Custom headers', inputId: null }
  }
  const header = HEADER_PATH.exec(path)
  if (header) {
    const index = Number(header[1])
    const part = header[2] as HeaderPart
    return { label: `Header ${index + 1} ${part}`, inputId: headerInputId(index, part) }
  }
  return { label: path, inputId: null }
}

/** The server path of a header row's input. */
export function headerPath(index: number, part: HeaderPart): string {
  return `headers[${index}].${part}`
}

/** Whether a path is the header rows' own error or one of a row's. */
export function isHeadersPath(path: string): boolean {
  return path === 'headers' || path.startsWith('headers[')
}

/** The title of the error summary for `count` errors. */
export function summaryTitle(count: number): string {
  return count === 1
    ? '1 field needs fixing before this can be saved.'
    : `${count} fields need fixing before this can be saved.`
}
