import { Issue, type IssueSnapshot } from '../issue'
import type { Occurrence } from '../occurrence'

export function aggregateOccurrences(
  occurrences: readonly Occurrence[],
  existing: ReadonlyMap<string, IssueSnapshot>,
): Issue[] {
  const issues: Issue[] = []

  for (const [fingerprint, group] of groupByFingerprint(occurrences)) {
    const base = existing.get(fingerprint)
    let issue = base === undefined ? null : Issue.restore(base)

    for (const occurrence of group) {
      if (issue === null) {
        issue = Issue.open(occurrence)
      } else {
        issue.record(occurrence)
      }
    }

    if (issue !== null) {
      issues.push(issue)
    }
  }

  return issues
}

function groupByFingerprint(
  occurrences: readonly Occurrence[],
): Map<string, Occurrence[]> {
  const groups = new Map<string, Occurrence[]>()

  for (const occurrence of occurrences) {
    const group = groups.get(occurrence.fingerprint) ?? []
    group.push(occurrence)
    groups.set(occurrence.fingerprint, group)
  }

  return groups
}
