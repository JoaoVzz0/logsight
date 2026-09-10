import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { buildApp } from './app'

const outputPath = fileURLToPath(
  new URL('../../../packages/api-client/openapi.json', import.meta.url),
)

const app = await buildApp({ prisma: new PrismaClient() })
await app.ready()
writeFileSync(outputPath, `${JSON.stringify(app.swagger(), null, 2)}\n`)
await app.close()
