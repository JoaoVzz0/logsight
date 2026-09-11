import { expect, test } from '@playwright/test'

import { mockDashboard } from './analytics-support'

test.describe('route and layout', () => {
  test('renders the dashboard at /', async ({ page }) => {
    await mockDashboard(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByTestId('dashboard-grid')).toBeVisible()
  })

  test('collapses the card grid to one column below the responsive breakpoint', async ({ page }) => {
    await mockDashboard(page)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const wideColumns = await page
      .getByTestId('dashboard-grid')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    expect(wideColumns).toBeGreaterThan(1)

    await page.setViewportSize({ width: 500, height: 900 })
    const narrowColumns = await page
      .getByTestId('dashboard-grid')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    expect(narrowColumns).toBe(1)
  })
})

test.describe('time range', () => {
  test('changing the time range rewrites the url and every card refetches', async ({ page }) => {
    const handle = await mockDashboard(page)
    await page.goto('/')
    await expect(page.getByTestId('error-rate-card')).toBeVisible()

    await page.getByTestId('time-range-selector').selectOption('7d')

    await expect(page).toHaveURL(/range=7d/)
    for (const key of ['errorRate', 'newIssues', 'topIssues', 'spikes', 'byService'] as const) {
      await expect.poll(() => handle.requests[key].length).toBeGreaterThanOrEqual(2)
    }
  })

  test('reading a custom range from the url shows the from/to fields and requests that window', async ({ page }) => {
    const handle = await mockDashboard(page)
    await page.goto(
      '/?range=custom&from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-02T00%3A00%3A00.000Z',
    )

    await expect(page.getByTestId('dashboard-from-filter')).toBeVisible()
    await expect(page.getByTestId('dashboard-to-filter')).toBeVisible()

    const request = handle.requests.errorRate.at(-1)!
    expect(request.searchParams.get('from')).toBe('2026-01-01T00:00:00.000Z')
    expect(request.searchParams.get('to')).toBe('2026-01-02T00:00:00.000Z')
  })

  test('switching the selector to custom keeps the current window and shows the from/to fields', async ({ page }) => {
    await mockDashboard(page)
    await page.goto('/')
    await expect(page.getByTestId('error-rate-card')).toBeVisible()

    await page.getByTestId('time-range-selector').selectOption('custom')

    await expect(page).toHaveURL(/range=custom/)
    await expect(page.getByTestId('dashboard-from-filter')).toBeVisible()
    await expect(page.getByTestId('dashboard-to-filter')).toBeVisible()
  })

  test('falls back to the default preset when the custom window in the url is invalid', async ({ page }) => {
    await mockDashboard(page)
    await page.goto('/?range=custom&from=not-a-date')

    await expect(page.getByTestId('time-range-selector')).toHaveValue('24h')
    await expect(page.getByTestId('dashboard-from-filter')).toHaveCount(0)
  })
})

test.describe('cards', () => {
  test('error-rate card renders a chart point for every bucket, including zero buckets', async ({ page }) => {
    await mockDashboard(page, {
      errorRate: {
        body: {
          buckets: [
            { bucket: '2026-01-01T00:00:00.000Z', total: 10, errors: 5, ratio: 0.5 },
            { bucket: '2026-01-01T01:00:00.000Z', total: 0, errors: 0, ratio: 0 },
            { bucket: '2026-01-01T02:00:00.000Z', total: 4, errors: 0, ratio: 0 },
          ],
        },
      },
    })
    await page.goto('/')

    await expect(page.getByTestId('error-rate-chart')).toBeVisible()
    await expect(page.locator('.recharts-line-dots circle')).toHaveCount(3)
  })

  test('new-issues card lists issues with their pattern, count and service', async ({ page }) => {
    await mockDashboard(page, {
      newIssues: {
        body: {
          issues: [
            {
              fingerprint: 'fp-1',
              sampleMessage: 'connection timeout',
              severity: 17,
              eventCount: 12,
              firstSeen: '2026-01-01T00:00:00.000Z',
              services: ['checkout'],
            },
          ],
        },
      },
    })
    await page.goto('/')

    const row = page.getByTestId('new-issues-list-row').first()
    await expect(row).toContainText('connection timeout')
    await expect(row).toContainText('12')
    await expect(row).toContainText('checkout')
  })

  test('top-issues card ranks issues in the order the endpoint returns', async ({ page }) => {
    await mockDashboard(page, {
      topIssues: {
        body: {
          issues: [
            {
              fingerprint: 'fp-high',
              sampleMessage: 'high volume',
              severity: 17,
              eventCount: 90,
              firstSeen: '2026-01-01T00:00:00.000Z',
              services: [],
            },
            {
              fingerprint: 'fp-low',
              sampleMessage: 'low volume',
              severity: 9,
              eventCount: 5,
              firstSeen: '2026-01-01T00:00:00.000Z',
              services: [],
            },
          ],
        },
      },
    })
    await page.goto('/')

    const rows = page.getByTestId('top-issues-list-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toContainText('high volume')
    await expect(rows.last()).toContainText('low volume')
  })

  test('spikes card shows the multiplier for each spiking issue', async ({ page }) => {
    await mockDashboard(page, {
      spikes: {
        body: {
          issues: [
            {
              fingerprint: 'fp-1',
              sampleMessage: 'spiking',
              severity: 17,
              eventCount: 0,
              firstSeen: '2026-01-01T00:00:00.000Z',
              services: [],
              currentCount: 30,
              previousCount: 10,
              multiplier: 3,
            },
          ],
        },
      },
    })
    await page.goto('/')

    await expect(page.getByTestId('spikes-list-row').first()).toContainText('3.0x')
  })

  test('by-service card shows distribution per service, with an unknown bucket for a null service', async ({ page }) => {
    await mockDashboard(page, {
      byService: {
        body: {
          services: [
            { serviceName: 'checkout', total: 40, errors: 5 },
            { serviceName: 'unknown', total: 3, errors: 1 },
          ],
        },
      },
    })
    await page.goto('/')

    const rows = page.getByTestId('by-service-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.last()).toContainText('unknown')
  })
})

test.describe('isolation and required states', () => {
  test('a failing card shows its own error state while the other cards render normally', async ({ page }) => {
    await mockDashboard(page, { byService: { status: 500 } })
    await page.goto('/')

    await expect(page.getByTestId('by-service-card-error')).toBeVisible()
    await expect(page.getByTestId('error-rate-card-skeleton')).toHaveCount(0)
    await expect(page.getByTestId('new-issues-card-empty')).toBeVisible()
  })

  test('shows a skeleton per card before the first response resolves', async ({ page }) => {
    await mockDashboard(page, {
      errorRate: { body: { buckets: [] }, delayMs: 1000 },
    })
    await page.goto('/')

    await expect(page.getByTestId('error-rate-card-skeleton')).toBeVisible()
  })

  test('shows an empty state for a card with no data in the window', async ({ page }) => {
    await mockDashboard(page)
    await page.goto('/')

    await expect(page.getByTestId('new-issues-card-empty')).toBeVisible()
    await expect(page.getByTestId('top-issues-card-empty')).toBeVisible()
  })

  test('never shows a total log count on the dashboard', async ({ page }) => {
    await mockDashboard(page)
    await page.goto('/')

    await expect(page.getByTestId('dashboard-total-count')).toHaveCount(0)
    await expect(page.getByText(/total (logs?|events?)/i)).toHaveCount(0)
  })
})

test.describe('issue navigation', () => {
  test('selecting an issue from a card navigates to the logs screen', async ({ page }) => {
    await mockDashboard(page, {
      newIssues: {
        body: {
          issues: [
            {
              fingerprint: 'fp-1',
              sampleMessage: 'connection timeout',
              severity: 17,
              eventCount: 12,
              firstSeen: '2026-01-01T00:00:00.000Z',
              services: ['checkout'],
            },
          ],
        },
      },
    })
    await page.route(/\/logs(\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ records: [], nextCursor: null }),
      }),
    )
    await page.goto('/')

    await page.getByTestId('new-issues-list-row').first().click()
    await expect(page).toHaveURL(/\/logs\?service=checkout/)
  })
})
