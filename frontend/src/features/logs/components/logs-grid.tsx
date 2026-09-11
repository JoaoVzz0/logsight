import { useVirtualizer } from '@tanstack/react-virtual'
import { useState, type KeyboardEvent } from 'react'

import type { LogRecord } from '../../../shared/lib/api-client'
import { ariaRowCount } from '../model/aria'

import { GRID_COLUMNS, LogRow, ROW_HEIGHT } from './log-row'
import { ScrollSentinel } from './scroll-sentinel'

type LogsGridProps = {
  readonly records: readonly LogRecord[]
  readonly hasNextPage: boolean
  readonly isFetchingNextPage: boolean
  readonly onLoadMore: () => void
}

export function LogsGrid({
  records,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: LogsGridProps) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [focusedRow, setFocusedRow] = useState(1)

  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  function moveFocus(target: number) {
    setFocusedRow(target)
    scrollEl
      ?.querySelector<HTMLElement>(`[aria-rowindex="${target}"]`)
      ?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(Math.min(focusedRow + 1, records.length))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(Math.max(focusedRow - 1, 1))
    }
  }

  return (
    <div
      ref={setScrollEl}
      data-testid="logs-scroll"
      role="grid"
      aria-rowcount={ariaRowCount(records.length, hasNextPage)}
      aria-label="Log records"
      onKeyDown={onKeyDown}
      className="h-[68vh] w-full min-w-0 overflow-auto rounded-md border border-border bg-surface"
    >
      <div className="min-w-[46rem]">
        <div
          role="presentation"
          className={`sticky top-0 z-10 h-8 items-center border-b border-border-strong bg-surface-raised text-[11px] font-medium uppercase tracking-wide text-foreground/70 ${GRID_COLUMNS}`}
        >
          <div className="pl-3">Severity</div>
          <div>Time</div>
          <div>Service</div>
          <div>Message</div>
        </div>

        <div
          data-testid="logs-sizer"
          className="relative"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const record = records[item.index]
            if (record === undefined) {
              return null
            }
            return (
              <LogRow
                key={record.id}
                record={record}
                rowIndex={item.index + 1}
                offset={item.start}
                focused={item.index + 1 === focusedRow}
                onFocus={setFocusedRow}
              />
            )
          })}
        </div>

        <ScrollSentinel
          root={scrollEl}
          disabled={!hasNextPage || isFetchingNextPage}
          onReach={onLoadMore}
        />
      </div>
    </div>
  )
}
