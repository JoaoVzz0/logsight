import type { ReactNode } from 'react'

import type { UseQueryResult } from '@tanstack/react-query'

import { cn } from '../../../shared/lib/cn'
import { Button } from '../../../shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card'
import { Skeleton } from '../../../shared/ui/skeleton'

type DashboardCardProps<T> = {
  readonly title: string
  readonly testId: string
  readonly query: UseQueryResult<T>
  readonly isEmpty: (data: T) => boolean
  readonly emptyMessage: string
  readonly children: (data: T) => ReactNode
  readonly fixedHeight?: boolean
}

export function DashboardCard<T>(props: DashboardCardProps<T>) {
  const { fixedHeight = false } = props
  return (
    <Card
      data-testid={props.testId}
      className={cn(fixedHeight && 'flex h-80 flex-col')}
    >
      <CardHeader className={cn(fixedHeight && 'shrink-0')}>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent
        className={cn(fixedHeight && 'scroll-area min-h-0 flex-1 overflow-y-auto')}
      >
        {renderBody(props)}
      </CardContent>
    </Card>
  )
}

function renderBody<T>({
  query,
  testId,
  isEmpty,
  emptyMessage,
  children,
}: DashboardCardProps<T>): ReactNode {
  if (query.isPending) {
    return <DashboardCardSkeleton testId={testId} />
  }
  if (query.isError) {
    return <DashboardCardError testId={testId} onRetry={query.refetch} />
  }
  if (isEmpty(query.data)) {
    return <DashboardCardEmpty testId={testId} message={emptyMessage} />
  }
  return children(query.data)
}

function DashboardCardSkeleton({ testId }: { readonly testId: string }) {
  return (
    <div data-testid={`${testId}-skeleton`} className="flex flex-col gap-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}

function DashboardCardError({
  testId,
  onRetry,
}: {
  readonly testId: string
  readonly onRetry: () => void
}) {
  return (
    <div data-testid={`${testId}-error`} role="alert" className="text-sm">
      <p className="font-medium text-foreground">Could not load this card</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-3">
        Retry
      </Button>
    </div>
  )
}

function DashboardCardEmpty({
  testId,
  message,
}: {
  readonly testId: string
  readonly message: string
}) {
  return (
    <p data-testid={`${testId}-empty`} className="text-sm text-muted-foreground">
      {message}
    </p>
  )
}
