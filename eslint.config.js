import tsParser from '@typescript-eslint/parser'

const domainBoundary = {
  'no-restricted-imports': ['error', {
    patterns: [
      {
        group: ['**/infra/**', '**/http/**', '**/platform/**', '@/platform/**'],
        message: 'core and application must not depend on infra, http or platform',
      },
    ],
    paths: [
      { name: 'fastify', message: 'domain must not import a framework' },
      { name: '@prisma/client', message: 'domain must not import a driver' },
      { name: 'bullmq', message: 'domain must not import a queue client' },
      { name: 'ioredis', message: 'domain must not import a driver' },
    ],
  }],
}

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsParser, ecmaVersion: 2023, sourceType: 'module' },
  },
  {
    files: [
      'backend/src/domains/*/core/**/*.ts',
      'backend/src/domains/*/application/**/*.ts',
    ],
    rules: domainBoundary,
  },
]
