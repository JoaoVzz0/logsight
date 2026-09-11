# Arquitetura do backend

Este documento descreve a estrutura real de `backend/src`, lida diretamente
do código. Onde o código diverge do que um ADR previu, o que está aqui é o
que existe hoje; a divergência é registrada explicitamente. O porquê de cada
decisão está em [ADR 0008](../adr/0008-domain-architecture.md) e
[ADR 0009](../adr/0009-data-access.md), linkados ao final.

## Os domínios

`backend/src/domains/` tem quatro subpastas, cada uma um domínio de negócio:

| Domínio | O que faz |
|---|---|
| `ingestion` | Recebe um arquivo de log, detecta o formato, faz o parse linha a linha, monta o `LogRecord` canônico, calcula o fingerprint e persiste em lote. Dono do `ImportJob`. |
| `issues` | Mantém o agregado `Issue`: agrupa ocorrências pelo fingerprint calculado na ingestão, com contadores e estado (`unresolved`, `resolved`, `ignored`). |
| `logs` | Projeção de leitura: listagem paginada de `LogRecord` com filtros e cursor. Só tem `queries/` e `http/`. |
| `analytics` | Projeção de leitura: agregações para o dashboard (taxa de erro, novos issues, picos, distribuição por serviço). Só tem `queries/` e `http/`. |

`logs` e `analytics` não têm `core/` nem `ports/` porque são projeções sobre
os outros dois domínios, não contextos com invariante própria. Ver a seção
"Leitura versus escrita" abaixo.

## Anatomia de um domínio

`ingestion` e `issues` seguem a forma completa:

```
domains/<nome>/
├─ core/         entidades, value objects, domain services
├─ ports/        interfaces
├─ application/  casos de uso
├─ infra/        implementações concretas dos ports
└─ http/         rotas Fastify
```

Em `ingestion`, todas as pastas têm código real:

```
ingestion/
├─ core/
│  ├─ log-record.ts           assembleLogRecord()
│  ├─ errors.ts
│  └─ services/
│     ├─ fingerprint.ts       computeFingerprint()
│     ├─ severity.ts
│     └─ adapter-selection.ts selectAdapter()
├─ ports/
│  ├─ log-source-adapter.ts   LogSourceAdapter
│  ├─ job-queue.ts            JobQueue
│  ├─ file-storage.ts         FileStorage
│  ├─ import-job-store.ts
│  └─ log-record-sink.ts
├─ application/
│  ├─ register-import-job.ts  registerImportJob()
│  ├─ run-import.ts           importJobHandler()
│  └─ ingest-log-file.ts      ingestLogFile()
├─ infra/
│  ├─ adapter-registry.ts     resolveAdapter()
│  ├─ adapters/
│  │  ├─ gcp-cloud-logging.ts
│  │  ├─ aws-cloudwatch.ts
│  │  └─ json-lines-adapter.ts
│  ├─ queue/in-process-job-queue.ts
│  ├─ storage/local-file-storage.ts
│  ├─ prisma-import-job-store.ts
│  └─ prisma-log-record-sink.ts
├─ http/
│  ├─ imports-routes.ts
│  └─ imports-schema.ts
└─ queries/
   ├─ list-imports.ts
   ├─ get-import.ts
   └─ import-status.ts
```

Em `issues`, `application/` e `http/` existem como pastas mas contêm apenas
um `.gitkeep`, sem código: o agregado é escrito diretamente pela camada de
`infra` de `ingestion` (ver o fluxo de ingestão abaixo), e não tem rotas
HTTP próprias hoje.

```
issues/
├─ core/
│  ├─ issue.ts                 Issue (agregado)
│  ├─ occurrence.ts
│  └─ services/aggregate-occurrences.ts
├─ ports/
│  └─ issue-repository.ts      IssueRepository
└─ infra/
   ├─ prisma-issue-repository.ts
   └─ in-memory-issue-repository.ts
```

Não há processo de worker separado: a importação roda dentro do processo
da `api`, em memória, atrás da porta `JobQueue` (ver "Fila de jobs"
abaixo). `docker-compose.yml` só sobe `postgres`, `api` e `web`.

## Núcleo hexagonal

A regra é única e verificável: **`core/` e `application/` não importam de
`infra/`, `http/` ou `platform/`**, nem os pacotes `fastify`,
`@prisma/client`, `bullmq` ou `ioredis` diretamente. Ela é imposta por
`no-restricted-imports` em `eslint.config.js`, escopada aos arquivos de
`backend/src/domains/*/core/**` e `backend/src/domains/*/application/**`:

```js
const domainBoundary = {
  'no-restricted-imports': ['error', {
    patterns: [
      { group: ['**/infra/**', '**/http/**', '**/platform/**', '@/platform/**'] },
    ],
    paths: [
      { name: 'fastify' }, { name: '@prisma/client' },
      { name: 'bullmq' }, { name: 'ioredis' },
    ],
  }],
}
```

A consequência aceita é que os tipos de domínio não são os tipos gerados
pelo Prisma. A conversão entre a linha persistida e a entidade acontece na
implementação do repositório, dentro de `infra/`. O mapper do agregado é a
função `toSnapshot()` em
`backend/src/domains/issues/infra/prisma-issue-repository.ts`, que traduz a
linha `Issue` do Prisma em um `IssueSnapshot` consumido por `Issue.restore()`.
É a conversão que mais importa, porque é a que protege o agregado de conhecer
o Prisma; as outras conversões entre linha e resposta acontecem nas projeções
de leitura, que por serem só leitura não passam pelo domínio.

## DDD tático seletivo

`Issue`, em `backend/src/domains/issues/core/issue.ts`, é o único agregado
do projeto com invariantes reais:

- `Issue.open(occurrence)` cria a partir da primeira ocorrência.
- `record(occurrence)` incrementa `eventCount`, estende `lastSeen` quando a
  nova ocorrência é mais recente, adiciona o serviço a `affectedServices`
  sem duplicar, e **reabre** o issue se ele estava `resolved`, marcando
  `regression = true`.
- `resolve(at)` só é permitido a partir de `unresolved`; fora disso lança
  `IllegalIssueTransitionError`.
- `ignore()` não tem pré-condição.
- `reopen()` só é permitido a partir de `ignored`.

`core/services/aggregate-occurrences.ts` agrupa um lote de ocorrências por
fingerprint e aplica `Issue.open`/`Issue.record` a cada grupo, restaurando o
issue existente quando há um.

O resto do domínio (`LogRecord`, filtros, paginação) é tratado como dado,
sem invariante a proteger, conforme ADR 0008.

## Leitura versus escrita

Escrita passa pelo núcleo: `ingest-log-file.ts` monta o `LogRecord`, calcula
o fingerprint, e a atualização do `Issue` passa pelas regras do agregado.

Leitura projeta SQL direto para o formato de resposta, sem hidratar
entidades:

- `domains/logs/queries/list-logs.ts`: usa o client nativo do Prisma
  (`findMany`), sem `$queryRaw`, com paginação por cursor composto
  `(timestamp, id)` implementada em `queries/cursor.ts`.
- `domains/analytics/queries/`: `by-service.ts`, `error-rate.ts` e
  `spikes.ts` usam `$queryRaw` (agregação com `date_trunc`,
  `generate_series`, janela `LAG`); `new-issues.ts` e `top-issues.ts` usam o
  client nativo (`findMany`, `groupBy`). Todo resultado de `$queryRaw` é
  validado com Zod antes de retornar (`errorRateRow`, `serviceVolumeRow`,
  `spikeRow`).

A única exceção fora de `analytics/` é o upsert em massa de `Issue` em
`prisma-issue-repository.ts`, que usa `$executeRaw` para o upsert
condicional em lote, comentado no próprio arquivo como a exceção deliberada
à regra.

## O fluxo de ingestão, de ponta a ponta

Nomes reais, na ordem em que o código executa:

1. `domains/ingestion/http/imports-routes.ts`: `POST /imports` lê o upload
   multipart e chama `registerImportJob()`.
2. `domains/ingestion/application/register-import-job.ts`:
   `registerImportJob()` grava o arquivo via `FileStorage.createWriteStream`,
   cria a linha do `ImportJob` via `ImportJobStore.create()`, e chama
   `JobQueue.enqueue(...)`.
3. `domains/ingestion/infra/queue/in-process-job-queue.ts`:
   `InProcessJobQueue.enqueue()` chama o handler registrado no mesmo
   processo, sem rede e sem fila externa.
4. `domains/ingestion/application/run-import.ts`: `importJobHandler()` abre
   o arquivo via `FileStorage.open()` e chama `ingestLogFile()`.
5. `domains/ingestion/application/ingest-log-file.ts`: `ingestLogFile()` lê
   o arquivo em stream, resolve o adapter via `resolveAdapter()`
   (`infra/adapter-registry.ts`, que usa `selectAdapter()` de
   `core/services/adapter-selection.ts`) e chama `adapter.parse(line)` para
   cada linha.
6. O adapter (por exemplo `infra/adapters/json-lines-adapter.ts`) monta um
   `LogRecordDraft` e chama `assembleLogRecord()`
   (`core/log-record.ts`), que por sua vez chama `computeFingerprint()`
   (`core/services/fingerprint.ts`) para calcular o fingerprint do registro.
7. A cada lote de ~5000 registros, `ingest-log-file.ts` chama
   `persistBatch()`, implementado em
   `infra/import-processing.ts` como uma única transação Prisma que chama,
   nessa ordem: `upsertIssues()` e depois `insertLogRecords()`.
8. `domains/issues/infra/prisma-issue-repository.ts`: `upsertIssues()`
   carrega os `Issue` existentes para os fingerprints do lote, chama
   `aggregateOccurrences()` (que aplica as regras do agregado) e grava o
   resultado com um upsert em massa.
9. `domains/ingestion/infra/prisma-log-record-sink.ts`: `insertLogRecords()`
   insere os `LogRecord` do lote com `createMany`.
10. `ingestLogFile()` reporta progresso via `ImportJobStore`
    (`prisma-import-job-store.ts`), consultado pelo frontend em
    `GET /imports/:id`.

`backend/src/cli/ingest.ts` é um segundo ponto de entrada (`pnpm ingest`)
que refaz essa mesma composição diretamente contra um `PrismaClient`, sem
passar por HTTP nem pela fila.

### Fila de jobs: o que está implementado

O ADR 0006 descreve a decisão implementada: ingestão assíncrona
**in-process**, atrás de um port `JobQueue`
(`domains/ingestion/ports/job-queue.ts`, com `enqueue()` e `onJob()`) com
uma única implementação, `InProcessJobQueue`
(`domains/ingestion/infra/queue/in-process-job-queue.ts`), que invoca o
handler no mesmo processo que recebeu o upload, sem bloquear a resposta.
Não há `import` de `bullmq` ou `ioredis` em nenhum arquivo de
`backend/src` (as duas únicas ocorrências desses nomes no código são a
própria regra de fronteira do ESLint e a string que a testa): BullMQ e
Redis foram avaliados e descontinuados por escopo, não estão presentes no
projeto.

Progresso e estado do job não fazem parte da porta `JobQueue`; vivem em
`ImportJobStore`, sobre a tabela `ImportJob`, consultada pelo frontend em
`GET /imports/:id`. A porta `JobQueue` isola apenas a entrega da mensagem
ao handler: trocar `InProcessJobQueue` por uma implementação sobre uma
fila real não exigiria mudar `application/` nem `core/`.

## Documentação relacionada

- [overview.md](overview.md), como o backend se conecta ao frontend.
- [ADR 0008](../adr/0008-domain-architecture.md), o porquê do monólito
  modular e do núcleo hexagonal.
- [ADR 0009](../adr/0009-data-access.md), o porquê de Prisma como padrão
  e SQL bruto restrito a `analytics/`.
- [ADR 0006](../adr/0006-asynchronous-ingestion.md), o porquê da ingestão
  in-process atrás da porta `JobQueue`.
- [testing-strategy.md](../testing-strategy.md), como cada camada é testada.