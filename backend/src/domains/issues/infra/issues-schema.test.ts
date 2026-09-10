import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.logRecord.deleteMany()
  await prisma.issue.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('issues.severity_number', () => {
  it('persists an issue grouped from records whose severity is undeterminable', async () => {
    await prisma.issue.create({
      data: {
        fingerprint: 'fp-null-severity',
        sampleMessage: 'line with no determinable severity',
        severityNumber: null,
        firstSeen: new Date('2026-09-08T10:00:00.000Z'),
        lastSeen: new Date('2026-09-08T10:00:00.000Z'),
        eventCount: 1n,
        affectedServices: [],
      },
    })

    const row = await prisma.issue.findUniqueOrThrow({
      where: { fingerprint: 'fp-null-severity' },
    })

    expect(row.severityNumber).toBeNull()
  })
})
