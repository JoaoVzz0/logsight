export function formatEventCount(count: number): string {
  return `${count} ${count === 1 ? 'event' : 'events'}`
}
