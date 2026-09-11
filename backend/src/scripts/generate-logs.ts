import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

type Format = 'gcp' | 'cloudwatch' | 'json-lines'

type Severity = 'info' | 'warn' | 'error' | 'debug'

type DegenerateKind = 'missing-severity' | 'empty-body'

type Rng = () => number

export type GenerateOptions = {
  readonly lines: number
  readonly format: Format
  readonly out: string
}

export type GenerationSummary = {
  readonly lines: number
  readonly degenerate: number
  readonly out: string
  readonly format: Format
}

type SyntheticEvent = {
  readonly sequence: number
  readonly timestamp: Date
  readonly service: string
  readonly severity: Severity | null
  readonly body: string
  readonly traceId: string
  readonly host: string
  readonly degenerate: DegenerateKind | null
}

const FORMATS: readonly Format[] = ['gcp', 'cloudwatch', 'json-lines']
const DEFAULT_LINES = 100_000
const DEFAULT_FORMAT: Format = 'json-lines'
const SAMPLE_SEED = 0x5eed
const WINDOW_MS = 48 * 60 * 60 * 1000
const DEGENERATE_INTERVAL = 40

const EXTENSION_BY_FORMAT: Readonly<Record<Format, string>> = {
  gcp: 'json',
  cloudwatch: 'json',
  'json-lines': 'jsonl',
}

const SERVICES: readonly string[] = [
  'checkout',
  'api-gateway',
  'billing',
  'auth-service',
  'search',
  'notifications',
  'inventory',
  'payments',
]

const SEVERITY_WEIGHTS: readonly (readonly [Severity, number])[] = [
  ['info', 55],
  ['warn', 25],
  ['error', 15],
  ['debug', 5],
]

const GCP_SEVERITY: Readonly<Record<Severity, string>> = {
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  debug: 'DEBUG',
}

const EMAIL_DOMAINS: readonly string[] = [
  'example.com',
  'mail.example.net',
  'corp.example.org',
]

const MESSAGE_TEMPLATES: readonly ((random: Rng) => string)[] = [
  (r) =>
    `payment gateway timeout after ${integer(r, 20, 8000)}ms for order ${integer(r, 1000, 999999)}`,
  (r) => `user ${uuid(r)} signed in from ${ipv4(r)}`,
  (r) =>
    `GET /api/orders/${integer(r, 1, 999999)}/items returned ${integer(r, 0, 500)} rows in ${integer(r, 1, 2000)}ms`,
  (r) => `cache miss for key session:${integer(r, 1, 200000)}`,
  (r) =>
    `failed to reach upstream ${ipv4(r)}:${integer(r, 1024, 65535)} after ${integer(r, 1, 12)} retries`,
  (r) => `email to ${email(r)} bounced with code ${integer(r, 400, 599)}`,
  (r) => `slow query took ${integer(r, 200, 15000)}ms on table orders`,
  (r) =>
    `rate limit exceeded for client ${uuid(r)} at ${integer(r, 100, 8000)} req per second`,
  (r) =>
    `disk usage on volume data-${integer(r, 1, 9)} reached ${integer(r, 60, 99)} percent`,
  (r) => `request ${uuid(r)} completed with status ${integer(r, 200, 504)}`,
  (r) =>
    `inventory reservation ${integer(r, 1, 999999)} released for sku ${hex(r, 16)}`,
  (r) => `background job ${uuid(r)} finished in ${integer(r, 5, 60000)}ms`,
  (r) =>
    `connection pool exhausted with ${integer(r, 1, 400)} pending acquisitions`,
  (r) => `token rejected for session ${hex(r, 24)}`,
]

const RENDERERS: Readonly<
  Record<Format, (event: SyntheticEvent) => string>
> = {
  gcp: renderGcpEntry,
  cloudwatch: renderCloudWatchEvent,
  'json-lines': renderJsonLine,
}

export async function generateLogFile(
  options: GenerateOptions,
): Promise<GenerationSummary> {
  const random = createSeededRandom(SAMPLE_SEED)
  const render = RENDERERS[options.format]
  const stream = createWriteStream(options.out, { encoding: 'utf8' })
  const startTime = Date.now() - WINDOW_MS
  let degenerate = 0

  for (let sequence = 0; sequence < options.lines; sequence += 1) {
    const event = buildEvent(sequence, options.lines, startTime, random)
    if (event.degenerate !== null) {
      degenerate += 1
    }
    if (!stream.write(`${render(event)}\n`)) {
      await once(stream, 'drain')
    }
  }

  stream.end()
  await once(stream, 'finish')

  return {
    lines: options.lines,
    degenerate,
    out: options.out,
    format: options.format,
  }
}

function buildEvent(
  sequence: number,
  total: number,
  startTime: number,
  random: Rng,
): SyntheticEvent {
  const degenerate = degenerateKind(sequence)
  const template = elementAt(
    MESSAGE_TEMPLATES,
    sequence % MESSAGE_TEMPLATES.length,
  )

  return {
    sequence,
    timestamp: eventTime(sequence, total, startTime, random),
    service: elementAt(SERVICES, integer(random, 0, SERVICES.length - 1)),
    severity: degenerate === 'missing-severity' ? null : pickSeverity(random),
    body: degenerate === 'empty-body' ? '' : template(random),
    traceId: hex(random, 32),
    host: `host-${hex(random, 8)}`,
    degenerate,
  }
}

function eventTime(
  sequence: number,
  total: number,
  startTime: number,
  random: Rng,
): Date {
  const progress = total <= 1 ? 0 : sequence / (total - 1)
  const ramped = Math.pow(progress, 1.3) * WINDOW_MS
  const jitter = (random() - 0.5) * (WINDOW_MS / 50)
  return new Date(startTime + clamp(ramped + jitter, 0, WINDOW_MS))
}

function degenerateKind(sequence: number): DegenerateKind | null {
  if (sequence === 0 || sequence % DEGENERATE_INTERVAL !== 0) {
    return null
  }
  return sequence % (DEGENERATE_INTERVAL * 2) === 0
    ? 'empty-body'
    : 'missing-severity'
}

function pickSeverity(random: Rng): Severity {
  const total = SEVERITY_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0)
  let ticket = random() * total
  for (const [severity, weight] of SEVERITY_WEIGHTS) {
    ticket -= weight
    if (ticket < 0) {
      return severity
    }
  }
  return 'info'
}

function renderJsonLine(event: SyntheticEvent): string {
  const record: Record<string, unknown> = {
    '@timestamp': event.timestamp.toISOString(),
    service: event.service,
    message: event.body,
    host: event.host,
    env: 'production',
    trace_id: event.traceId,
  }
  if (event.severity !== null) {
    record.level = event.severity
  }
  return JSON.stringify(record)
}

function renderGcpEntry(event: SyntheticEvent): string {
  const entry: Record<string, unknown> = {
    logName: `projects/log-platform/logs/${event.service}%2Fstderr`,
    timestamp: event.timestamp.toISOString(),
    resource: {
      type: 'cloud_run_revision',
      labels: { service_name: event.service, location: 'us-central1' },
    },
    textPayload: event.body,
    trace: `projects/log-platform/traces/${event.traceId}`,
    labels: { host: event.host },
  }
  if (event.severity !== null) {
    entry.severity = GCP_SEVERITY[event.severity]
  }
  return JSON.stringify(entry)
}

function renderCloudWatchEvent(event: SyntheticEvent): string {
  return JSON.stringify({
    logGroup: `/aws/lambda/${event.service}`,
    logStream: `2026/09/09/[$LATEST]${event.host}`,
    id: String(event.sequence + 1).padStart(56, '0'),
    timestamp: event.timestamp.getTime(),
    message: cloudWatchMessage(event),
  })
}

function cloudWatchMessage(event: SyntheticEvent): string {
  if (event.severity === null || event.sequence % 2 === 0) {
    return event.body
  }
  return JSON.stringify({ level: event.severity, msg: event.body })
}

function integer(random: Rng, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min
}

function ipv4(random: Rng): string {
  return [
    integer(random, 1, 254),
    integer(random, 0, 255),
    integer(random, 0, 255),
    integer(random, 1, 254),
  ].join('.')
}

function hex(random: Rng, length: number): string {
  let value = ''
  for (let position = 0; position < length; position += 1) {
    value += integer(random, 0, 15).toString(16)
  }
  return value
}

function uuid(random: Rng): string {
  const raw = hex(random, 32)
  return [
    raw.slice(0, 8),
    raw.slice(8, 12),
    raw.slice(12, 16),
    raw.slice(16, 20),
    raw.slice(20, 32),
  ].join('-')
}

function email(random: Rng): string {
  const domain = elementAt(
    EMAIL_DOMAINS,
    integer(random, 0, EMAIL_DOMAINS.length - 1),
  )
  return `user${integer(random, 1, 99999)}@${domain}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function elementAt<T>(items: readonly T[], position: number): T {
  const value = items[position]
  if (value === undefined) {
    throw new Error(`index ${position} out of range`)
  }
  return value
}

function createSeededRandom(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function readOptions(argv: string[]): GenerateOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      lines: { type: 'string' },
      format: { type: 'string' },
      out: { type: 'string' },
    },
  })

  const format = parseFormat(values.format)
  const out = values.out ?? `big-sample.${EXTENSION_BY_FORMAT[format]}`
  return {
    lines: parseLines(values.lines),
    format,
    out: resolve(process.env.INIT_CWD ?? process.cwd(), out),
  }
}

function parseLines(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_LINES
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--lines expects a positive integer, received "${raw}"`)
  }
  return value
}

function parseFormat(raw: string | undefined): Format {
  if (raw === undefined) {
    return DEFAULT_FORMAT
  }
  if (!isFormat(raw)) {
    throw new Error(
      `--format expects one of ${FORMATS.join(', ')}, received "${raw}"`,
    )
  }
  return raw
}

function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value)
}

function formatSummary(summary: GenerationSummary): string {
  return [
    `Generated ${summary.lines} lines (${summary.format}) → ${summary.out}`,
    `${summary.degenerate} degenerate records (missing severity or empty body)`,
    `Next: pnpm ingest ${summary.out}`,
    '',
  ].join('\n')
}

async function main(): Promise<void> {
  const summary = await generateLogFile(readOptions(process.argv.slice(2)))
  process.stdout.write(formatSummary(summary))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  }
}
