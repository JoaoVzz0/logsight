export function ariaRowCount(loadedRows: number, hasNextPage: boolean): number {
  return hasNextPage ? -1 : loadedRows
}
