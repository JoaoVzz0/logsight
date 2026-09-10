import { Issue, type IssueSnapshot } from '../core/issue'
import type { Occurrence } from '../core/occurrence'
import { aggregateOccurrences } from '../core/services/aggregate-occurrences'
import type { IssueRepository } from '../ports/issue-repository'

export class InMemoryIssueRepository implements IssueRepository {
  private readonly snapshots = new Map<string, IssueSnapshot>()

  async upsertBatch(occurrences: readonly Occurrence[]): Promise<void> {
    for (const issue of aggregateOccurrences(occurrences, this.snapshots)) {
      const snapshot = issue.snapshot
      this.snapshots.set(snapshot.fingerprint, snapshot)
    }
  }

  async findByFingerprint(fingerprint: string): Promise<Issue | null> {
    const snapshot = this.snapshots.get(fingerprint)
    return snapshot === undefined ? null : Issue.restore(snapshot)
  }
}
