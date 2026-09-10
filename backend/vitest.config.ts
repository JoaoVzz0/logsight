import { defineConfig } from 'vitest/config'

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://logs:logs@localhost:5432/logs'

export default defineConfig({
  test: {
    env: { DATABASE_URL: databaseUrl },
  },
})
