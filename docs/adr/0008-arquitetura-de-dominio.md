# ADR 0008 — Monólito modular com núcleo hexagonal

- **Status:** Aceita
- **Data:** 2026-09-08

## Contexto

Com Fastify (ADR 0001), a estrutura do projeto não vem herdada de um
framework — é decisão explícita. Isso é oportunidade e risco: bem feita, a
organização demonstra intenção arquitetural; mal feita, vira camada
decorativa que apenas repassa chamadas.

O domínio tem duas naturezas distintas convivendo:

- **Escrita** — importar, normalizar, agrupar por assinatura, gerenciar o
  ciclo de vida de um issue. Tem invariantes e regras.
- **Leitura** — tabela paginada e agregações do dashboard. Não tem
  invariante; tem projeção e volume.

Tratar as duas com o mesmo formalismo seria errado nos dois sentidos:
subprotegeria a escrita ou encareceria a leitura.

## Decisão

**Monólito modular com núcleo hexagonal, DDD tático seletivo e leitura
separada da escrita.**

### Estrutura

```
src/
├─ domains/                    contextos de negócio
│  ├─ ingestion/
│  │  ├─ core/                 entidades, value objects, domain services
│  │  ├─ ports/                interfaces
│  │  ├─ application/          casos de uso / application services
│  │  ├─ infra/                implementações das portas
│  │  └─ http/                 rotas Fastify
│  ├─ issues/                  mesma forma
│  ├─ logs/                    queries/ + http/ apenas
│  └─ analytics/               queries/ + http/ apenas
├─ shared/                     severity-scale, errors, result
├─ platform/                   fastify, prisma, redis, config, logger
└─ worker/                     consumidor da fila
```

A camada interna chama-se `core/`, não `domain/`, para não colidir com o
sentido de `domains/` no nível acima. Nomes distintos para conceitos
distintos: `domains/` é subdomínio de negócio, `core/` é a camada sem
dependência externa.

### Por que hexagonal

A metáfora de portas e adaptadores veio do problema, não da literatura: o
enunciado é literalmente sobre adaptar fontes heterogêneas a um modelo único.

O teste aplicado para decidir se uma porta é real ou decorativa foi **ter ao
menos duas implementações plausíveis**:

| Porta | Implementações |
|---|---|
| `LogSourceAdapter` | GCP, CloudWatch, JSON Lines, nginx |
| `JobQueue` | BullMQ hoje, Pub/Sub na evolução (ADR 0006) |
| `FileStorage` | filesystem no compose, GCS com signed URL no Cloud Run (ADR 0007) |
| `IssueRepository` | PostgreSQL em produção, in-memory nos testes |

Onde havia uma implementação só, sem segunda plausível, não foi criada
interface.

### DDD tático, aplicado seletivamente

Apenas onde há invariante real:

- **`Issue` é agregado.** `event_count` só cresce, `first_seen` é imutável
  após a criação, `last_seen` só avança, e reabrir um issue resolvido
  caracteriza uma **regressão** — que é uma das métricas do dashboard
  (ADR 0005). É máquina de estados, não CRUD.
- **Value objects** onde há regra de conversão: `Severity` (normalização para
  a escala OTel preservando o rótulo original) e `Fingerprint` (normalização
  textual e hash).
- **Domain services** para regra que não pertence a uma entidade só: detecção
  de formato (consulta todos os adapters e escolhe por confiança) e detecção
  de pico (compara janelas de tempo entre múltiplos issues).

O restante — `LogRecord`, filtros, paginação — é dado, e foi tratado como
dado.

### Sobre services

O padrão é usado, com a distinção explicitada pela localização:

- `core/services/` — **domain services**, regra sem dono único
- `application/` — **application services**, orquestração de portas, sem
  decisão de negócio

O que se evita não é o nome, é o service que acumula regra de negócio,
orquestração e acesso a dados no mesmo arquivo, esvaziando as entidades
(modelo de domínio anêmico).

### Leitura não passa pelo domínio

`logs` e `analytics` **não têm `core/` nem `ports/`**. São query objects que
projetam SQL direto para o formato da resposta.

Hidratar milhões de entidades para produzir um gráfico é custo sem
contrapartida: projeção não tem invariante a proteger. É CQRS no sentido
fraco — caminhos de leitura e escrita distintos, mesmo banco, sem event
sourcing.

Ressalva de precisão: `logs` e `analytics` não são bounded contexts no
sentido estrito; são projeções sobre os outros dois. Estão em `domains/` por
coesão de navegação, não por classificação de DDD.

### A fronteira é verificável, não convencional

Regra única: **`core/` e `application/` não importam de `infra/`, `http/` ou
`platform/`.**

Aplicada por `no-restricted-imports` no ESLint, incluindo o bloqueio de
import direto de framework e driver (`fastify`, `@prisma/client`, `bullmq`,
`ioredis`) dentro de `core/`. A regra quebra o build.

Consequência assumida: tipos de domínio não podem ser os tipos gerados pelo
Prisma. A conversão entre modelo persistido e entidade acontece no repository,
dentro de `infra/`. É o único mapper do projeto, e é o preço direto do
isolamento.

## Alternativas consideradas

**Clean Architecture com quatro camadas.** Mesmo princípio de dependência,
com mais cerimônia: entidade, caso de uso, interface adapter, framework, com
mapper entre cada fronteira. Descartada por custo desproporcional ao tamanho
do domínio — hexagonal entrega o mesmo isolamento com uma fronteira só.

**DDD tático completo.** Agregados, repositórios e domain events em todos os
contextos. Descartada porque `logs` e `analytics` não têm invariante:
aplicar o formalismo ali seria cerimônia sem proteção.

**Camadas técnicas horizontais** (`controllers/`, `services/`,
`repositories/` no topo). Descartada: agrupa por tipo de arquivo em vez de
por capacidade de negócio, e espalha uma mudança de funcionalidade por
várias pastas.

**Microserviços.** Descartada sem hesitação: um sistema, um deploy, um
desenvolvedor.

**Vertical slice puro**, sem camada compartilhada por contexto. Boa opção em
projetos maiores. Descartada por baixo ganho nesta escala.

## Consequências

**Positivas**
- Adicionar uma fonte de log toca um arquivo em `ingestion/infra/adapters/`
  e um teste.
- O domínio é testável sem banco, fila ou HTTP.
- O worker importa o mesmo domínio, sem bootstrap de framework.
- O isolamento é garantido por lint, não por disciplina.

**Negativas**
- Um mapper entre modelo Prisma e entidade, em `issues/infra/`.
- Assimetria entre leitura e escrita: quem lê o código precisa entender por
  que `logs/` não tem `core/`. Documentado aqui e no README.
- Composição manual de dependências, sem container de DI.
- Trocar de banco afetaria os query objects diretamente, já que usam SQL
  específico do PostgreSQL. Trade-off assumido em favor de performance
  (ADR 0009).

## Revisitar quando

Um contexto passar a precisar de escala independente — o candidato natural é
`ingestion`, se a ingestão contínua do ADR 0006 se concretizar. A fronteira
de módulo já é o ponto de corte para essa extração.
