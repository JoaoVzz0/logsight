# ADR 0004 — Adapters por fonte, com detecção automática de formato

- **Status:** Aceita
- **Data:** 2026-09-08

## Contexto

O modelo canônico do ADR 0002 só tem valor se houver um caminho barato e
isolado para traduzir cada formato de origem até ele. A tentação natural é
espalhar condicionais por formato ao longo do pipeline de importação — o que
faz o custo de adicionar uma fonte crescer com o tamanho do sistema.

## Decisão

Definir um **contrato único de adapter** e uma implementação por fonte:

```ts
interface LogAdapter {
  readonly sourceType: SourceType
  /** confiança de 0 a 1 de que esta amostra pertence a este formato */
  detect(sample: string[]): number
  parse(line: string): LogRecord | ParseError
}
```

O pipeline de importação não conhece nenhum formato: recebe um adapter e o
aplica. Registrar uma nova fonte é adicionar uma implementação ao registry.

### Fontes no escopo

| Adapter | Entrada |
|---|---|
| `gcp-cloud-logging` | JSON de `LogEntry` — `timestamp`, `severity`, `jsonPayload`/`textPayload`, `resource.labels`, `trace`, `insertId` |
| `aws-cloudwatch` | export JSON — `logGroup`, `logStream`, `logEvents[].timestamp/message` |
| `json-lines` | um objeto JSON por linha, com mapeamento heurístico de campos |
| `nginx` / `syslog` | formatos de texto, via regex — entram se o prazo permitir |

Três adapters sólidos e um contrato claro valem mais que oito parciais.

### Detecção de formato

Na importação, os primeiros registros do arquivo são oferecidos ao `detect`
de cada adapter e vence o de maior confiança. O usuário pode **sobrescrever**
a escolha na tela de upload — a detecção é conveniência, não autoridade.

### Erros de parse não abortam a importação

Uma linha inválida vira `ParseError`, é contabilizada e registrada com o
número da linha e o conteúdo original. A importação segue. O resultado do
job informa quantos registros entraram e quantos falharam.

Isso é deliberado: arquivos de log reais têm linhas truncadas, mistura de
formatos e encoding inconsistente. Um importador que aborta no primeiro erro
é inútil na prática.

## Alternativas consideradas

**Um parser configurável por regex, definido pelo usuário.** Mais flexível e
sem código por fonte. Descartado por empurrar complexidade para o usuário e
por não resolver bem formatos JSON aninhados, que são a maioria dos casos
relevantes (GCP e AWS).

**Exigir que o usuário declare o formato no upload, sem detecção.** Mais
simples de implementar. Descartado por piorar a UX sem ganho arquitetural — a
detecção custa pouco, já que a leitura em stream (ADR 0006) tem as primeiras
linhas em mãos de qualquer forma.

**Usar um coletor pronto (Vector, Fluent Bit) como camada de normalização.**
Seria a escolha correta em produção. Descartado no escopo do desafio porque a
normalização é justamente o núcleo que está sendo avaliado — terceirizá-la
esvaziaria o exercício.

## Consequências

**Positivas**
- Custo de adicionar uma fonte é constante e isolado: uma classe e um teste.
- Cada adapter é testável em unidade, com amostras reais como fixture.
- O domínio e a UI nunca conhecem formato de origem.

**Negativas**
- Detecção heurística pode errar em arquivos ambíguos; mitigado pelo override
  manual.
- Exportações reais de GCP e AWS têm variações que três dias de amostra não
  cobrem. O `raw` do ADR 0002 permite reprocessar quando um adapter for
  corrigido.

## Revisitar quando

O número de fontes crescer a ponto de a detecção por confiança ficar
ambígua, ou quando a ingestão passar a ser contínua em vez de por arquivo —
nesse cenário o formato vem declarado no canal e a detecção deixa de ser
necessária.
