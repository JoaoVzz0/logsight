# Frontend rules

Operational form of ADR 0010 and ADR 0011.

## State

| Kind | Mechanism |
|---|---|
| Server state | TanStack Query |
| Filters, time range, search | URL `searchParams` |
| Local UI state | `useState` |

Filters live in the URL. A view is shareable by link — that is the working
behavior of the tool, not a nicety. `searchParams` are user input and are
validated with Zod on read.

No global client state manager. If something appears to need one, it is
almost certainly server state or URL state.

## `useEffect`

Allowed only to synchronize with an external system — an `addEventListener`
for keyboard shortcuts is the legitimate case in this project.

Never used to derive state or to sync state with state. Replacements:

| Situation | Use |
|---|---|
| Fetching data | TanStack Query |
| Filters | `useSearchParams` as the source of truth |
| Derived list | compute during render; `useMemo` only after measuring |
| Reset on filter change | `key` prop, remounting |
| Import progress | `refetchInterval` on the query |
| Infinite scroll | `IntersectionObserver` via callback ref |
| System theme preference | `useSyncExternalStore` over `matchMedia` |

## Re-renders

The real cost is the filter re-rendering virtualized rows on every keystroke.
Mitigations, applied after profiling rather than preemptively: debounce
before writing to the URL, and `React.memo` on the row with primitive props.

Do not add memoization without a measurement that justifies it.

## Colors and theme

Every color comes from a CSS variable. A literal hex in a component is a
review blocker — it will not switch themes. This includes chart colors:
Recharts reads `hsl(var(--severity-error))`, never a literal.

Theme has three states (`light`, `dark`, `system`), applied by a blocking
script before first paint.

## Components

- Extract on the third occurrence, not the second
- A component owning both data fetching and presentation is acceptable at
  page level, not below it
- Shared primitives come from `shared/ui/` (shadcn); do not re-implement a
  button, dialog or select
- Props are explicit — no spreading unknown props onto DOM elements

## Table

- Fixed row height. Variable height breaks virtualization measurement
- Detail opens in a side panel, never expanded inline
- Composite cursor `(timestamp, id)` — a timestamp-only cursor skips or
  duplicates rows that share a millisecond
- Filters compose the `queryKey`; changing one resets pagination

## Dashboard

One query per card. Each card loads, fails and shows its skeleton
independently.

Total log count is not displayed as a headline metric. It is the vanity
metric ADR 0005 rejects, and showing it would contradict the decision the
product is built on.

## Accessibility

- Virtualized list declares `role="grid"` with a real `aria-rowcount`, and
  each row declares `aria-rowindex`. Without this a screen reader announces
  the window size, not the dataset size
- Severity is never conveyed by color alone — color plus text label plus a
  distinctly shaped icon
- Contrast is verified against both themes
- Arrow keys traverse the table, `Enter` opens detail, `Esc` closes
- Focus is always visible; outlines are not removed without a replacement
- `aria-live="polite"` on import progress
- `prefers-reduced-motion` disables panel transitions

## Required states

Empty, error and loading on every surface. Empty is a call to action, not a
blank table. Error names what failed and offers a retry. Loading uses a
skeleton shaped like the content, not a centered spinner.
