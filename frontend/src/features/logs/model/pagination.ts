import type { LogListResponse } from '../../../shared/lib/api-client'

export function nextPageParam(page: LogListResponse): string | undefined {
  return page.nextCursor ?? undefined
}
