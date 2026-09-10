import { DomainError } from '../../../shared/errors/domain-error'

import type { Occurrence } from './occurrence'

export type IssueStatus = 'unresolved' | 'resolved' | 'ignored'

export type IssueSnapshot = {
  readonly fingerprint: string
  readonly sampleMessage: string
  readonly severityNumber: number | null
  readonly firstSeen: Date
  readonly lastSeen: Date
  readonly eventCount: number
  readonly affectedServices: readonly string[]
  readonly status: IssueStatus
  readonly resolvedAt: Date | null
  readonly regression: boolean
}

export class IllegalIssueTransitionError extends DomainError {
  readonly code = 'issue-illegal-transition'

  constructor(from: IssueStatus, to: IssueStatus) {
    super(`an issue cannot move from ${from} to ${to}`)
  }
}

type MutableState = {
  fingerprint: string
  sampleMessage: string
  severityNumber: number | null
  firstSeen: Date
  lastSeen: Date
  eventCount: number
  affectedServices: string[]
  status: IssueStatus
  resolvedAt: Date | null
  regression: boolean
}

export class Issue {
  private constructor(private readonly state: MutableState) {}

  static open(occurrence: Occurrence): Issue {
    return new Issue({
      fingerprint: occurrence.fingerprint,
      sampleMessage: occurrence.message,
      severityNumber: occurrence.severityNumber,
      firstSeen: occurrence.occurredAt,
      lastSeen: occurrence.occurredAt,
      eventCount: 1,
      affectedServices:
        occurrence.serviceName === null ? [] : [occurrence.serviceName],
      status: 'unresolved',
      resolvedAt: null,
      regression: false,
    })
  }

  static restore(snapshot: IssueSnapshot): Issue {
    return new Issue({
      fingerprint: snapshot.fingerprint,
      sampleMessage: snapshot.sampleMessage,
      severityNumber: snapshot.severityNumber,
      firstSeen: snapshot.firstSeen,
      lastSeen: snapshot.lastSeen,
      eventCount: snapshot.eventCount,
      affectedServices: [...snapshot.affectedServices],
      status: snapshot.status,
      resolvedAt: snapshot.resolvedAt,
      regression: snapshot.regression,
    })
  }

  record(occurrence: Occurrence): void {
    this.state.eventCount += 1

    if (occurrence.occurredAt > this.state.lastSeen) {
      this.state.lastSeen = occurrence.occurredAt
    }

    this.addService(occurrence.serviceName)

    if (this.state.status === 'resolved') {
      this.state.status = 'unresolved'
      this.state.resolvedAt = null
      this.state.regression = true
    }
  }

  resolve(at: Date): void {
    if (this.state.status !== 'unresolved') {
      throw new IllegalIssueTransitionError(this.state.status, 'resolved')
    }

    this.state.status = 'resolved'
    this.state.resolvedAt = at
    this.state.regression = false
  }

  ignore(): void {
    this.state.status = 'ignored'
  }

  reopen(): void {
    if (this.state.status !== 'ignored') {
      throw new IllegalIssueTransitionError(this.state.status, 'unresolved')
    }

    this.state.status = 'unresolved'
    this.state.resolvedAt = null
  }

  get snapshot(): IssueSnapshot {
    return Object.freeze({
      fingerprint: this.state.fingerprint,
      sampleMessage: this.state.sampleMessage,
      severityNumber: this.state.severityNumber,
      firstSeen: this.state.firstSeen,
      lastSeen: this.state.lastSeen,
      eventCount: this.state.eventCount,
      affectedServices: Object.freeze([...this.state.affectedServices]),
      status: this.state.status,
      resolvedAt: this.state.resolvedAt,
      regression: this.state.regression,
    })
  }

  private addService(serviceName: string | null): void {
    if (serviceName === null) {
      return
    }

    if (!this.state.affectedServices.includes(serviceName)) {
      this.state.affectedServices.push(serviceName)
    }
  }
}
