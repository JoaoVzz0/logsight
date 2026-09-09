# ADR 0003 — PostgreSQL com JSONB como armazenamento principal

- **Status:** Aceita
- **Data:** 2026-09-08

## Contexto

Logs são frequentemente descritos como dados semi-estruturados, o que sugere
um banco de documentos. A pergunta foi levantada explicitamente: faz mais
sentido NoSQL?

A resposta depende menos do formato do dado e mais do **padrão de acesso**.
E o padrão de acesso desta aplicação é analítico, não documental:

- contagem por bucket de tempo (`date_trunc`)
- taxa de erro sobre o total na mesma janela
- agrupamento por `fingerprint` com `count`, `min(timestamp)`, `max(timestamp)`
- comparação entre janela atual e anterior, para detecção de picos
- paginação por cursor ordenada por tempo
- busca textual sobre a mensagem

Além disso, o dado não é uniformemente semi-estruturado. Conforme o ADR 0002,
ele é **híbrido**: um núcleo estável presente em toda fonte, e uma cauda
variável específica de cada origem.

## Decisão

**PostgreSQL** como store principal, com:

- **colunas tipadas** para o núcleo do `LogRecord`, com `severity_number` e
  `severity_text` **nulos** quando a origem não traz severidade determinável
  (ADR 0002, ADR 0005)
- **JSONB** para `attributes`, com índice **GIN** para filtro por chave
  arbitrária (`attributes->>'region' = 'us-east-1'`)
- **TEXT** para `raw` — o registro original preservado verbatim (ADR 0002).
  Nunca é consultado por chave, então não recebe índice e não precisa de JSONB
- **BRIN** em `timestamp` — o dado é append-only e naturalmente ordenado por
  tempo, então o índice fica ordens de grandeza menor que um B-tree
  equivalente
- **índice composto** `(service_name, severity_number, timestamp DESC)` para
  o caminho de consulta mais comum da tabela
- **`pg_trgm`** (ou `tsvector`, conforme medição) para busca textual em `body`

**Redis** entra como segundo store, mas por necessidade arquitetural — fila
de ingestão e cache de agregações — e não para preencher um requisito de
"usar NoSQL". Ver ADR 0006.

## Alternativas consideradas

**MongoDB.** A favor: ingestão de fontes heterogêneas sem decidir esquema
antes, time-series collections nativas, sharding horizontal mais simples.
Contra: as agregações centrais do dashboard viram pipelines verbosos, e a
comparação entre janelas — que em SQL é uma window function de uma linha —
fica significativamente mais trabalhosa. Busca textual é fraca fora do Atlas
Search. E perderíamos a oportunidade de demonstrar estratégia de indexação,
que é um dos critérios de avaliação (performance).

**ClickHouse.** Tecnicamente é a resposta correta para volume alto — é o que
sistemas de log reais usam. Descartado pelo prazo: exigiria modelagem de
engine, chave de ordenação e política de merge que não daria para justificar
com propriedade em 3 dias. Fica registrado como o caminho de evolução, não
como alternativa rejeitada por mérito.

**OpenSearch / Elasticsearch.** Excelente em busca textual e o padrão de
mercado para exploração de log. Descartado por peso operacional
desproporcional ao escopo e por tornar o `docker compose up` do avaliador
pesado e frágil.

Vale registrar o ponto que orientou a decisão: **nenhum sistema de log de
referência usa banco de documentos**. Datadog, Loki, ClickHouse e OpenSearch
são colunares ou índices invertidos. Se a resposta correta para escala fosse
NoSQL, o candidato seria ClickHouse — não MongoDB.

## Consequências

**Positivas**
- Uma query SQL resolve cada agregação do dashboard, incluindo comparação de
  janelas via window function.
- `issues` (ADR 0005), com upsert por fingerprint, contador e estado
  resolve/ignore, é modelagem relacional pura e ganha transação de graça.
- Estratégia de índice explícita e mensurável via `EXPLAIN ANALYZE`.

**Negativas**
- Escala vertical: acima de alguma ordem de grandeza de volume, Postgres
  deixa de ser adequado para retenção longa de log.
- JSONB com GIN tem custo de escrita e ocupa espaço relevante.
- Particionamento por tempo não será implementado no escopo do desafio,
  apenas documentado.

## Revisitar quando

O volume retido passar da ordem de dezenas de milhões de registros por
período de consulta, ou quando a retenção exigir política de expiração
automática. O caminho é particionamento nativo por dia primeiro; ClickHouse
depois, se a agregação virar o gargalo.
