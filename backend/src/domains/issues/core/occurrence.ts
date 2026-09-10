export type Occurrence = {
  readonly fingerprint: string
  readonly message: string
  readonly severityNumber: number | null
  readonly serviceName: string | null
  readonly occurredAt: Date
}
