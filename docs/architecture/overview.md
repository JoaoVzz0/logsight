# Visão geral da arquitetura

Este documento explica como as peças do sistema se encaixam. As decisões
que justificam cada escolha estão nos ADRs listados ao final; aqui o foco é
estrutura, não motivo.

## Forma do sistema

Um monólito modular, dividido em dois processos que rodam separadamente:

- **backend** (`backend/`): Fastify, com um núcleo hexagonal por domínio de
  negócio. Expõe HTTP e roda o processamento de importação. Ver
  [backend.md](backend.md).
- **frontend** (`frontend/`): React com Vite, organizado por feature. Ver
  [frontend.md](frontend.md).

Os dois lados não compartilham tipos por importação direta de código. A
ponte é um contrato gerado: o backend expõe um documento OpenAPI a partir
das rotas Fastify e dos schemas Zod, e o frontend consome um cliente
TypeScript gerado a partir desse documento (`packages/api-client`, gerado
por `openapi-typescript`, nunca editado à mão). Rodar `pnpm generate:client`
depois de alterar uma rota regenera `packages/api-client/openapi.json` e
`packages/api-client/src`. Ver ADR 0012.

Um terceiro pacote, `packages/domain-constants`, guarda apenas constantes de
domínio que não são parte do contrato de transporte (hoje, a escala de
severidade OTel), consumido pelos dois lados.

## Fluxo de ingestão, de ponta a ponta

```
arquivo enviado (upload ou CLI)
        │
        ▼
detecção de formato (LogSourceAdapter.detect por amostra)
        │
        ▼
parse linha a linha (LogSourceAdapter.parse)
   ├─ linha válida  → LogRecordDraft
   └─ linha inválida → ParseError (contabilizado, não interrompe o import)
        │
        ▼
assembleLogRecord: monta o LogRecord canônico e calcula o fingerprint
        │
        ▼
lote acumulado em memória (batch de ~5000 registros)
        │
        ▼
uma transação por lote:
   ├─ upsert de Issue por fingerprint (agrega ocorrências, contadores)
   └─ insert em massa dos LogRecord do lote
        │
        ▼
progresso do ImportJob reportado (linhas processadas, erros de parse)
        │
        ▼
telas: lista de logs, dashboard, histórico de importação
```

Cada etapa está descrita com nomes de arquivo reais em
[backend.md](backend.md#o-fluxo-de-ingestão-de-ponta-a-ponta).

Um ponto de atenção: o ADR 0006 descreve esse fluxo rodando sobre BullMQ e
Redis, com um worker separado. O código atual implementa a porta `JobQueue`
com um único adaptador em processo (`InProcessJobQueue`); não há worker
separado nem fila externa. Os detalhes e o porquê da divergência estão em
[backend.md](backend.md#fila-de-jobs-o-que-está-implementado).

## Leitura versus escrita

A escrita (importação, agrupamento por fingerprint, ciclo de vida de um
`Issue`) passa pelo núcleo de domínio descrito em backend.md. A leitura
(tabela de logs, métricas do dashboard) projeta SQL diretamente para o
formato de resposta, sem passar por entidades. Essa assimetria é
deliberada; ver ADR 0008 e ADR 0009 para o porquê.

## Documentação relacionada

- [backend.md](backend.md), estrutura do backend: domínios, núcleo
  hexagonal, fronteira travada por ESLint, leitura versus escrita.
- [frontend.md](frontend.md), estrutura do frontend: organização por
  feature, estado, tabela virtualizada, tema e acessibilidade.
- [testing-strategy.md](../testing-strategy.md), o que é testado e onde.
- [docs/adr/](../adr/), as decisões arquiteturais e as alternativas
  descartadas. Relevantes para esta visão geral:
  [ADR 0001](../adr/0001-stack-da-aplicacao.md) (stack),
  [ADR 0008](../adr/0008-arquitetura-de-dominio.md) (monólito modular e
  núcleo hexagonal), [ADR 0009](../adr/0009-acesso-a-dados.md) (acesso a
  dados), [ADR 0012](../adr/0012-contrato-de-api.md) (contrato de API).
- [docs/development-process.md](../development-process.md), como o trabalho
  foi conduzido.
