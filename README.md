# logview

## O que é

Uma plataforma de análise de logs. Importa arquivos de fontes heterogêneas
(GCP Cloud Logging, AWS CloudWatch, JSON Lines), normaliza cada registro
para um modelo canônico baseado no OpenTelemetry Logs Data Model, agrupa
ocorrências por fingerprint no estilo Sentry (a mesma falha, com variações
irrelevantes de UUID, IP ou duração, vira um problema, não milhares de
linhas soltas), e expõe consulta com filtros e busca, upload com
acompanhamento de progresso, e um dashboard com métricas derivadas do
agrupamento.

## Inspirações

- **Sentry**, pelo agrupamento de eventos por fingerprint e pela ideia de
  que o produto é "o que está quebrado", não "quantas linhas existem".
- **Datadog e Grafana**, pela densidade de informação e pelo tema escuro
  como padrão, adequados a uma ferramenta de observabilidade usada por
  quem já sabe o que está procurando.

## Funcionalidades

| Do desafio | Como está implementado hoje |
|---|---|
| Importação de arquivos | Upload multipart em `/imports`, com detecção automática de formato e opção de forçar a origem. |
| Processamento e classificação automática | Cada linha passa por um adapter (GCP, CloudWatch, JSON Lines), normaliza severidade para a escala OTel e recebe um fingerprint que agrupa ocorrências da mesma falha em um `Issue`. |
| Armazenamento estruturado | PostgreSQL, colunas tipadas para o núcleo do registro e JSONB para o restante, com o texto original preservado em `raw`. |
| Consulta em tabela responsiva | Tela `/logs`, tabela virtualizada (`@tanstack/react-virtual`), altura de linha fixa. |
| Filtros por nível, data e conteúdo | Nível, intervalo de tempo e serviço, todos como `searchParams` na URL, então uma visão é compartilhável por link. |
| Busca textual | Campo de busca sobre o corpo da mensagem, indexado com `pg_trgm`. |
| Scroll infinito | `IntersectionObserver` sobre um elemento sentinela, sem paginação numerada. |
| Dashboard com indicadores e gráficos | Um card por métrica na tela inicial, cada um com sua própria consulta, carregamento e estado de erro. |
| Tendências e distribuição | Taxa de erro ao longo do tempo, novos issues na janela, issues em pico (crescimento anômalo) e distribuição por serviço. |

Um ponto a declarar sem rodeio: a tela dedicada de navegação por issue a
issue (`/issues`, com lista e detalhe por fingerprint) prevista no desenho
de frontend ainda não tem implementação, apenas a rota existe. O
agrupamento e as métricas derivadas dele já funcionam e aparecem no
dashboard; o que falta é a tela de exploração issue por issue. Detalhes em
[docs/architecture/frontend.md](docs/architecture/frontend.md).

## Como rodar

Com Docker (único pré-requisito: Docker e Docker Compose):

```bash
cp .env.example .env
docker compose up
```

- Web em `http://localhost:5173`
- API em `http://localhost:3333`
- Documentação interativa da API em `http://localhost:3333/docs`

Sem containers, para desenvolvimento local:

```bash
pnpm install
docker compose up postgres -d
pnpm --filter backend prisma:migrate
pnpm dev
```

`pnpm dev` sobe a API e o frontend em paralelo (`pnpm --parallel --filter
"./backend" --filter "./frontend" dev`). Não há processo de worker separado
para subir: a importação roda dentro do próprio processo da API. Ver
[docs/architecture/backend.md](docs/architecture/backend.md#fila-de-jobs-o-que-está-implementado)
para o porquê.

Depois de alterar uma rota ou seu schema, regenere o cliente tipado que o
frontend consome:

```bash
pnpm generate:client
```

Isso lê as rotas do backend, escreve `packages/api-client/openapi.json` e
regenera `packages/api-client/src`. Os dois são artefatos gerados,
versionados no repositório; nunca são editados à mão.

## Testando com volume

Para avaliar o comportamento sob grande volume de dados, o repositório traz
um gerador de log sintético e uma ingestão via linha de comando,
independentes da interface:

```bash
pnpm generate:logs --lines 1000000 --format json-lines --out big-sample.jsonl
pnpm ingest big-sample.jsonl
```

`generate:logs` escreve em stream (um milhão de linhas leva segundos, não
minutos) e varia serviço, severidade e valores de variável entre os
registros, de forma que a normalização produza muitos fingerprints
distintos, com uma fração de registros degenerados (severidade ausente,
corpo vazio) e timestamps espalhados pelos últimos sete dias.

`pnpm ingest` roda o mesmo pipeline de ingestão usado pelo upload HTTP,
reportando progresso no terminal (linhas processadas, erros de parse,
registros por segundo ao final). Ambos os comandos também funcionam dentro
dos containers:

```bash
docker compose exec api node dist/scripts/generate-logs.js --lines 1000000 --format gcp
docker compose exec api node dist/cli/ingest.js /app/big-sample.jsonl
```

## Documentação

- [docs/architecture/overview.md](docs/architecture/overview.md): visão de
  conjunto, como backend e frontend se conectam, o fluxo de ingestão de
  ponta a ponta.
- [docs/architecture/backend.md](docs/architecture/backend.md): os
  domínios do backend, o núcleo hexagonal, a fronteira travada por ESLint,
  leitura versus escrita.
- [docs/architecture/frontend.md](docs/architecture/frontend.md): a
  organização por feature, estado (servidor, URL, local), tabela
  virtualizada, tema e acessibilidade.
- [docs/testing-strategy.md](docs/testing-strategy.md): o que é testado em
  cada camada, os testes de maior valor, e onde a prática diverge da
  política declarada.
- [docs/adr/](docs/adr/): as decisões arquiteturais pontuais, com as
  alternativas consideradas e descartadas. Os documentos de arquitetura
  acima explicam a estrutura atual; os ADRs explicam por que cada escolha
  foi feita.
- [docs/development-process.md](docs/development-process.md): como o
  trabalho foi conduzido.

## Qualidade

```bash
pnpm check      # tsc --build --noEmit && eslint, incluindo a regra de fronteira de domínio
pnpm test       # vitest, unitário e de integração
pnpm test:e2e   # playwright
```

`pnpm check` precisa passar antes de qualquer commit.

## Estrutura

```
backend                    Fastify + processamento de importação, núcleo hexagonal (docs/architecture/backend.md)
frontend                   React, Vite
packages/api-client        cliente OpenAPI gerado, o contrato de API (docs/adr/0012)
packages/domain-constants  constantes de domínio compartilhadas (escala de severidade OTel)
```

## Screenshots

_A preencher._
