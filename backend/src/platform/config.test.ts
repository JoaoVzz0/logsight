import { describe, expect, it } from 'vitest'

import { loadConfig } from './config'

describe('loadConfig', () => {
  it('reads the api port and database url from the environment and requires the database url', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://logs:logs@localhost:5432/logs',
      API_PORT: '4000',
    })

    expect(config).toEqual({
      databaseUrl: 'postgresql://logs:logs@localhost:5432/logs',
      apiPort: 4000,
    })
    expect(() => loadConfig({ API_PORT: '4000' })).toThrow()
  })
})
