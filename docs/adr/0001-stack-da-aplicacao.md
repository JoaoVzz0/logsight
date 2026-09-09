# ADR 0001 — TypeScript fim a fim, com Fastify no backend

- **Status:** Aceita
- **Data:** 2026-09-08
- **Substitui:** versão anterior desta decisão, que adotava NestJS

## Contexto

O desafio exige frontend em ReactJS e backend em Python ou Node.js, sem
restringir framework. Os critérios de avaliação incluem organização do
projeto, arquitetura, performance, tratamento de erros e validações.

O peso do trabalho neste projeto **não está na camada HTTP**. São cerca de
dez endpoints. O esforço real está em três lugares: o pipeline de
normalização e agrupamento, as consultas analíticas com sua estratégia de
índice, e o frontend de alto volume. A escolha de framework deve minimizar o
tempo gasto fora desses três.

Um segundo fator pesa igualmente: o processamento de importação roda em um
**worker separado** (ADR 0006), não em requisição HTTP. O domínio precisa ser
consumível pelos dois processos sem cerimônia de bootstrap.

## Decisão

TypeScript nas duas pontas:

- **Frontend:** React com Vite, TanStack Query para estado de servidor,
  TanStack Virtual na tabela de alto volume, Recharts nos gráficos.
- **Backend:** Node.js com **Fastify**, `fastify-type-provider-zod` para
  validação e tipos na fronteira HTTP, `@fastify/swagger` para OpenAPI.
- **Acesso a dados:** Prisma (ver ADR 0009).
- **Contrato de API:** o documento OpenAPI gerado dos schemas Zod é a fonte
  única, e o frontend consome um cliente gerado a partir dele (ver ADR 0012).

O worker é um processo Node comum que importa as mesmas funções de domínio,
sem instanciar servidor HTTP nem container de injeção de dependência.

## Alternativas consideradas

### NestJS

Foi a escolha inicial e foi revertida. A favor: estrutura de projeto já
decidida, exception filters e validation pipe cobrindo dois critérios de
avaliação, integração first-class com BullMQ.

Descartada por três motivos.

**A escala em que NestJS compensa não é atingida aqui.** O retorno estrutural
aparece com muitos endpoints e múltiplos times. Com dez endpoints e um
desenvolvedor, paga-se o custo de cerimônia sem colher o benefício.

**A estrutura deixaria de ser evidência.** Em um projeto NestJS, a
organização de pastas é a que o CLI gerou — não distingue quem projetou
camadas de quem seguiu o padrão do framework. Como "arquitetura" e
"organização do projeto" são critérios explícitos de avaliação, a estrutura
escolhida deliberadamente comunica mais (ver ADR 0008).

**O worker ficaria acoplado ao container de DI.** Rodar o processamento fora
de uma requisição exigiria `NestFactory.createApplicationContext()`. Com
Fastify, o domínio é TypeScript puro e o worker apenas o importa — o que é
também a decisão arquitetural do ADR 0008, não só conveniência.

O que se perde com NestJS fora — validação, tratamento de erro e documentação
automática — é recuperado com Zod, um `setErrorHandler` global e
`@fastify/swagger`, sem o restante da cerimônia.

### Express

Descartado. É o mais fraco dos três para os critérios avaliados: não tem
validação nativa, não propaga erro assíncrono sem wrapper, e não oferece
geração de schema. Não há vantagem que compense.

### Python (FastAPI)

Ecossistema mais rico para processamento de dados e Pydantic é excelente na
validação. Descartado porque o tipo compartilhado entre front e back é o
principal ganho de coesão neste domínio, e porque o trabalho pesado aqui é
I/O — ler arquivo grande, inserir em lote — e não CPU.

### Next.js unificando front e back

Descartado deliberadamente: o enunciado pressupõe containers distintos e um
backend consumível de forma independente. Fundir as camadas tornaria a
fronteira menos legível na avaliação.

## Justificativa que NÃO se aplica

Fastify **não** foi escolhido por performance de roteamento. O gargalo desta
aplicação é o PostgreSQL e o parsing de arquivo; a diferença de throughput
HTTP entre os frameworks é irrelevante no p95 deste sistema. Registrar isso
evita uma justificativa que não se sustenta sob questionamento.

## Consequências

**Positivas**
- O domínio fica livre de framework, e o worker o consome sem bootstrap.
- Um único schema Zod serve como validação, tipo do backend, tipo do frontend
  e documentação OpenAPI.
- A estrutura do projeto é uma decisão explícita e defensável (ADR 0008).

**Negativas**
- Estrutura, tratamento de erro e organização de testes precisam ser
  decididos em vez de herdados. Mitigado por fixá-los no ADR 0008 antes de
  escrever código.
- Sem injeção de dependência do framework, a composição de dependências é
  manual — aceitável na escala atual, e explícita por consequência.

## Revisitar quando

O número de contextos de negócio crescer a ponto de a composição manual de
dependências ficar trabalhosa, ou quando mais de um time passar a trabalhar
no mesmo repositório — cenário em que a uniformidade imposta por um
framework opinativo passa a valer mais que a economia de cerimônia.
