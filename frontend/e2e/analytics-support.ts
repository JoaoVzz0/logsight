import type { Page, Route } from '@playwright/test'

const ENDPOINTS = {
  errorRate: '/analytics/error-rate',
  newIssues: '/analytics/new-issues',
  topIssues: '/analytics/top-issues',
  spikes: '/analytics/spikes',
  byService: '/analytics/by-service',
} as const

type EndpointKey = keyof typeof ENDPOINTS

export type EndpointMock =
  | { readonly body: unknown; readonly delayMs?: number }
  | { readonly status: number }

export type DashboardMocks = {
  readonly [K in EndpointKey]?: EndpointMock
}

export type MockHandle = {
  readonly requests: Record<EndpointKey, URL[]>
}

function defaultBody(key: EndpointKey): unknown {
  if (key === 'errorRate') {
    return { buckets: [] }
  }
  if (key === 'byService') {
    return { services: [] }
  }
  return { issues: [] }
}

export async function mockDashboard(
  page: Page,
  overrides: DashboardMocks = {},
): Promise<MockHandle> {
  const requests: MockHandle['requests'] = {
    errorRate: [],
    newIssues: [],
    topIssues: [],
    spikes: [],
    byService: [],
  }

  for (const key of Object.keys(ENDPOINTS) as EndpointKey[]) {
    const path = ENDPOINTS[key]
    const mock = overrides[key] ?? { body: defaultBody(key) }

    await page.route(new RegExp(`${path}(\\?|$)`), async (route: Route) => {
      requests[key].push(new URL(route.request().url()))

      if ('status' in mock) {
        await route.fulfill({
          status: mock.status,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error', message: 'boom' }),
        })
        return
      }

      if (mock.delayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, mock.delayMs))
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mock.body),
      })
    })
  }

  return { requests }
}
