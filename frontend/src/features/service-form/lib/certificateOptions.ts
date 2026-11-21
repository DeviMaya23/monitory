import type { ServiceFormValues } from '../hooks/useCreateService'
import { readWholeNumber } from './timingGroup'

/** Where the minimum days start: the design board's value (the contract has no default). */
export const DEFAULT_CERT_DAYS = '14'

export const HTTPS_TEXT = {
  legend: 'HTTPS',
  note: 'Available only when the URL starts with https://.',
  expiryLabel: 'Check certificate expiry',
  expiryHint: 'Mark unhealthy when the certificate expires within the minimum days.',
  daysLabel: 'Minimum days left',
  daysAddon: 'days',
  ignoreLabel: 'Ignore certificate errors',
  ignoreHint: 'Accept invalid or self-signed certificates.',
} as const

export const CERT_DAYS_ID = 'service-cert-days'
export const HTTPS_NOTE_ID = 'service-https-note'
/** The ids of the messages under the two switches (a switch has no input to describe). */
export const CERT_ENABLED_ERROR_ID = 'service-cert-enabled-error'
export const IGNORE_CERT_ERROR_ID = 'service-cert-ignore-error'

/** The server `field` paths. */
export const CERT_ENABLED_PATH = 'check.certificate_check.enabled'
export const CERT_DAYS_PATH = 'check.certificate_check.min_days_left'
export const IGNORE_CERT_PATH = 'check.ignore_certificate_errors'

const HTTPS_PREFIX = 'https://'

/** Whether the URL, trimmed, begins with `https://` in any letter case (as the server's check does). */
export function startsWithHttps(url: string): boolean {
  return url.trim().slice(0, HTTPS_PREFIX.length).toLowerCase() === HTTPS_PREFIX
}

type CertParts = Pick<ServiceFormValues, 'cert_enabled' | 'cert_days' | 'ignore_cert_errors'>

/**
 * The certificate options as `createService` takes them (FR-34, FR-50, FR-64): the days only
 * while the check is on. The client has already made sure the text is a whole number.
 */
export function certificateParts({ cert_enabled, cert_days, ignore_cert_errors }: CertParts) {
  const days = readWholeNumber(cert_days)
  return {
    certificate_check: !cert_enabled
      ? { enabled: false }
      : days === null
        ? { enabled: true }
        : { enabled: true, min_days_left: days },
    ignore_certificate_errors: ignore_cert_errors,
  }
}
