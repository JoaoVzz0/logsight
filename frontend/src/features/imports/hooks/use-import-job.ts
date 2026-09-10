import { useQuery } from '@tanstack/react-query'

import { fetchImport } from '../api/get-import'
import { isTerminal } from '../model/progress'

const POLL_INTERVAL_MS = 1_500

export function useImportJob(jobId: string) {
  return useQuery({
    queryKey: ['import', jobId],
    queryFn: () => fetchImport(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status !== undefined && isTerminal(status)) {
        return false
      }
      return POLL_INTERVAL_MS
    },
  })
}
