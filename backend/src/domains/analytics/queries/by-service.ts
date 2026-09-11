import type { PrismaClient } from '@prisma/client'
import { SEVERITY_NUMBER } from 'domain-constants'
import { z } from 'zod'

import type { TimeWindow } from './time-window'

export type ServiceVolume = {
  readonly serviceName: string
  readonly total: number
  readonly errors: number
}

export type ByServiceResult = {
  readonly services: ServiceVolume[]
}

const serviceVolumeRow = z.object({
  serviceName: z.string(),
  total: z.coerce.number(),
  errors: z.coerce.number(),
})

export async function byService(
  prisma: PrismaClient,
  window: TimeWindow,
): Promise<ByServiceResult> {
  const from = new Date(window.from)
  const to = new Date(window.to)

  const rawRows: unknown = await prisma.$queryRaw`
    SELECT
      coalesce(service_name, 'unknown') AS "serviceName",
      count(*) AS total,
      count(*) FILTER (
        WHERE severity_number >= ${SEVERITY_NUMBER.ERROR}
      ) AS errors
    FROM log_records
    WHERE timestamp >= ${from} AND timestamp < ${to}
    GROUP BY coalesce(service_name, 'unknown')
    ORDER BY total DESC
  `

  return { services: serviceVolumeRow.array().parse(rawRows) }
}
