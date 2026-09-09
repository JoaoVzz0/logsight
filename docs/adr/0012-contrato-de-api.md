# ADR 0012 — Contrato de API por OpenAPI gerado

- **Status:** Aceita
- **Data:** 2026-09-08

## Contexto

O ADR 0001 decidiu TypeScript nas duas pontas e registrou, como consequência
positiva, que "um único schema Zod serve como validação, tipo do backend,
tipo do frontend e documentação OpenAPI". Na prática essa promessa foi
implementada compartilhando os schemas Zod de resposta por um pacote do
workspace (`packages/contracts`), consumido diretamente pelo frontend.

Esse arranjo compartilha o **formato do dado**, mas não o resto do contrato.
A rota, o método HTTP, o formato do path, os parâmetros de query e os códigos
de status ficam fora do tipo compartilhado. O frontend ainda escreve a
chamada `fetch` à mão, e um erro de URL ou de método só aparece em runtime.
O schema compartilhado dá uma falsa sensação de cobertura.

Ao mesmo tempo, o backend já produz um documento OpenAPI completo via
`@fastify/swagger`, derivado dos mesmos schemas Zod. Esse documento descreve
o contrato inteiro, não só o corpo das respostas.

## Decisão

O **documento OpenAPI gerado dos schemas Zod das rotas Fastify é a fonte
única de verdade do contrato de API.**

- O backend serializa o documento com `@fastify/swagger`. O script
  `pnpm --filter backend openapi:dump` sobe uma instância Fastify em modo
  somente-schema e grava `packages/api-client/openapi.json`.
- Um cliente TypeScript é gerado a partir desse documento para
  `packages/api-client/src/` com `openapi-typescript`.
- `pnpm generate:client`, na raiz, executa o dump e a geração em sequência.
- `openapi.json` e o cliente gerado são **versionados e commitados**. Um
  clone novo builda o frontend sem subir a API, e `docker compose up`
  continua funcionando a partir do repositório limpo.
- A geração é **manual**, executada após alterar uma rota, e não faz parte
  do build.
- O frontend consome apenas o cliente gerado. Nenhuma chamada `fetch` manual
  contra a API.
- `packages/contracts` foi renomeado para `packages/domain-constants` e
  mantém somente constantes de domínio que não são contrato de transporte —
  hoje, a escala de severidade OTel. Deixou de conter qualquer tipo de
  requisição ou resposta HTTP.

As convenções que a decisão impõe sobre os schemas Zod do backend estão em
`.claude/rules/architecture.md`, seção *API contract*.

## Alternativas consideradas

**Schema Zod compartilhado por pacote do workspace.** A abordagem anterior.
Compartilha o formato do dado, mas não a rota nem o método, deixando a
chamada `fetch` fora do contrato. Descartada por cobrir só metade do
problema e mascarar a outra metade.

**tRPC.** Dá a melhor type safety fim a fim num monorepo TypeScript, sem
etapa de geração. Descartada porque acopla frontend e backend ao mesmo
runtime e não produz um documento OpenAPI. O enunciado pressupõe um backend
documentado e consumível de forma independente (ver ADR 0001); ter a API
descrita por um contrato aberto vale mais aqui do que a ergonomia do tRPC.

**Cliente escrito à mão.** Sem custo de ferramenta. Descartada porque
diverge do backend silenciosamente: nada garante que o cliente e as rotas
concordem, e a divergência só aparece em runtime.

**Geração automática no build.** Manteria o cliente sempre atualizado.
Descartada pelo custo de tempo em cada build e por tornar o build do
frontend dependente de subir a API, o que quebraria o build a partir de um
clone limpo e dentro do `docker compose`.

## Consequências

**Positivas**
- O contrato inteiro — rota, método, path, query, status, formato — é
  verificado em tempo de compilação no frontend, não só o corpo da resposta.
- Um único documento serve como contrato, tipo do frontend e documentação
  interativa (`/docs` via `@fastify/swagger-ui`).
- O cliente e `openapi.json` versionados permitem build do frontend sem a
  API no ar.
- O acoplamento entre as pontas é um arquivo gerado, revisável no diff.

**Negativas**
- Artefato gerado entra no controle de versão, com o ruído de diff que isso
  traz.
- A geração precisa ser rodada após cada mudança de rota. Esquecer deixa o
  cliente defasado até alguém perceber — o risco é real e não há trava
  automática, por escolha.
- A qualidade dos tipos gerados depende de os schemas Zod traduzirem bem
  para JSON Schema. Refinements e coerções no schema de resposta produzem
  tipos ruins ou perdem informação; a regra em `architecture.md` existe por
  causa disso.

## Revisitar quando

O número de rotas crescer a ponto de a geração manual ser esquecida com
frequência — sinal de que a geração deveria entrar num hook de pré-commit ou
na verificação de CI —, ou quando a ingestão passar a expor uma superfície
que o OpenAPI 3.1 não descreve bem (streaming, por exemplo), caso em que
parte do contrato deixaria de caber neste mecanismo.
