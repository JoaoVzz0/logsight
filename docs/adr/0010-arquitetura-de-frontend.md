# ADR 0010 — Frontend architecture

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The frontend is not a presentation layer over the backend: it is the
product. The problem the platform solves — raw logs are unstructured and
hard to read — is only solved in the interface. "User experience (UX/UI)"
and "performance" are explicit evaluation criteria, and both show up here.

Two forces shape the decisions below:

- The table needs to display hundreds of thousands of records without
  freezing.
- Filters are the central exploration mechanism, and an incident
  investigation is usually shared between people.

## Decision

### Navigation: issues as the entry point

```
/              Dashboard — metrics and trends
/issues        List of grouped problems   ← default entry point
/issues/:fp    Detail: occurrences, timeline, affected services
/logs          Raw table with filters — drill-down
/imports       Upload and job history
```

The flow is **problem → occurrences → raw line**. A home page with raw
logs would deliver a file viewer; the issues list delivers an
observability tool. It is ADR 0005 made concrete as navigation, not just
as a number on the dashboard.

### Structure

```
src/
├─ features/
│  ├─ issues/     api/ · components/ · hooks/ · pages/
│  ├─ logs/
│  ├─ analytics/
│  └─ imports/
├─ shared/
│  ├─ ui/         shadcn components
│  ├─ lib/        http client, formatters, tokenizer
│  └─ schemas/    Zod, imported from the backend
└─ app/           router, providers, layout
```

Mirrors the backend's `domains/` (ADR 0008), so that a feature change
touches one folder on each side.

### State: three types, three mechanisms

| Type | Mechanism |
|---|---|
| Server state | TanStack Query |
| Filters and time range | `searchParams` in the URL |
| Local UI | `useState` |

**Filters live in the URL, not in local state.** Level, range, search and
service are `searchParams`. The consequence is operational, not aesthetic:
the view is shareable by link — paste the URL in the incident channel and
the colleague sees exactly the same slice. Back navigation and reload work
without extra code.

There is no global state manager. What would appear global in this app is
either server state (TanStack Query cache) or URL state.

### No `useEffect` for derivation and synchronization

| Situation | Adopted mechanism |
|---|---|
| Fetching data | TanStack Query |
| Filters | `useSearchParams` as the source of truth |
| Derived list | computed during render; `useMemo` only after measurement |
| Reset state on filter change | `key` on the component, remounting |
| Import progress | `refetchInterval` on `useQuery` |
| Infinite scroll | `IntersectionObserver` via callback ref |
| System theme preference | `useSyncExternalStore` over `matchMedia` |

The rule is not "never use `useEffect`". `useEffect` is the correct
mechanism to **synchronize with an external system** — keyboard shortcuts
with `addEventListener` are the legitimate case in this project. What is
avoided is using it to derive state or synchronize state with state, which
is the source of cascading re-renders.

Regarding table re-renders, the real cost is not in effects but in the
filter re-rendering virtualized rows on every keystroke. Mitigations:
`debounce` before writing to the URL, and `React.memo` on the row with
primitive props. Both applied after measuring in the Profiler.

### Light and dark theme

Dark is the default, following the genre's convention. Three states:
`light`, `dark`, `system`.

The class is applied by a blocking script in `index.html`, before first
paint, reading `localStorage` and `prefers-color-scheme`. Without this,
the page flashes light before the theme is applied.

Mandatory consequence: **every color comes from a CSS variable**. Severity
and chart colors defined as hex in the component do not switch theme —
Recharts even reads `hsl(var(--severity-error))` instead of a literal
value.

### Virtualized table

`useInfiniteQuery` with TanStack Virtual, fixed row height.

**Composite cursor.** Records collide on timestamp; a timestamp-only
cursor skips or duplicates rows. The cursor is the tuple
`(timestamp, id)`, with row comparison in SQL:

```sql
WHERE (timestamp, id) < (:cursorTs, :cursorId)
ORDER BY timestamp DESC, id DESC
```

**Reset on filter change.** Filters compose the `queryKey`; changing one
resets pagination and scroll returns to the top.

**Detail in a side panel, not inline.** Expanding the row within the list
would break the fixed height required by virtualization. The side panel
avoids dynamic measurement and is the genre's standard.

### Dashboard

One query per card, not a monolithic query: each card loads, fails and
shows a skeleton independently.

The cards follow ADR 0005: error rate over time, new issues in the window,
top issues by volume, spiking issues, distribution by service. **"Total
logs" is not shown as a headline number** — it is the vanity metric ADR
0005 rejects, and showing it would contradict the decision.

### Empty, error and loading states

Mandatory on every surface. Empty is a call to action, not a blank table.
Error carries a specific message and a retry action. Loading uses a
skeleton shaped like the content, not a spinner.

## Alternatives considered

**Filters in local state or a global store.** Simpler to implement.
Discarded because it eliminates the tool's most useful property: the
view shareable by link.

**Redux or Zustand.** Discarded due to the absence of genuinely global
client state — adding the layer would be structure without content.

**Numbered pagination instead of infinite scroll.** Defensible, and
simpler to implement correctly. Discarded because the brief mentions
infinite scroll or optimized pagination, and continuous exploration is the
standard interaction pattern in log tools.

**Table without virtualization, just a smaller page.** Discarded: the
brief requires handling large volumes, and virtualization is the direct
demonstration of that requirement.

**Next.js with server-side rendering.** Discarded in ADR 0001; the
application is an authenticated, interactive panel, with no SEO or
first-load optimization requirement.

## Consequences

**Positive**
- Shareable views via URL, with no extra work.
- Cache and revalidation solved by a library, not by effects.
- The table sustains high volume with predictable row height.

**Negative**
- URL filters require serializing and validating `searchParams` with Zod,
  since they are user input.
- Fixed row height forces truncating the message in the list, pushing the
  full content to the side panel.
- The blocking theme script is code outside React, which needs to stay in
  sync with the provider.

## Revisit when

The application acquires genuinely global client state — multiple
investigation tabs open simultaneously, for example — at which point a
dedicated store would become justified.
