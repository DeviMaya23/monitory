import { generate } from 'selfsigned'

export interface Cert {
  key: string
  cert: string
}

export interface CertOptions {
  dnsNames?: string[]
  ipAddresses?: string[]
  notBefore?: Date
  notAfter: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

/** A self-signed EC P-256 certificate (SHA-256 signature). */
export async function makeCert(options: CertOptions): Promise<Cert> {
  const dnsNames = options.dnsNames ?? []
  const ipAddresses = options.ipAddresses ?? ['127.0.0.1']
  const altNames = [
    ...dnsNames.map((value) => ({ type: 2 as const, value })),
    ...ipAddresses.map((ip) => ({ type: 7 as const, ip })),
  ]
  const result = await generate([{ name: 'commonName', value: dnsNames[0] ?? ipAddresses[0] ?? 'e2e.test' }], {
    keyType: 'ec',
    curve: 'P-256',
    algorithm: 'sha256',
    notBeforeDate: options.notBefore ?? new Date(Date.now() - DAY_MS),
    notAfterDate: options.notAfter,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
    ],
  })
  return { key: result.private, cert: result.cert }
}

/** Valid for `daysLeft` whole days plus 12 hours: half a day of margin to the truncation. */
export function validCert(daysLeft: number): Promise<Cert> {
  return makeCert({ notAfter: new Date(Date.now() + daysLeft * DAY_MS + 12 * 60 * 60 * 1000) })
}

/** Expired a day ago, for 127.0.0.1. */
export function expiredCert(): Promise<Cert> {
  return makeCert({ notBefore: new Date(Date.now() - 30 * DAY_MS), notAfter: new Date(Date.now() - DAY_MS) })
}

/** Valid for 30 days, but only for the DNS name `other.test`. */
export function wrongHostCert(): Promise<Cert> {
  return makeCert({ dnsNames: ['other.test'], ipAddresses: [], notAfter: new Date(Date.now() + 30 * DAY_MS) })
}
