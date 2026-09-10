import { loadConfig } from '../platform/config'
import { prisma } from '../platform/prisma'

import { buildApp } from './app'

const config = loadConfig()
const app = await buildApp({ prisma })

await app.listen({ port: config.apiPort, host: '0.0.0.0' })
