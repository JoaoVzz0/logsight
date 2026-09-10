# ADR 0009 — Prisma como camada de acesso, com SQL cru nas agregações

- **Status:** Aceita
- **Data:** 2026-09-08

## Contexto

O ADR 0003 decidiu **qual** banco usar. Este decide **como** acessá-lo, que é
uma questão separada e com trade-offs próprios.

Há dois perfis de acesso muito distintos no sistema:

- **Escrita e consulta simples** — inserção em lote na ingestão, upsert de
  issue por fingerprint, listagem paginada de logs com filtro. Alto volume de
  chamadas, formato previsível.
- **Agregação analítica** — as consultas do dashboard. Poucas em número
  (quatro ou cinco), mas com necessidades que a API de um ORM não expressa.

## Decisão

**Prisma como padrão**, com SQL cru pontual onde o client não alcança.

### Client nativo — o padrão do projeto

Cobre a grande maioria do acesso a dados:

```ts
await prisma.issue.upsert({
  where: { fingerprint },
  create: { fingerprint, firstSeen: ts, lastSeen: ts, eventCount: 1 },
  update: { lastSeen: ts, eventCount: { increment: 1 } },
})
```

Também: `createMany` na inserção em lote da ingestão, e a paginação por keyset
da tabela de logs. Nesses casos o nativo é mais legível que SQL escrito à mão e
igualmente eficiente.

O keyset **não** usa o argumento `cursor` do Prisma: ele compila para
subconsultas correlacionadas e uma varredura sequencial. Usa o comparador
composto montado com os operadores do query builder, na forma sargável que
mantém o limite de `timestamp` como range do índice:

```ts
await prisma.logRecord.findMany({
  where: {
    AND: [
      { timestamp: { lte: cursorTs } },
      { OR: [{ timestamp: { lt: cursorTs } }, { id: { lt: cursorId } }] },
    ],
  },
  orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
  take: pageSize + 1,
})
```

O `OFFSET 0` fixo que o `findMany` do Prisma sempre anexa ao SQL não é o
`OFFSET` que a regra de performance proíbe — aquele cresce com a profundidade
da página; este é constante e o `WHERE` do keyset é o que avança. Ver
`@.claude/rules/performance.md`.

### `$queryRaw` — a exceção, restrita a `analytics`

Quatro capacidades exigidas pelo dashboard que o client não expressa:

| Necessidade | Onde é usada |
|---|---|
| `GROUP BY` por expressão (`date_trunc`) | série temporal de eventos |
| Agregação condicional (`count(*) FILTER`) | taxa de erro no mesmo passe |
| Window function (`LAG`, CTE) | detecção de pico entre janelas |
| `generate_series` + `LEFT JOIN` | buckets sem evento no gráfico |

Interpolação com template tagged (`` $queryRaw`... ${value}` ``) é
parametrizada pelo Prisma. **`$queryRawUnsafe` não é usado em nenhum ponto.**

### Validação da saída com Zod

Retorno de `$queryRaw` é tipado apenas por declaração — o Prisma não verifica
nada em runtime. Toda query crua valida a saída:

```ts
const ErrorRateRow = z.object({
  bucket: z.coerce.date(),
  total: z.coerce.number(),
  errors: z.coerce.number(),
})

return z.array(ErrorRateRow).parse(rows)
```

Isso não é formalidade. `count(*)` no PostgreSQL retorna `BigInt`, que
`JSON.stringify` não serializa — o `z.coerce` resolve na fronteira, uma vez,
em vez de produzir erro em runtime na resposta HTTP.

O schema de saída de cada query object **é** o contrato da API: uma
definição serve como validação no banco, tipo no backend e tipo no frontend.

No client nativo o tipo já vem inferido do schema, e validar novamente seria
redundância — Zod se aplica apenas às queries cruas.

### Índices fora do schema Prisma

BRIN e GIN (ADR 0003) não são expressos pelo schema do Prisma e são criados
em migration SQL manual, com comentário justificando cada um. Ficam
explícitos no repositório em vez de implícitos na ferramenta.

## Alternativas consideradas

**Kysely.** Query builder tipado, que daria SQL com inferência de tipos
derivada do schema e cobriria o espaço intermediário entre client e raw.
Tecnicamente atraente. **Descartada por risco de prazo:** é ferramenta não
dominada pela equipe, e introduzir aprendizado novo no caminho crítico de um
prazo de três dias é o mesmo risco que motivou outras decisões deste
conjunto.

**TypeORM.** Descartado em favor do Prisma: migrations mais confiáveis,
inferência de tipos melhor e histórico de manutenção mais estável.

**SQL cru em todo o acesso**, sem ORM. Daria controle total e removeria o
mapper do ADR 0008. Descartado porque perderia migrations versionadas,
tipagem gerada e o upsert legível — sem ganho onde o client já é adequado.

**Client nativo em tudo, sem SQL cru.** Exigiria múltiplas consultas por
bucket de tempo e agregação em JavaScript. Descartado: transferiria trabalho
analítico do banco para a aplicação, contra o critério de performance.

## Consequências

**Positivas**
- Migrations versionadas e tipos gerados no caminho principal.
- O banco faz o trabalho analítico, e não a aplicação.
- Validação em runtime na fronteira do banco — garantia mais forte que a
  promessa de tipo em tempo de compilação, justamente onde o tipo é
  declarado à mão.

**Negativas**
- Dois estilos de acesso convivem; a convenção precisa estar clara (SQL cru
  apenas em `analytics/queries/`).
- As queries cruas são específicas do PostgreSQL, o que amarra a portabilidade
  do lado de leitura. Trade-off assumido.
- `attributes` (JSONB) é tipado como `Prisma.JsonValue`, fraco por natureza;
  refinado com Zod na leitura.

## Ponto em aberto, a decidir por medição

Filtro por chave dentro de JSONB tem suporte no client
(`attributes: { path: [...], equals: ... }`), mas o plano de execução nem
sempre aproveita o índice GIN. A implementação começa pelo nativo e migra
para `$queryRaw` se `EXPLAIN ANALYZE` indicar sequential scan — decisão por
medição, não por antecipação.

## Revisitar quando

O número de queries cruas crescer além do módulo `analytics`, sinal de que um
query builder tipado passaria a compensar o custo de adoção.
