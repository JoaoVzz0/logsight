# Architecture Decision Records

Este diretório registra as decisões arquiteturais relevantes do projeto,
no formato ADR (Architecture Decision Record).

Cada ADR responde três perguntas: qual era o contexto, o que foi decidido,
e o que foi descartado e por quê. O objetivo não é justificar escolhas a
posteriori, e sim deixar explícito o raciocínio — inclusive onde a decisão
foi um trade-off consciente contra o prazo do desafio.

## Formato

Cada registro segue a estrutura:

- **Contexto** — a força que motivou a decisão
- **Decisão** — o que foi escolhido
- **Alternativas consideradas** — o que foi avaliado e descartado
- **Consequências** — o que ganhamos e o que pagamos
- **Revisitar quando** — o gatilho que invalida a decisão

## Índice

| # | Decisão | Status |
|---|---|---|
| [0001](0001-stack-da-aplicacao.md) | TypeScript fim a fim, com Fastify no backend | Aceita |
| [0002](0002-modelo-canonico-de-log.md) | Modelo canônico de log baseado em OpenTelemetry | Aceita |
| [0003](0003-postgresql-como-store-principal.md) | PostgreSQL com JSONB como armazenamento principal | Aceita |
| [0004](0004-adapters-por-fonte.md) | Adapters por fonte, com detecção automática de formato | Aceita |
| [0005](0005-agrupamento-por-fingerprint.md) | Agrupamento de eventos por fingerprint | Aceita |
| [0006](0006-ingestao-assincrona.md) | Ingestão assíncrona com BullMQ sobre Redis | Aceita |
| [0007](0007-execucao-e-deploy.md) | Docker Compose como entrega, cloud como demonstração | Aceita |
| [0008](0008-arquitetura-de-dominio.md) | Monólito modular com núcleo hexagonal | Aceita |
| [0009](0009-acesso-a-dados.md) | Prisma como camada de acesso, com SQL cru nas agregações | Aceita |
| [0010](0010-arquitetura-de-frontend.md) | Arquitetura de frontend: URL como estado, tabela virtualizada | Aceita |
| [0011](0011-legibilidade-e-acessibilidade.md) | Legibilidade de log e acessibilidade | Aceita |
| [0012](0012-contrato-de-api.md) | Contrato de API por OpenAPI gerado, com cliente versionado no repositório | Aceita |

O ADR 0001 foi revisado após a decisão inicial por NestJS ser reconsiderada;
a versão atual registra a escolha por Fastify e o motivo da mudança.

## Escopo temporal

Todas as decisões foram tomadas sob a restrição de **3 dias corridos**.
Onde essa restrição foi determinante, o ADR diz isso explicitamente em vez
de fingir que a escolha seria a mesma sem prazo.
