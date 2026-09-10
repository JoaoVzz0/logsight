import type { SelectOption } from '../../../shared/ui/select'

export const AUTO_DETECT = 'auto'

// The concrete values mirror the adapter registry on the backend
// (docs/adr/0004). An override the registry does not know is rejected there
// with 400, so this list is a convenience, not the contract.
export const SOURCE_TYPE_OPTIONS: readonly SelectOption[] = [
  { value: AUTO_DETECT, label: 'Detect automatically' },
  { value: 'gcp-cloud-logging', label: 'GCP Cloud Logging' },
  { value: 'aws-cloudwatch', label: 'AWS CloudWatch' },
  { value: 'json-lines', label: 'JSON Lines' },
]

export function toSourceTypeOverride(choice: string): string | null {
  return choice === AUTO_DETECT ? null : choice
}
