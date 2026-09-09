# ADR 0006 — Ingestão assíncrona com BullMQ sobre Redis

- **Status:** Aceita
- **Data:** 2026-09-08

## Contexto

A importação de um arquivo de log é uma operação longa: ler, detectar
formato, normalizar linha a linha, inserir em lote e atualizar issues. Fazer
isso dentro da requisição HTTP de upload é inviável — estoura timeout,
bloqueia o cliente e não sobrevive a um restart.

A interface precisa mostrar progresso durante o processamento:

> Processando… 340 mil de 1,2 milhão de linhas · 28% · 4 erros de parse

Isso define o requisito real: não basta entregar uma mensagem a um worker.
É preciso um **job com estado consultável**.

## Decisão

**BullMQ sobre Redis**, com um serviço worker separado.

### Fluxo

1. `POST /imports` grava o arquivo, cria o job e responde `202` com `job_id`
2. O worker lê o arquivo em **stream** (`readline`) — nunca carrega inteiro
   em memória
3. O adapter (ADR 0004) normaliza em lotes de ~5 mil registros
4. Inserção em massa via `COPY` ou multi-row insert
5. Upsert de `issues` (ADR 0005) no mesmo lote e na mesma transação
6. `job.updateProgress()` a cada lote; o frontend acompanha por polling

### Porta abstrata

A fila é consumida por interface, não diretamente:

```ts
interface JobQueue {
  enqueue(job: ImportJob): Promise<JobId>
  onJob(handler: (job: ImportJob) => Promise<void>): void
  getStatus(id: JobId): Promise<JobStatus>
}
```

Há uma implementação (`BullMQJobQueue`). A interface existe para que trocar
o backend de fila não toque no domínio.

## Alternativas consideradas

### Cloud Tasks

Avaliado por ser o primitivo gerenciado natural no GCP para disparo de job
HTTP. **Descartado por dois motivos.**

O primeiro é prático e decisivo: o Google **não fornece emulador oficial de
Cloud Tasks**. As opções são implementações de terceiros, criadas
justamente para preencher essa lacuna. Colocar uma dependência não oficial no
caminho crítico do `docker compose up` do avaliador é risco desnecessário
(ver ADR 0007).

O segundo é de adequação: Cloud Tasks entrega uma requisição HTTP com retry.
Não oferece estado de job, progresso nem listagem — que é exatamente o que a
tela de importação precisa.

### Cloud Pub/Sub

Melhor situação que Cloud Tasks no primeiro ponto: **tem emulador oficial**
(`gcloud beta emulators pubsub`), que rodaria no compose sem problema.

Descartado pelo segundo ponto, que é mais forte. Pub/Sub é entrega de
mensagem, não gestão de job: sem progresso, sem estado consultável, sem
histórico de execuções. Reimplementaríamos essa camada por cima — ou seja,
metade do BullMQ.

Há ainda a questão do *ack deadline*, cujo teto é de 10 minutos. Uma
importação grande que ultrapasse esse tempo tem a mensagem reentregue e o
arquivo processado duas vezes. É contornável com chunking e idempotência,
mas é complexidade que não se paga neste escopo.

**Importante:** Pub/Sub não é o primitivo errado — é o primitivo de outra
fase do problema. Ver "Evolução" abaixo.

### Processar dentro da própria API, em background

Sem Redis, sem worker separado. Descartado: o processamento competiria por
CPU com as requisições HTTP, não sobreviveria a restart, e não escalaria
horizontalmente de forma independente da API.

## Consequências

**Positivas**
- Progresso, estado, retry com backoff e concorrência vêm prontos.
- Worker escala independente da API.
- Redis atende ao requisito de NoSQL da vaga por necessidade arquitetural —
  serve também como cache das agregações do dashboard — e não como item de
  checklist.

**Negativas**
- Mais um serviço no compose e mais uma dependência operacional.
- Redis como broker exige atenção a persistência; perda de fila em restart é
  aceitável no escopo, já que o job é reexecutável a partir do arquivo.
- Em Cloud Run, worker em background exige cuidado com o modelo de alocação
  de CPU (ver ADR 0007).

## Evolução

O caminho natural da plataforma é deixar de importar arquivo e passar a
ingerir continuamente: um **Log Sink** do Cloud Logging publicando em um
tópico **Pub/Sub**, com o serviço consumindo em tempo real.

Nesse cenário o primitivo correto passa a ser Pub/Sub — stream de eventos
pequenos, sem estado por mensagem, com fan-out e retenção. A porta `JobQueue`
acima existe para que essa transição seja uma implementação nova, não uma
reescrita.

## Revisitar quando

A ingestão deixar de ser por upload de arquivo, ou quando o volume exigir
mais de um worker concorrente sobre o mesmo arquivo — nesse ponto o job
precisa ser fatiado por offset, e a coordenação muda.
