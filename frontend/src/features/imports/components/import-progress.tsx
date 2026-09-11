import type { ReactNode } from 'react'

import { Link } from 'react-router-dom'

import { Button } from '../../../shared/ui/button'
import { Card, CardContent } from '../../../shared/ui/card'
import { Skeleton } from '../../../shared/ui/skeleton'
import type { ImportStatus } from '../api/get-import'
import { useImportJob } from '../hooks/use-import-job'
import {
  formatCount,
  formatDuration,
  formatRate,
  percentComplete,
  progressLabel,
} from '../model/progress'

export function ImportProgress({
  jobId,
  onDismiss,
}: {
  readonly jobId: string
  readonly onDismiss: () => void
}) {
  const query = useImportJob(jobId)

  if (query.isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-2 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (query.isError) {
    return (
      <Card role="alert">
        <CardContent className="flex flex-col items-start gap-2 p-5">
          <p className="text-sm font-medium text-foreground">
            Could not load the import status
          </p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const status = query.data

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="truncate font-mono text-xs text-muted-foreground">
            {status.filename}
          </p>
          {(status.status === 'completed' || status.status === 'failed') && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>

        <div aria-live="polite" className="mt-3">
          {resultBody(status)}
        </div>
      </CardContent>
    </Card>
  )
}

function resultBody(status: ImportStatus): ReactNode {
  if (status.status === 'completed') {
    return <CompletedResult status={status} />
  }
  if (status.status === 'failed') {
    return <FailedResult status={status} />
  }
  return <RunningResult status={status} />
}

function RunningResult({ status }: { readonly status: ImportStatus }) {
  const percent = percentComplete(status)
  return (
    <>
      <p className="text-sm text-foreground">
        Processing… {progressLabel(status)}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${percent ?? 8}%` }}
        />
      </div>
    </>
  )
}

function CompletedResult({ status }: { readonly status: ImportStatus }) {
  const result = status.result
  return (
    <div className="text-sm">
      <p className="font-medium text-foreground">Import complete</p>
      {result !== null && (
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-muted-foreground">
          <Stat label="Records" value={formatCount(result.ingestedRecords)} />
          <Stat label="Time" value={formatDuration(result.elapsedMs)} />
          <Stat label="Rate" value={formatRate(result.linesPerSecond)} />
          {status.parseErrors > 0 && (
            <Stat label="Parse errors" value={String(status.parseErrors)} />
          )}
        </dl>
      )}
      <Link
        to="/logs"
        className="mt-4 inline-block rounded-md border border-border-strong bg-surface-raised px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
      >
        View logs
      </Link>
    </div>
  )
}

function FailedResult({ status }: { readonly status: ImportStatus }) {
  return (
    <div className="text-sm">
      <p className="font-medium text-severity-error">Import failed</p>
      <p className="mt-1 text-muted-foreground">
        {status.error ?? 'The job stopped before it finished.'}
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide">{label}</dt>
      <dd className="tabular text-sm font-semibold text-foreground">{value}</dd>
    </div>
  )
}
