import { expect, test } from '@playwright/test'

import { logRequests, mockLogs, page as mockPage, record } from './support'

const ROW = 32

test.describe('route and data flow', () => {
  test('renders the table from a single GET /logs request', async ({ page }) => {
    const handle = await mockLogs(page, { pages: [mockPage(3, null)] })

    await page.goto('/logs')

    await expect(page.getByRole('grid')).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount(3)
    expect(logRequests(handle)).toHaveLength(1)
  })

  test('loads the next page with the previous nextCursor and appends rows', async ({ page }) => {
    const handle = await mockLogs(page, {
      pages: [mockPage(5, 'cursor-1'), mockPage(5, null)],
    })
    await page.goto('/logs')
    await expect(page.getByRole('row')).toHaveCount(5)

    await page.locator('[data-testid="logs-scroll"]').evaluate((el) => {
      el.scrollTo(0, el.scrollHeight)
    })

    await expect(page.getByRole('row')).toHaveCount(10)
    const requests = logRequests(handle)
    expect(requests[1]?.searchParams.get('cursor')).toBe('cursor-1')
  })

  test('stops requesting once nextCursor is null', async ({ page }) => {
    const handle = await mockLogs(page, { pages: [mockPage(4, null)] })
    await page.goto('/logs')
    await expect(page.getByRole('row')).toHaveCount(4)

    for (let i = 0; i < 3; i += 1) {
      await page.locator('[data-testid="logs-scroll"]').evaluate((el) => {
        el.scrollTo(0, el.scrollHeight)
      })
      await page.waitForTimeout(150)
    }

    expect(logRequests(handle)).toHaveLength(1)
  })
})

test.describe('filters in the url', () => {
  test('reads every filter from the url and reproduces the view on reload', async ({ page }) => {
    const handle = await mockLogs(page, { pages: [mockPage(2, null)] })

    await page.goto('/logs?service=checkout&level=17&q=timeout')
    await expect(page.getByRole('row')).toHaveCount(2)

    const first = logRequests(handle)[0]!
    expect(first.searchParams.get('service')).toBe('checkout')
    expect(first.searchParams.getAll('level')).toEqual(['17'])
    expect(first.searchParams.get('q')).toBe('timeout')

    await page.reload()
    const second = logRequests(handle).at(-1)!
    expect(second.searchParams.get('service')).toBe('checkout')
  })

  test('changing a filter rewrites the url, drops loaded pages and returns to the top', async ({ page }) => {
    await mockLogs(page, { pages: [mockPage(6, 'c1'), mockPage(6, null)] })
    await page.goto('/logs')
    await page.locator('[data-testid="logs-scroll"]').evaluate((el) => {
      el.scrollTo(0, el.scrollHeight)
    })
    await expect(page.getByRole('row')).toHaveCount(12)

    await page.getByTestId('service-filter').fill('billing')
    await page.getByTestId('service-filter').press('Enter')

    await expect(page).toHaveURL(/service=billing/)
    await expect(page.getByRole('row')).toHaveCount(6)
    const scrollTop = await page
      .locator('[data-testid="logs-scroll"]')
      .evaluate((el) => el.scrollTop)
    expect(scrollTop).toBe(0)
  })

})

test.describe('search', () => {
  test('does not touch the url or fetch while under three characters', async ({ page }) => {
    const handle = await mockLogs(page, { pages: [mockPage(2, null)] })
    await page.goto('/logs')
    await expect(page.getByRole('row')).toHaveCount(2)

    const search = page.getByTestId('logs-search')
    await search.fill('ab')
    await page.waitForTimeout(600)

    await expect(page).not.toHaveURL(/q=/)
    expect(logRequests(handle)).toHaveLength(1)
    await expect(search).toHaveAttribute('placeholder', /3/)
    await expect(search).not.toHaveAttribute('aria-invalid', 'true')
  })

  test('writes q to the url once after the input settles and reloads the list', async ({ page }) => {
    const handle = await mockLogs(page, { pages: [mockPage(2, null)] })
    await page.goto('/logs')
    await expect(page.getByRole('row')).toHaveCount(2)

    await page.getByTestId('logs-search').pressSequentially('timeout', { delay: 40 })
    await expect(page).toHaveURL(/q=timeout/)
    await expect(page.getByRole('row')).toHaveCount(2)

    await expect
      .poll(
        () =>
          logRequests(handle).filter(
            (u) => u.searchParams.get('q') === 'timeout',
          ).length,
      )
      .toBe(1)
  })
})

test.describe('row presentation', () => {
  test('keeps a fixed row height and truncates the message to one line', async ({ page }) => {
    await mockLogs(page, {
      pages: [
        mockPage(1, null, {
          body: 'a very long message '.repeat(40),
        }),
      ],
    })
    await page.goto('/logs')

    const row = page.getByRole('row').first()
    await expect(row).toHaveCSS('height', `${ROW}px`)

    const message = row.locator('[data-col="message"]')
    const overflow = await message.evaluate(
      (el) => el.scrollWidth > el.clientWidth && el.clientHeight < 28,
    )
    expect(overflow).toBe(true)
  })

  test('shows the four columns with a monospaced body and tabular numerals', async ({ page }) => {
    await mockLogs(page, { pages: [mockPage(1, null)] })
    await page.goto('/logs')

    const row = page.getByRole('row').first()
    for (const col of ['severity', 'time', 'service', 'message']) {
      await expect(row.locator(`[data-col="${col}"]`)).toHaveCount(1)
    }
    const fontFamily = await row
      .locator('[data-col="message"]')
      .evaluate((el) => getComputedStyle(el).fontFamily)
    expect(fontFamily.toLowerCase()).toContain('mono')

    const numeric = await row
      .locator('[data-col="time"]')
      .evaluate((el) => getComputedStyle(el).fontVariantNumeric)
    expect(numeric).toContain('tabular-nums')
  })

  test('conveys severity by band, shaped icon and label together', async ({ page }) => {
    await mockLogs(page, {
      pages: [
        {
          records: [
            record({ severityNumber: 17, severityText: 'ERROR' }),
            record({ severityNumber: 13, severityText: 'WARN' }),
          ],
          nextCursor: null,
        },
      ],
    })
    await page.goto('/logs')

    const rows = page.getByRole('row')
    const errorCell = rows.nth(0).locator('[data-col="severity"]')
    const warnCell = rows.nth(1).locator('[data-col="severity"]')

    await expect(errorCell.getByTestId('severity-band')).toBeVisible()
    await expect(errorCell.getByTestId('severity-icon')).toBeVisible()
    await expect(errorCell).toContainText(/error/i)
    await expect(warnCell).toContainText(/warn/i)

    const errorShape = await errorCell
      .getByTestId('severity-icon')
      .getAttribute('data-shape')
    const warnShape = await warnCell
      .getByTestId('severity-icon')
      .getAttribute('data-shape')
    expect(errorShape).not.toBe(warnShape)
  })

  test('shows a relative time with the absolute timestamp in the title', async ({ page }) => {
    const timestamp = new Date(Date.now() - 5 * 60_000).toISOString()
    await mockLogs(page, { pages: [mockPage(1, null, { timestamp })] })
    await page.goto('/logs')

    const time = page.getByRole('row').first().locator('[data-col="time"]')
    await expect(time).toContainText(/ago|now/i)
    await expect(time.locator('[title]')).toHaveAttribute('title', /2026|:/)
  })
})

test.describe('required states', () => {
  test('shows a table-shaped skeleton before the first response', async ({ page }) => {
    await mockLogs(page, { pages: [mockPage(3, null)], delayMs: 1500 })
    await page.goto('/logs')

    await expect(page.getByTestId('logs-skeleton')).toBeVisible()
    await expect(page.getByRole('progressbar')).toHaveCount(0)
    const rows = page.getByTestId('logs-skeleton').locator('[data-testid="skeleton-row"]')
    expect(await rows.count()).toBeGreaterThan(3)
  })

  test('names the failure and retries on demand', async ({ page }) => {
    const handle = await mockLogs(page, {
      pages: [mockPage(2, null)],
      failuresBeforeSuccess: 1,
    })
    await page.goto('/logs')

    await expect(page.getByTestId('logs-error')).toContainText(/fail|error|could not/i)
    await page.getByRole('button', { name: /retry|try again/i }).click()

    await expect(page.getByRole('row')).toHaveCount(2)
    expect(logRequests(handle).length).toBeGreaterThanOrEqual(2)
  })

  test('offers an import call to action when there are no logs and no filters', async ({ page }) => {
    await mockLogs(page, { pages: [{ records: [], nextCursor: null }] })
    await page.goto('/logs')

    const empty = page.getByTestId('logs-empty')
    await expect(empty).toBeVisible()
    await expect(empty.getByRole('link')).toHaveAttribute('href', '/imports')
  })

  test('shows a distinct no-matches state with a clear-filters action when filters exclude everything', async ({ page }) => {
    await mockLogs(page, { pages: [{ records: [], nextCursor: null }] })
    await page.goto('/logs?service=nope')

    await expect(page.getByTestId('logs-no-matches')).toBeVisible()
    await expect(page.getByTestId('logs-empty')).toHaveCount(0)
    await page.getByRole('button', { name: /clear filters/i }).click()
    await expect(page).toHaveURL(/\/logs$/)
  })
})

test.describe('responsive', () => {
  test('scrolls the table horizontally in its own container below 640px', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 800 })
    await mockLogs(page, { pages: [mockPage(3, null)] })
    await page.goto('/logs')
    await expect(page.getByRole('grid')).toBeVisible()

    const bodyScrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(bodyScrolls).toBe(false)

    const container = page.locator('[data-testid="logs-scroll"]')
    const overflowX = await container.evaluate((el) => getComputedStyle(el).overflowX)
    expect(['auto', 'scroll']).toContain(overflowX)

    const row = page.getByRole('row').first()
    for (const col of ['severity', 'time', 'message']) {
      await expect(row.locator(`[data-col="${col}"]`)).toBeAttached()
    }
  })
})

test.describe('accessibility', () => {
  test('reports aria-rowcount as -1 while paginating and the real count when done', async ({ page }) => {
    await mockLogs(page, { pages: [mockPage(5, 'c1'), mockPage(4, null)] })
    await page.goto('/logs')

    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '-1')

    await page.locator('[data-testid="logs-scroll"]').evaluate((el) => {
      el.scrollTo(0, el.scrollHeight)
    })
    await expect(page.getByRole('row')).toHaveCount(9)
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '9')
  })

  test('gives each row a 1-based aria-rowindex for its position in the full set', async ({ page }) => {
    await mockLogs(page, { pages: [mockPage(8, 'c1'), mockPage(8, null)] })
    await page.goto('/logs')
    await page.locator('[data-testid="logs-scroll"]').evaluate((el) => {
      el.scrollTo(0, el.scrollHeight)
    })
    await expect(page.getByRole('row')).toHaveCount(16)

    const last = page.getByRole('row').last()
    await expect(last).toHaveAttribute('aria-rowindex', '16')
  })

  test('sizes the scroll area to the loaded rows regardless of aria-rowcount', async ({ page }) => {
    await mockLogs(page, { pages: [mockPage(6, 'c1'), mockPage(6, null)] })
    await page.goto('/logs')
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '-1')

    const sizer = await page
      .locator('[data-testid="logs-sizer"]')
      .evaluate((el) => el.getBoundingClientRect().height)
    expect(sizer).toBeGreaterThanOrEqual(6 * ROW)
    expect(sizer).toBeLessThan(60 * ROW)
  })

  test('moves row focus with the arrow keys and shows a visible focus ring', async ({ page }) => {
    await mockLogs(page, { pages: [mockPage(5, null)] })
    await page.goto('/logs')

    await page.getByRole('row').first().click()
    await page.keyboard.press('ArrowDown')

    const index = await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-rowindex'),
    )
    expect(index).toBe('2')

    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return 'none'
      const s = getComputedStyle(el)
      return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`
    })
    expect(outline).not.toMatch(/^none 0px none$/)
  })
})
