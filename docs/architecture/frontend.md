# Arquitetura do frontend

Este documento descreve a estrutura real de `frontend/src`, lida
diretamente do código. O porquê de cada decisão está em ADR 0010, ADR 0011
e ADR 0012, linkados ao final.

## Estrutura por feature

```
frontend/src/
├─ app/            shell: layout, nav, roteamento, tema
├─ features/
│  ├─ analytics/   dashboard: cards, hooks, páginas
│  ├─ imports/     upload, progresso, histórico
│  ├─ issues/      apenas a página, sem dados (ver abaixo)
│  └─ logs/        tabela virtualizada, filtros, busca
└─ shared/
   ├─ ui/           componentes shadcn e os design tokens (tokens.css)
   └─ lib/          cliente de API, formatadores
```

Cada feature tem sua própria fatia de `api/`, `components/`, `hooks/`,
`model/` e `pages/`, no espelho da organização por domínio do backend
(ADR 0010). `shared/schemas/` existe como pasta mas está vazia: os schemas
Zod de cada tela ficam no `model/` da própria feature (por exemplo
`features/logs/model/filters.ts`, `features/analytics/model/time-range.ts`),
não em um módulo compartilhado.

A feature `issues/` só tem `pages/issues-page.tsx`, com texto estático e
nenhuma busca de dados; suas pastas `api/`, `components/` e `hooks/` têm
apenas um `.gitkeep`. A rota `/issues` existe no roteador, mas a tela
descrita no ADR 0010 (lista de issues agrupados, com detalhe por
fingerprint) ainda não está implementada.

## Roteamento

`react-router-dom`, com `createBrowserRouter` declarado em
`app/router.tsx`, rotas fixas (sem roteamento por arquivo ou segmentos
dinâmicos):

```
/         DashboardPage   (features/analytics/pages/dashboard-page.tsx)
/issues   IssuesPage      (features/issues/pages/issues-page.tsx, stub)
/logs     LogsPage        (features/logs/pages/logs-page.tsx)
/imports  ImportsPage     (features/imports/pages/imports-page.tsx)
```

## Estado

Três mecanismos, sem gerenciador global:

| Tipo | Mecanismo | Onde |
|---|---|---|
| Estado de servidor | TanStack Query | um hook por consulta em `features/*/hooks/` |
| Filtros e intervalo de tempo | `searchParams` na URL | `features/logs/pages/logs-page.tsx`, `features/analytics/pages/dashboard-page.tsx` |
| Estado local de UI | `useState` | estado de UI que não precisa ser compartilhado |

### Estado de servidor

Todo hook de dado (`use-logs.ts`, `use-import-job.ts`, `use-new-issues.ts`,
`use-error-rate.ts`, etc.) chama uma função de `features/*/api/`, que por
sua vez chama o cliente gerado em `shared/lib/api-client.ts`:

```ts
export const api = createClient<paths>({ baseUrl })
```

Uma busca no código por `fetch(` fora de `refetch()` do TanStack Query não
encontra nenhuma chamada manual: toda comunicação com a API passa pelo
cliente gerado, conforme ADR 0012.

### Filtros na URL

`useSearchParams` aparece em duas páginas (`logs-page.tsx`,
`dashboard-page.tsx`). A leitura é validada com Zod antes de virar filtro:
`features/logs/model/filters.ts` define `levelValue`, `isoTimestamp` e
`nonEmpty`, e `parseLogFilters()` descarta silenciosamente qualquer valor
que falhe no `safeParse`. `features/analytics/model/time-range.ts` faz o
mesmo para o intervalo do dashboard (`presetSchema`, com fallback para
`24h`).

### Sem `useEffect` para derivar ou sincronizar estado

Existe exatamente um `useEffect` em todo `frontend/src`, dentro do
componente de calendário compartilhado (`shared/ui/calendar.tsx`), usado
para sincronizar foco com o DOM, o caso legítimo de sincronizar com um
sistema externo. Todo o resto usa os mecanismos equivalentes de ADR 0010:

- Progresso de importação: `refetchInterval` em `use-import-job.ts`, que
  para de repetir sozinho quando o job chega a um estado terminal.
- Preferência de tema (claro/escuro/sistema): `useSyncExternalStore` sobre
  `window.matchMedia`, em `app/theme/theme-store.ts`.
- Scroll infinito: `IntersectionObserver` criado dentro de um ref callback,
  em `features/logs/components/scroll-sentinel.tsx`.

## Telas

**Dashboard** (`/`, `dashboard-page.tsx`): um card por métrica
(`ErrorRateCard`, `NewIssuesCard`, `TopIssuesCard`, `SpikesCard`,
`ByServiceCard`), cada um com seu próprio hook e portanto seu próprio
carregamento, erro e skeleton, independente dos demais. O intervalo de
tempo é lido da URL e aplicado a todos os cards.

**Logs** (`/logs`, `logs-page.tsx` + `LogsView`): tabela virtualizada com
filtros (nível, intervalo, serviço, busca textual) que compõem a query da
API, e paginação por scroll infinito.

**Imports** (`/imports`, `imports-page.tsx`): upload por dropzone
(`ImportDropzone`), acompanhamento de progresso do job ativo via polling
(`ImportProgress`), e histórico de importações (`ImportHistory`), sempre
visível.

**Issues** (`/issues`, `issues-page.tsx`): texto estático, sem dados. Ver
nota acima.

## Tabela virtualizada e cursor

`features/logs/components/logs-grid.tsx` usa `useVirtualizer` de
`@tanstack/react-virtual`, com altura de linha fixa
(`ROW_HEIGHT = 32`, em `log-row.tsx`) usada tanto na estimativa do
virtualizador quanto no estilo da linha.

O cursor composto `(timestamp, id)` é resolvido inteiramente no backend
(`domains/logs/queries/list-logs.ts`, `queries/cursor.ts`); o frontend o
trata como um token opaco, recebido em `nextCursor` e reenviado como um
único parâmetro `cursor` na próxima página (`features/logs/model/pagination.ts`,
`features/logs/api/list-logs.ts`). A paginação avança por
`IntersectionObserver` sobre um elemento sentinela
(`scroll-sentinel.tsx`), não por cálculo de posição de scroll.

## Design tokens e tema

`shared/ui/tokens.css` define as variáveis CSS em `:root` (tema claro) e
`.dark` (tema escuro), consumidas via `hsl(var(--x))` na configuração do
Tailwind. Categorias: cores de superfície e semânticas
(`--background`, `--foreground`, `--primary`, `--border`, etc.), severidade
(`--severity-trace` a `--severity-fatal`, com uma variante `-subtle` de
cada), gráfico (`--chart-1` a `--chart-5`), e outras (`--radius`,
`--row-height`, `--font-sans`, `--font-mono`).

Cada feature tem um teste `no-literal-colors.test.ts` que varre o código
fonte da feature em busca de cor literal (hex, `rgb`, `hsl` fora de
`var()`), reforçando que a única fonte de cor são os tokens.

O tema (claro, escuro, sistema) é aplicado antes da primeira renderização
por um script bloqueante em `index.html`, que lê `localStorage` e
`prefers-color-scheme` e aplica a classe `.dark` antes do React montar,
evitando o flash de tema errado. Em runtime, `app/theme/theme-store.ts`
mantém a preferência sincronizada com o sistema operacional via
`useSyncExternalStore`.

## Responsividade

Desktop-first, conforme ADR 0010: a grade do dashboard vai de uma coluna
por padrão a duas em `sm` e quatro em `xl`
(`features/analytics/components/dashboard-grid.tsx`). A barra de navegação
não colapsa em um menu; usa `flex flex-wrap`, de forma que os links quebram
para uma nova linha em telas estreitas em vez de esconder atrás de um
gatilho. A tabela de logs rola horizontalmente dentro do próprio container
(`overflow-auto` com um conteúdo de largura mínima maior que o viewport
estreito), sem empurrar o restante da página.

## Acessibilidade

O container da tabela declara `role="grid"` com `aria-rowcount` calculado
por `features/logs/model/aria.ts` (`-1` enquanto há mais páginas por vir,
per o padrão WAI-ARIA de grid, e a contagem exata quando não há mais
páginas). Cada linha declara `role="row"` e `aria-rowindex`, cada célula
`role="gridcell"`.

Navegação por teclado: as setas para cima e para baixo movem o foco entre
linhas, com o padrão de roving tabindex (`tabIndex={0}` só na linha
focada). `Enter` é tratado na barra de filtros, para confirmar o filtro de
serviço digitado, não na grade em si.

## Documentação relacionada

- [overview.md](overview.md), como o frontend se conecta ao backend.
- [ADR 0010](../adr/0010-arquitetura-de-frontend.md), o porquê da
  arquitetura de estado e da tabela virtualizada.
- [ADR 0011](../adr/0011-legibilidade-e-acessibilidade.md), o porquê da
  tokenização visual e das decisões de acessibilidade.
- [ADR 0012](../adr/0012-contrato-de-api.md), o porquê do cliente gerado a
  partir do OpenAPI.
- [testing-strategy.md](../testing-strategy.md), o que é testado no
  frontend e o que não é.
