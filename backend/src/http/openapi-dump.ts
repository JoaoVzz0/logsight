import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import fastify from 'fastify'
import fastifySwagger from '@fastify/swagger'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'

const outputPath = fileURLToPath(
  new URL('../../../packages/api-client/openapi.json', import.meta.url),
)

async function dumpOpenApi(): Promise<void> {
  const app = fastify()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(fastifySwagger, {
    openapi: {
      info: { title: 'log-platform API', version: '0.0.0' },
    },
    transform: jsonSchemaTransform,
  })

  await app.ready()
  writeFileSync(outputPath, `${JSON.stringify(app.swagger(), null, 2)}\n`)
  await app.close()
}

await dumpOpenApi()
