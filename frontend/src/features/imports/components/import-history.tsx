import type { ReactNode } from 'react'

import { formatAbsoluteTime, formatRelativeTime } from '../../../shared/lib/relative-time'
import { Card } from '../../../shared/ui/card'
import type { ImportSummary } from '../api/list-imports'
import { useImportHistory } from '../hooks/use-import-history'
import { formatCount } from '../model/progress'

import { ImportStatusBadge } from './import-status-badge'
import {
  ImportHistoryEmpty,
  ImportHistoryError,
  ImportHistorySkeleton,
} from './imports-states'

export function ImportHistory() {
  const query = useImportHistory()

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">History</h2>
      {historyBody(query)}
    </section>
  )
}

function historyBody(query: ReturnType<typeof useImportHistory>): ReactNode {
  if (query.isPending) {
    return <ImportHistorySkeleton />
  }
  if (query.isError) {
    return <ImportHistoryError onRetry={query.refetch} />
  }
  if (query.data.length === 0) {
    return <ImportHistoryEmpty />
  }
  return <HistoryTable rows={query.data} />
}

function HistoryTable({ rows }: { readonly rows: readonly ImportSummary[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-border-strong bg-surface-raised text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">File</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Started</th>
              <th className="px-4 py-2.5 text-right font-medium">Lines</th>
              <th className="px-4 py-2.5 text-right font-medium">Errors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border last:border-b-0 hover:bg-secondary/60"
              >
                <td className="max-w-[16rem] truncate px-4 py-2.5 font-mono text-xs text-foreground">
                  {row.filename}
                </td>
                <td className="px-4 py-2.5">
                  <ImportStatusBadge status={row.status} />
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  <span title={formatAbsoluteTime(row.createdAt)}>
                    {formatRelativeTime(row.createdAt)}
                  </span>
                </td>
                <td className="tabular px-4 py-2.5 text-right text-muted-foreground">
                  {formatCount(row.processedLines)}
                  {row.totalLines === null
                    ? ''
                    : ` / ${formatCount(row.totalLines)}`}
                </td>
                <td className="tabular px-4 py-2.5 text-right text-muted-foreground">
                  {row.parseErrors}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
