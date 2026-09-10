import { useQuery } from '@tanstack/react-query'

import { fetchImports } from '../api/list-imports'

const POLL_INTERVAL_MS = 1_500

export function useImportHistory() {
  return useQuery({
    queryKey: ['imports'],
    queryFn: fetchImports,
    refetchInterval: (query) => {
      const stillProcessing = query.state.data?.some(
        (entry) => entry.status === 'pending' || entry.status === 'running',
      )
      return stillProcessing === true ? POLL_INTERVAL_MS : false
    },
  })
}
