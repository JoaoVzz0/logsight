import type { LogSourceAdapter } from '../../ports/log-source-adapter'

/**
 * Picks the adapter that claims the sample with the highest `detect` score.
 * On a tie for the top score the earlier adapter in `adapters` wins, unless
 * the designated `fallback` is itself at that score. The `fallback` also wins
 * whenever no adapter scores above it, so a sample nothing recognizes still
 * resolves.
 */
export function selectAdapter(
  adapters: readonly LogSourceAdapter[],
  fallback: LogSourceAdapter,
  sample: string[],
): LogSourceAdapter {
  const ranked = adapters
    .map((adapter) => ({ adapter, score: adapter.detect(sample) }))
    .sort((first, second) => second.score - first.score)

  const leader = ranked[0]
  if (leader === undefined || fallback.detect(sample) >= leader.score) {
    return fallback
  }

  return leader.adapter
}
