import { memo } from 'react'

import type { LogRecord } from '../../../shared/lib/api-client'
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from '../../../shared/lib/relative-time'

import { SeverityBand, SeverityTag } from './severity-tag'

export const ROW_HEIGHT = 32

export const GRID_COLUMNS = 'grid grid-cols-[7rem_8.5rem_9rem_minmax(16rem,1fr)]'

type LogRowProps = {
  readonly record: LogRecord
  readonly rowIndex: number
  readonly offset: number
  readonly focused: boolean
  readonly onFocus: (rowIndex: number) => void
}

function LogRowComponent({
  record,
  rowIndex,
  offset,
  focused,
  onFocus,
}: LogRowProps) {
  return (
    <div
      role="row"
      aria-rowindex={rowIndex}
      data-testid="log-row"
      tabIndex={focused ? 0 : -1}
      onFocus={() => onFocus(rowIndex)}
      style={{ height: ROW_HEIGHT, transform: `translateY(${offset}px)` }}
      className={`absolute inset-x-0 items-center border-b border-border text-xs outline-offset-[-2px] transition-colors hover:bg-secondary/40 focus:outline focus:outline-2 focus:outline-ring ${GRID_COLUMNS}`}
    >
      <div
        role="gridcell"
        data-col="severity"
        className="relative flex h-full items-center truncate pl-3"
      >
        <SeverityBand severityNumber={record.severityNumber} />
        <SeverityTag severityNumber={record.severityNumber} />
      </div>
      <div role="gridcell" data-col="time" className="tabular truncate text-muted-foreground">
        <span title={formatAbsoluteTime(record.timestamp)}>
          {formatRelativeTime(record.timestamp)}
        </span>
      </div>
      <div role="gridcell" data-col="service" className="truncate text-muted-foreground">
        {record.serviceName ?? '—'}
      </div>
      <div role="gridcell" data-col="message" className="truncate font-mono">
        {record.body}
      </div>
    </div>
  )
}

export const LogRow = memo(LogRowComponent)
