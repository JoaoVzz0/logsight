# Estratégia de testes

Este documento descreve o que é testado hoje, lido diretamente dos arquivos
de teste do repositório, não da política em si. A política que orienta essa
distribuição está em `.claude/rules/testing.md`; aqui o foco é o que existe
de fato, incluindo onde a prática diverge da política.

## Cobertura por escopo, não uniforme

A distribuição real dos 34 arquivos `*.test.ts` do backend confirma a
política de cobertura por área, não uniforme:

| Área | Arquivos de teste | Abordagem |
|---|---|---|
| `core/` (entidades, value objects, domain services) | 5 | test-first, casos de comportamento |
| `application/` (casos de uso) | 3 | fakes em memória dos ports, sem biblioteca de mock |
| `infra/` (adapters, repositórios) | 9 | fixtures reais, um arquivo por formato de origem |
| `queries/` (SQL analítico e de listagem) | 8 | contra um Postgres real, seedado por arquivo |
| `ports/` | 1 | contrato do port exercitado pela fake |
| `http/` | 4 | rotas Fastify, com `app.inject` |

No frontend, zero arquivos `*.test.tsx`: nenhum componente React tem teste
de unidade. Os 8 arquivos `*.test.ts` do frontend testam lógica pura
(`features/logs/model/filters.ts`, `features/analytics/model/time-range.ts`,
`features/imports/model/progress.ts`, o cliente de API) e três testes de
varredura de código-fonte (`no-literal-colors.test.ts`, um por feature) que
leem os arquivos `.tsx` como texto e verificam a ausência de cor literal,
sem renderizar componente algum.

O porquê: cobertura uniforme dentro de um orçamento de três dias produz
testes rasos em todo lugar. Concentrar o esforço onde a correção é difícil
de garantir e barata de testar (normalização de mensagem, mapeamento de
severidade, paginação por cursor sobre timestamp compartilhado) rende mais
do que espalhar o mesmo esforço por toda a base.

## Os testes de maior valor

**Fixtures de adapter.** `backend/src/domains/ingestion/infra/adapters/__fixtures__/`
guarda uma amostra real por formato: `gcp-cloud-logging.json` (dez cenários,
de `cloudRunError` a `noTimestamp`), `aws-cloudwatch.json` (uma exportação
de subscription filter, no formato real de log de uma Lambda) e
`json-lines.jsonl` (linhas no estilo pino/bunyan, incluindo uma linha
malformada e uma sem timestamp). Os testes de cada adapter carregam essas
fixtures e verificam o mapeamento para `LogRecord`, incluindo a
normalização de severidade.

**Casos de fingerprint.** `backend/src/domains/ingestion/core/services/fingerprint.test.ts`
tem o par de casos que importa: mensagens que devem agrupar (diferindo só
por UUID, IP, número, hexadecimal, timestamp, e-mail ou valor entre aspas)
e mensagens que não devem (mesmo formato mas serviço ou severidade
diferentes, ou uma diferença de caixa). Um `vi.mock` (o único do backend)
espiona `tokenizeMessage` sem trocar seu comportamento, só para provar que
o fingerprint deriva do tokenizador compartilhado em vez de duplicar as
regras.

**Colisão de cursor.** `backend/src/domains/logs/queries/list-logs.test.ts`,
`it('returns three records sharing one timestamp exactly once across the
page boundary', ...)`: semeia três registros no mesmo timestamp, pagina com
`limit: 2` cruzando a fronteira, e confirma que a sequência de ids não
repete nem pula nenhum. Esse é o modo de falha que um cursor baseado só em
timestamp produz.

**Caminho crítico ponta a ponta.** Aqui a prática diverge do que a política
descreve, e vale registrar a divergência (ver seção seguinte).

## Ports testados com fakes em memória, nunca com mock

Os testes de `application/` (`ingest-log-file.test.ts`,
`register-import-job.test.ts`, `run-import.test.ts`) implementam classes
fake por arquivo (`RecordingIssueRepository`, `RecordingImportJobStore`,
`StubAdapter`, etc.) que satisfazem a interface do port diretamente, em vez
de usar uma biblioteca de mock. Uma busca por `vi.mock`, `jest.mock` ou
`sinon` em `application/` e `ports/` não encontra nenhum resultado.

Existe também uma fake reutilizável do repositório de issues,
`backend/src/domains/issues/infra/in-memory-issue-repository.ts`, com seu
próprio teste. Ela não é a que os testes de caso de uso importam hoje (cada
um define a sua própria fake local), mas é a segunda implementação que
justifica a existência do port `IssueRepository`.

## Testes de banco contra um Postgres real

Os 8 arquivos de `queries/` (mais os testes de `prisma-issue-repository.ts`
e de `list-logs.ts`) instanciam `new PrismaClient()` e rodam contra o
Postgres do `docker-compose.yml`, semeando e limpando os dados a cada
arquivo (`beforeEach` apagando as tabelas envolvidas, ou o helper
`seedAnalytics`/`resetAnalyticsData` compartilhado pelos testes de
`analytics/`). `backend/vitest.config.ts` roda os arquivos sem paralelismo
(`fileParallelism: false`) exatamente porque dividem o mesmo banco. Nenhum
teste de `queries/` mocka o banco: a SQL sob teste é a SQL real, incluindo
as três consultas que usam `$queryRaw`
(`by-service.ts`, `error-rate.ts`, `spikes.ts`).

## O que diverge da política documentada

`.claude/rules/testing.md` descreve o caminho crítico como "um E2E de
Playwright: upload de um arquivo, o job completa, o issue aparece na
lista". Isso não existe no repositório hoje.

O que existe:

- Dois specs Playwright, `frontend/e2e/dashboard.spec.ts` (13 testes) e
  `frontend/e2e/logs.spec.ts` (21 testes), cobrindo o comportamento das
  telas de dashboard e de logs, mas contra respostas de API
  **interceptadas e simuladas** via `page.route(...)`, nunca contra um
  backend real.
- O fluxo real de upload até o registro aparecer na listagem é coberto,
  mas como teste de integração do backend, não como E2E de interface:
  `backend/src/domains/ingestion/http/imports-routes.test.ts`,
  `it('uploads a file, completes the job and surfaces the records in the
  log list', ...)`, que sobe a aplicação Fastify real, grava em um Postgres
  real, espera o job chegar a `completed` por polling em `GET
  /imports/:id`, e confirma o resultado em `GET /logs`.
- Esse teste verifica `GET /logs`, não um endpoint de issues: o domínio
  `issues` não tem rotas HTTP hoje
  (`backend/src/domains/issues/http/` só tem um `.gitkeep`), e a tela
  `/issues` do frontend é um placeholder sem busca de dados (ver
  [frontend.md](architecture/frontend.md)). O que um usuário vê hoje como
  "novos issues" é o card do dashboard alimentado por
  `domains/analytics/queries/new-issues.ts`.

Registrar isso aqui em vez de descrever o E2E como se existisse é a mesma
regra que orienta o resto desta documentação: descrever o código como ele
é.

## Documentação relacionada

- `.claude/rules/testing.md`, a política de cobertura por escopo e as
  convenções de fixture.
- [architecture/backend.md](architecture/backend.md), a estrutura de
  domínios que os testes de `core/`, `application/`, `infra/` e `queries/`
  cobrem.
- [architecture/frontend.md](architecture/frontend.md), o estado atual da
  feature `issues/`, relevante para entender a lacuna do E2E.
