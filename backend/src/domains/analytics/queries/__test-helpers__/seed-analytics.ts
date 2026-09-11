import type { PrismaClient } from '@prisma/client'

export type SeedIssue = {
  readonly fingerprint: string
  readonly sampleMessage?: string
  readonly severityNumber?: number | null
  readonly firstSeen: string
  readonly eventCount?: number
  readonly affectedServices?: readonly string[]
}

export type SeedRecord = {
  readonly fingerprint: string
  readonly ts: string
  readonly severityNumber?: number | null
  readonly serviceName?: string | null
}

export async function seedAnalytics(
  prisma: PrismaClient,
  data: {
    readonly issues: readonly SeedIssue[]
    readonly records: readonly SeedRecord[]
  },
): Promise<void> {
  const job = await prisma.importJob.create({
    data: { filename: 'seed', storageKey: 'seed', sizeBytes: 1n },
  })

  await prisma.issue.createMany({
    data: data.issues.map((issue) => ({
      fingerprint: issue.fingerprint,
      sampleMessage: issue.sampleMessage ?? issue.fingerprint,
      severityNumber: issue.severityNumber ?? null,
      firstSeen: new Date(issue.firstSeen),
      lastSeen: new Date(issue.firstSeen),
      eventCount: BigInt(issue.eventCount ?? 0),
      affectedServices: [...(issue.affectedServices ?? [])],
    })),
  })

  await prisma.logRecord.createMany({
    data: data.records.map((record, index) => ({
      timestamp: new Date(record.ts),
      observedAt: new Date(record.ts),
      severityNumber: record.severityNumber ?? null,
      severityText: null,
      body: `record ${index}`,
      serviceName: record.serviceName ?? null,
      host: null,
      environment: null,
      traceId: null,
      spanId: null,
      attributes: {},
      sourceType: 'json-lines',
      fingerprint: record.fingerprint,
      raw: `raw ${index}`,
      importJobId: job.id,
    })),
  })
}

export async function resetAnalyticsData(prisma: PrismaClient): Promise<void> {
  await prisma.logRecord.deleteMany()
  await prisma.issue.deleteMany()
  await prisma.importJob.deleteMany()
}
