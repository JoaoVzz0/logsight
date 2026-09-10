import { randomUUID } from 'node:crypto'

import type { Page, Route } from '@playwright/test'

export type MockRecord = {
  id: string
  timestamp: string
  observedAt: string
  severityNumber: number | null
  severityText: string | null
  body: string
  serviceName: string | null
  host: string | null
  environment: string | null
  traceId: string | null
  spanId: string | null
  sourceType: string
  fingerprint: string
}

export type MockPage = {
  records: MockRecord[]
  nextCursor: string | null
}

export function record(over: Partial<MockRecord> = {}): MockRecord {
  return {
    id: randomUUID(),
    timestamp: new Date(Date.now() - 90_000).toISOString(),
    observedAt: new Date().toISOString(),
    severityNumber: 17,
    severityText: 'ERROR',
    body: 'connection timeout on checkout after 3200ms',
    serviceName: 'checkout',
    host: null,
    environment: null,
    traceId: null,
    spanId: null,
    sourceType: 'json-lines',
    fingerprint: 'fp-1',
    ...over,
  }
}

export function page(count: number, nextCursor: string | null, over: Partial<MockRecord> = {}): MockPage {
  return {
    records: Array.from({ length: count }, () => record(over)),
    nextCursor,
  }
}

export type MockOptions = {
  pages?: MockPage[]
  failuresBeforeSuccess?: number
  status?: number
  delayMs?: number
}

export type MockHandle = {
  readonly requests: URL[]
}

export async function mockLogs(
  target: Page,
  options: MockOptions = {},
): Promise<MockHandle> {
  const pages = options.pages ?? [page(3, null)]
  const requests: URL[] = []
  let served = 0

  await target.route(/\/logs(\?|$)/, async (route: Route) => {
    const request = route.request()
    const resourceType = request.resourceType()
    if (resourceType !== 'fetch' && resourceType !== 'xhr') {
      await route.continue()
      return
    }

    const url = new URL(request.url())
    requests.push(url)
    const index = served
    served += 1

    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    }

    if (options.status && options.status >= 400) {
      await route.fulfill({
        status: options.status,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error', message: 'boom' }),
      })
      return
    }

    if (index < (options.failuresBeforeSuccess ?? 0)) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error', message: 'boom' }),
      })
      return
    }

    const pageIndex = Math.min(
      index - (options.failuresBeforeSuccess ?? 0),
      pages.length - 1,
    )
    const body = pages[Math.max(0, pageIndex)]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ records: body.records, nextCursor: body.nextCursor }),
    })
  })

  return { requests }
}

export function logRequests(handle: MockHandle): URL[] {
  return handle.requests.filter((url) => url.pathname.endsWith('/logs'))
}
