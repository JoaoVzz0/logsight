import type { Issue } from '../core/issue'
import type { Occurrence } from '../core/occurrence'

export interface IssueRepository {
  upsertBatch(occurrences: readonly Occurrence[]): Promise<void>

  findByFingerprint(fingerprint: string): Promise<Issue | null>
}
