# logsight

## O que é

Uma plataforma de análise de logs. Ela importa arquivos de fontes diferentes
(GCP Cloud Logging, AWS CloudWatch, JSON Lines), normaliza cada registro para
um modelo canônico baseado no OpenTelemetry Logs Data Model, agrupa
ocorrências por fingerprint no estilo Sentry, e expõe consulta com filtros e
busca, upload com acompanhamento de progresso, e um dashboard com métricas
derivadas do agrupamento.

O agrupamento é o coração do projeto: a mesma falha, com variações que não
importam (um UUID diferente, um IP, uma duração), vira um problema só, não
milhares de linhas soltas. É o que transforma um milhão de linhas em algumas
centenas de problemas acionáveis.

## Telas

_Screenshots aqui — Logs, Dashboard e Imports. Substitua estas linhas pelas
imagens, por exemplo:_

```
![Logs](docs/screenshots/logs.png)
![Dashboard](docs/screenshots/dashboard.png)
![Imports](docs/screenshots/imports.png)
```

## Inspirações

Sentry, pelo agrupamento de eventos por fingerprint e pela ideia de que o
produto é "o que está quebrado", não "quantas linhas existem".

Datadog e Grafana, pela densidade de informação e pelo tema escuro como
padrão, que é o que faz sentido numa ferramenta de observabilidade usada por
quem já sabe o que está procurando.

## Funcionalidades

| Do desafio | Como está implementado |
|---|---|
| Importação de arquivos | Upload multipart em `/imports`, com detecção automática de formato e opção de forçar a origem. |
| Processamento e classificação automática | Cada linha passa por um adapter (GCP, CloudWatch, JSON Lines), normaliza a severidade para a escala OTel e recebe um fingerprint que agrupa ocorrências da mesma falha em um `Issue`. |
| Armazenamento estruturado | PostgreSQL, com colunas tipadas para o núcleo do registro e JSONB para o restante, preservando o texto original em `raw`. |
| Consulta em tabela responsiva | Tela `/logs`, tabela virtualizada (`@tanstack/react-virtual`), altura de linha fixa. |
| Filtros por nível, data e conteúdo | Nível, intervalo de tempo e serviço, todos como `searchParams` na URL, então uma visão é compartilhável por link. |
| Busca textual | Campo de busca sobre o corpo da mensagem, indexado com `pg_trgm`. |
| Scroll infinito | `IntersectionObserver` sobre um elemento sentinela, sem paginação numerada. |
| Dashboard com indicadores e gráficos | Um card por métrica na tela inicial, cada um com a própria consulta, carregamento e estado de erro. |
| Tendências e distribuição | Taxa de erro ao longo do tempo, novos issues na janela, issues em pico (crescimento anômalo) e distribuição por serviço. |

Uma coisa que vale ser direta: a tela `/issues` tem hoje a lista de issues
agrupados, com filtro por status e severidade, mas ainda não tem o detalhe
por ocorrência (timeline, trace) nem as ações de resolver/ignorar pela UI.
Isso está descrito como evolução em
[docs/development-process.md](docs/development-process.md).

## Como rodar

Com Docker, que é o único pré-requisito:

```bash
cp .env.example .env
docker compose up
```

Obs: em instalações antigas, com compose V1, use:

```bash
cp .env.example .env
docker-compose up
```

- Web em `http://localhost:5173`
- API em `http://localhost:3333`
- Documentação interativa da API em `http://localhost:3333/docs`

O stack sobe vazio. Para popular com uma amostra pequena (500 linhas
sintéticas, formato JSON Lines) sem precisar fazer upload manual, rode
opcionalmente o serviço `seed`, que existe atrás de um profile e por isso
nunca sobe com `docker compose up`:

```bash
docker compose --profile seed run --rm seed
```

Sem containers, para desenvolvimento local:

```bash
pnpm install
docker compose up postgres -d
pnpm --filter backend prisma:migrate
pnpm dev
```

`pnpm dev` sobe a API e o frontend em paralelo. Não há um processo de worker
separado para subir: a importação roda dentro do próprio processo da API, uma
decisão de escopo explicada em
[docs/architecture/backend.md](docs/architecture/backend.md).

Depois de alterar uma rota ou o schema dela, regenere o cliente tipado que o
frontend consome:

```bash
pnpm generate:client
```

Isso lê as rotas do backend, escreve `packages/api-client/openapi.json` e
regenera `packages/api-client/src`. Os dois são artefatos gerados, versionados
no repositório, e nunca são editados à mão.

## Testando com volume

Para avaliar o comportamento sob grande volume, o repositório traz um gerador
de log sintético e uma ingestão via linha de comando, independentes da
interface:

```bash
pnpm generate:logs --lines 1000000 --format gcp --out big-sample.json
pnpm ingest big-sample.json
```

`generate:logs` escreve em stream, então um milhão de linhas leva segundos, e
varia serviço, severidade e valores de variável entre os registros, de forma
que a normalização produza um bom número de fingerprints repetidos (para o
agrupamento ter o que mostrar), com uma fração de registros degenerados
(severidade ausente, corpo vazio) e timestamps espalhados por uma janela
recente.

`pnpm ingest` roda o mesmo pipeline de ingestão usado pelo upload HTTP,
reportando progresso no terminal (linhas processadas, erros de parse,
registros por segundo ao final).

Ambos também funcionam dentro dos containers:

```bash
docker compose exec api node_modules/.bin/tsx src/scripts/generate-logs.ts --lines 1000000 --format gcp --out /tmp/big-sample.json
docker compose exec api node_modules/.bin/tsx src/cli/ingest.ts /tmp/big-sample.json
```

### Limite de tamanho do upload via navegador

A tela de importação aceita arquivos de até **1 GiB** pela API HTTP. O
limite está declarado em dois lugares que precisam ficar em sincronia:

- `DEFAULT_MAX_UPLOAD_BYTES` em
  [backend/src/http/app.ts](backend/src/http/app.ts) — limite do
  `@fastify/multipart`, sobrescrevível pela env var `MAX_UPLOAD_BYTES`
  (em bytes), sem precisar mudar código.
- `client_max_body_size` em
  [frontend/nginx.conf](frontend/nginx.conf), dentro do `location /api/`
  — sem isso o nginx rejeita o corpo da requisição com `413` antes mesmo
  de a API ver o arquivo.

Arquivos maiores que 1 GiB não passam pelo upload HTTP; use o caminho de
linha de comando descrito acima (`pnpm ingest`), que lê o arquivo em
stream e não tem esse teto.

## Documentação

- [docs/architecture/overview.md](docs/architecture/overview.md): visão de
  conjunto, como backend e frontend se conectam, o fluxo de ingestão de ponta
  a ponta.
- [docs/architecture/backend.md](docs/architecture/backend.md): os domínios
  do backend, o núcleo hexagonal, a fronteira travada por ESLint, leitura
  versus escrita.
- [docs/architecture/frontend.md](docs/architecture/frontend.md): a
  organização por feature, o estado (servidor, URL, local), a tabela
  virtualizada, o tema e a acessibilidade.
- [docs/testing-strategy.md](docs/testing-strategy.md): o que é testado em
  cada camada, os testes de maior valor, e onde a prática diverge da política
  declarada.
- [docs/adr/](docs/adr/): as decisões arquiteturais pontuais, com as
  alternativas consideradas e descartadas. Os documentos de arquitetura
  explicam a estrutura atual; os ADRs explicam por que cada escolha foi feita.
- [docs/development-process.md](docs/development-process.md): como o trabalho
  foi conduzido, os cortes de escopo e o uso de IA.

## Qualidade

Os testes de integração precisam do Postgres de pé:

```bash
docker compose up postgres -d   # sobe o Postgres, se ainda não estiver rodando
pnpm check      # tsc --build --noEmit && eslint, incluindo a regra de fronteira de domínio
pnpm test       # vitest, unitário e de integração
pnpm test:e2e   # playwright, cobrindo a UI
```

`pnpm check` precisa passar antes de qualquer commit.

## Estrutura

```
backend                    Fastify + processamento de importação, núcleo hexagonal
frontend                   React, Vite
packages/api-client        cliente OpenAPI gerado, o contrato de API (docs/adr/0012)
packages/domain-constants  constantes de domínio compartilhadas (escala de severidade OTel)
```