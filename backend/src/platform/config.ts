export type Config = {
  readonly apiPort: number
  readonly databaseUrl: string
}

const DEFAULT_API_PORT = 3333

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error('DATABASE_URL is required')
  }

  return {
    databaseUrl,
    apiPort: readPort(env.API_PORT) ?? DEFAULT_API_PORT,
  }
}

function readPort(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') {
    return undefined
  }

  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`API_PORT must be a positive integer, received "${raw}"`)
  }

  return value
}
