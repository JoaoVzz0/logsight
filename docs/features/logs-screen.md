# Logs screen

The `/logs` route: a dense, virtualized table of raw log records, its filters
held in the URL, growing by infinite scroll off the endpoint's opaque cursor.

## Governed by

- ADR 0002 — Canonical model: the row shows fields from the canonical
  `LogRecord` (severity, event time, service, body).
- ADR 0005 — Grouping: total log count is a vanity metric and is not
  available from the backend; the screen never displays or invents a total.
- ADR 0010 — Frontend architecture: filters live in the URL `searchParams`
  (validated with Zod on read); the table is `useInfiniteQuery` + TanStack
  Virtual with a fixed row height; filters compose the `queryKey`, so
  changing one resets pagination and returns the scroll to the top; infinite
  scroll uses `IntersectionObserver` via a callback ref, never `useEffect`;
  every color comes from a CSS variable.
- ADR 0011 — Readability and accessibility: monospaced body, `tabular-nums`
  on numbers; severity as a left-edge band **plus** a distinctly shaped icon
  **plus** a text label, never colour alone; relative time visible with the
  absolute value in `title`; `role="grid"` with a real `aria-rowcount` and a
  per-row `aria-rowindex`; visible focus; `prefers-reduced-motion` respected.
- ADR 0012 — API contract: the screen calls `GET /logs` only through the
  generated `api-client`; it never writes a manual `fetch`.
- `.claude/rules/frontend.md` — state mechanisms, the `useEffect` table,
  required empty/error/loading states, the Table and Responsiveness sections.
- `.claude/rules/testing.md` — no unit tests for React components; the screen
  is covered by one Playwright end-to-end test, with unit tests only on the
  extractable pure logic.

## Done when

### Client generation — must ship with this feature

- [x] `pnpm generate:client` has been run and `packages/api-client/openapi.json`
      and `packages/api-client/src` are committed with `GET /logs` present; a
      clean clone builds the frontend without the API running.

### Route and data flow

- [x] Navigating to `/logs` renders the table and issues exactly one
      `GET /logs` request through the generated client.
- [x] Scrolling to the end of the loaded rows requests the next page with the
      previous response's `nextCursor`, and the new rows append without the
      list scrolling back to the top.
- [x] When a response carries `nextCursor: null`, reaching the end of the list
      triggers no further request.

### Filters in the URL

- [x] `level` (repeatable, including `unknown`), `from`, `to`, `service` and
      `q` are read from `searchParams`; reloading the page reproduces the same
      filtered view.
- [x] Changing any filter rewrites the URL, discards the loaded pages, and
      returns the scroll position to the top.
- [x] A `searchParam` that fails Zod validation is dropped and its filter
      becomes inactive; the remaining valid params still apply and the table
      loads — no error screen.
- [x] Each active filter appears in the `GET /logs` request as its
      corresponding query parameter (a `level` set, `from`/`to`, `service`,
      and a `q` of at least three characters).

### Search

- [x] Typing fewer than three characters in the search field changes neither
      the URL `q` nor triggers a `GET /logs` request; the field's placeholder
      states the three-character minimum and the field is not shown in an
      error state.
- [x] Once the input settles, `q` is written to the URL a single time (not per
      keystroke) and the list reloads for the new term.

### Row presentation

- [x] Rows have a fixed height and the message is truncated to a single line.
- [x] The columns are severity, time, service and message; numeric content
      uses `tabular-nums` and the body uses the monospaced font.
- [x] Severity is conveyed by a left-edge band, a distinctly shaped icon and a
      text label together; with colour removed the levels are still
      distinguishable.
- [x] No literal colour value appears in the table components; every severity
      colour resolves from a CSS variable.
- [x] The time column shows a relative time with the absolute timestamp in its
      `title`.

### Required states

- [x] Before the first response the screen shows a skeleton shaped like the
      table — header plus fixed-height rows — not a spinner.
- [x] When `GET /logs` fails, the screen names the failure and offers a retry
      that re-issues the request.
- [x] With no filters active and zero rows returned, the empty state is a call
      to action linking to the imports screen.
- [x] With one or more filters active and zero rows returned, the screen shows
      a distinct "no logs match these filters" state with an action that
      clears the filters.

### Responsive

- [x] Below 640px the table scrolls horizontally inside its own container
      without the page body scrolling horizontally, and the severity, time and
      message columns stay visible.

### Accessibility

- [x] The list container has `role="grid"`; while another page can still be
      loaded `aria-rowcount` is `-1`, and once the last page has loaded it is
      the exact number of loaded rows.
- [x] Each rendered row carries a 1-based `aria-rowindex` for its position in
      the full loaded set, not its position in the virtual window.
- [x] The scroll area sizes to the number of loaded rows and every loaded row
      is reachable by scrolling, whatever `aria-rowcount` reads — the ARIA
      value never feeds the virtualizer.
- [x] Arrow keys move row focus through the table and the focused row is
      always visibly indicated.

## Out of scope

- The row detail panel — full tokenized message, `attributes` table, `raw`,
  `trace_id` linking, `Enter` to open / `Esc` to close. The table works
  without it; it is a later increment. Because it owns the panel transitions,
  the `prefers-reduced-motion` behaviour ships with it.
- Tokenized / highlighted message spans in the closed row (ADR 0011). This
  feature shows the body as plain truncated text; the shared tokenizer is
  wired in with the detail panel.
- Moving the response Zod schema into a shared workspace package. The screen
  consumes the generated client's types; the shared-schema question is left
  where ADR 0012's operational note leaves it.
- The issues screen, the dashboard, and the imports upload flow.
- Auto-refresh / polling for newly arrived logs — the view is loaded on demand.
- Column resizing, reordering, or a user-selectable sort — the order is fixed
  (`timestamp` descending) by ADR 0010.
- A displayed row total or "N results" headline (ADR 0005).

## Notes

Two behaviours here are refinements the ADRs imply rather than state:

- **Two empty states.** `.claude/rules/frontend.md` says "empty is a call to
  action, not a blank table". The call to action for a genuinely empty store
  is "import logs"; for a filtered result that matched nothing it is "clear
  the filters". They are different actions, so they are different states.
- **`aria-rowcount` while paginating.** ADR 0005 forbids inventing a total and
  the backend supplies none. `aria-rowcount="-1"` is the ARIA value for "total
  unknown", which is exactly true while `hasNextPage`; once the last page is
  in, the loaded count is the real total and is set.

`from` / `to` are carried in the URL as ISO 8601 UTC strings, matching the
`GET /logs` contract, and either bound may be present without the other.

Two failure modes to guard at implementation time — both are already what the
rules require, called out because they are the easy things to get wrong:

- **Two distinct counts, never conflated.** The ARIA count is semantic:
  `-1` means "total unknown" and is what a screen reader announces. The
  virtualizer count is mechanical: how many rows to size the scroll area for,
  which must be the real number of loaded rows. `-1` must never reach TanStack
  Virtual. The criterion above ("the scroll area sizes to the number of loaded
  rows … the ARIA value never feeds the virtualizer") exists to pin this.
- **Filter reset is a remount, not an effect.** `.claude/rules/frontend.md`
  ("`useEffect`" table) resets on filter change with a `key` prop that
  remounts the list — `key={serializedFilters}` — so pagination state is
  dropped and the scroll returns to the top for free. An `useEffect` watching
  the filters to reset scroll is the anti-pattern the rule forbids and must
  not appear.

Per `.claude/rules/testing.md` the acceptance criteria are proven by one
Playwright spec for the `/logs` screen (load, filter, scroll, the empty /
error / loading states, the ARIA attributes) plus unit tests on the pure
logic that has a testable seam: the `searchParams` Zod parse and its
drop-invalid-keep-valid recovery, the `aria-rowcount` rule, and the cursor
threaded from response to next request. React components themselves get no
unit tests.
