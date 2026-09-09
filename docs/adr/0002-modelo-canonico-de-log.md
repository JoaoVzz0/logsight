# ADR 0002 — Modelo canônico de log baseado em OpenTelemetry

- **Status:** Aceita
- **Data:** 2026-09-08

## Contexto

A plataforma precisa importar logs de origens diferentes — Cloud Logging do
GCP, CloudWatch da AWS, nginx, syslog, JSON Lines genérico. Cada uma tem seu
próprio vocabulário: o GCP chama de `severity` uma string, o syslog usa um
inteiro de 0 a 7, o CloudWatch nem sempre traz severidade explícita.

Sem um modelo comum, cada tela e cada agregação teria que conhecer todos os
formatos. Filtrar por "erros" viraria um `if` por fonte, e o dashboard não
conseguiria comparar dados de origens distintas na mesma série.

## Decisão

Adotar um **modelo canônico único**, com o
[OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/)
como referência em vez de um formato próprio.

```
LogRecord
├─ timestamp          -- event time, conforme a origem
├─ observed_at        -- quando a plataforma ingeriu
├─ severity_number    -- escala OTel (1–24), normalizada
├─ severity_text      -- rótulo original preservado
├─ body               -- mensagem
├─ service_name       ┐
├─ host               ├─ resource attributes
├─ environment        ┘
├─ trace_id, span_id  -- correlação distribuída
├─ attributes  JSONB  -- cauda variável, específica da fonte
├─ source_type        -- gcp | aws_cloudwatch | nginx | syslog | json
├─ fingerprint        -- ver ADR 0005
└─ raw         JSONB  -- registro original, sem perda
```

A separação entre **núcleo estável** (colunas tipadas) e **cauda variável**
(`attributes` em JSONB) é o eixo do modelo, e é o que sustenta a decisão de
banco no ADR 0003.

### Normalização de severidade

Cada adapter é responsável por mapear a severidade da origem para a escala
OTel, preservando o rótulo original em `severity_text`:

| Fonte | Campo de origem | Exemplo |
|---|---|---|
| GCP Cloud Logging | `severity` (string) | `DEFAULT`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| AWS CloudWatch | não padronizado | heurística sobre a mensagem ou o payload |
| Syslog RFC5424 | PRI (0–7) | `emerg` … `debug` |
| nginx | canal | `access` → INFO, `error` → ERROR |

### Preservação do original

O campo `raw` guarda o registro como veio. Isso custa espaço, mas garante
que um erro de parser não destrua informação e permite reprocessar uma
importação com um adapter corrigido, sem pedir o arquivo de novo.

## Alternativas consideradas

**Formato próprio, desenhado sob medida.** Seria menor e mais direto ao
ponto. Descartado porque adotar um padrão de indústria traz semântica já
resolvida (a escala de severidade, a separação entre resource e log
attributes, os campos de correlação) e torna a plataforma compatível com
qualquer coletor OTel no futuro, sem migração de esquema.

**Elastic Common Schema (ECS).** Também é um padrão maduro e bem
documentado. Descartado por ser mais amarrado ao ecossistema Elastic e por
ter uma superfície de campos muito maior do que este escopo justifica.

**Guardar apenas o JSON bruto e interpretar na leitura.** Ingestão
trivialmente simples, mas empurra todo o custo para a query: cada filtro
por severidade viraria uma expressão sobre JSON, sem índice eficiente, e o
dashboard ficaria inviável em volume.

## Consequências

**Positivas**
- Filtros, buscas e agregações funcionam igual para qualquer fonte.
- Adicionar uma nova origem não toca no domínio nem na UI (ver ADR 0004).
- `raw` permite reprocessamento sem reimportação.

**Negativas**
- Custo de armazenamento maior por guardar original e normalizado.
- Normalizar severidade de fontes sem campo explícito (CloudWatch) exige
  heurística, que pode errar. Mitigado por permitir override no import e
  por manter o `raw`.

## Revisitar quando

O OpenTelemetry evoluir o data model de logs de forma incompatível, ou
quando a plataforma passar a receber telemetria via OTLP nativamente — nesse
caso o modelo canônico deixa de ser tradução e passa a ser o formato de
entrada direto.
