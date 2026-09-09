# ADR 0010 — Arquitetura de frontend

- **Status:** Aceita
- **Data:** 2026-09-08

## Contexto

O frontend não é apresentação do backend: é o produto. O problema que a
plataforma resolve — log bruto é desestruturado e difícil de ler — só se
resolve na interface. "Experiência do usuário (UX/UI)" e "performance" são
critérios explícitos de avaliação, e ambos se manifestam aqui.

Duas forças moldam as decisões abaixo:

- A tabela precisa exibir centenas de milhares de registros sem travar.
- Filtros são o mecanismo central de exploração, e uma investigação de
  incidente é normalmente compartilhada entre pessoas.

## Decisão

### Navegação: issues como porta de entrada

```
/              Dashboard — métricas e tendências
/issues        Lista de problemas agrupados   ← entrada padrão
/issues/:fp    Detalhe: ocorrências, timeline, serviços afetados
/logs          Tabela bruta com filtros — drill-down
/imports       Upload e histórico de jobs
```

O fluxo é **problema → ocorrências → linha bruta**. Uma home com log bruto
entregaria um visualizador de arquivo; a lista de issues entrega uma
ferramenta de observabilidade. É o ADR 0005 materializado como navegação, e
não apenas como número no dashboard.

### Estrutura

```
src/
├─ features/
│  ├─ issues/     api/ · components/ · hooks/ · pages/
│  ├─ logs/
│  ├─ analytics/
│  └─ imports/
├─ shared/
│  ├─ ui/         componentes shadcn
│  ├─ lib/        cliente http, formatadores, tokenizer
│  └─ schemas/    Zod, importado do backend
└─ app/           router, providers, layout
```

Espelha os `domains/` do backend (ADR 0008), de modo que uma mudança de
funcionalidade toca uma pasta de cada lado.

### Estado: três tipos, três mecanismos

| Tipo | Mecanismo |
|---|---|
| Estado de servidor | TanStack Query |
| Filtros e intervalo de tempo | `searchParams` na URL |
| UI local | `useState` |

**Filtros vivem na URL, não em estado local.** Nível, intervalo, busca e
serviço são `searchParams`. A consequência é operacional, não estética: a
visão é compartilhável por link — cola-se a URL no canal do incidente e o
colega vê exatamente o mesmo recorte. Navegação para trás e recarregamento
funcionam sem código adicional.

Não há gerenciador de estado global. O que pareceria global neste app é
estado de servidor (cache do TanStack Query) ou estado de URL.

### Ausência de `useEffect` para derivação e sincronização

| Situação | Mecanismo adotado |
|---|---|
| Buscar dados | TanStack Query |
| Filtros | `useSearchParams` como fonte de verdade |
| Lista derivada | cálculo no render; `useMemo` só após medição |
| Resetar estado ao trocar filtro | `key` no componente, remontando |
| Progresso de importação | `refetchInterval` no `useQuery` |
| Scroll infinito | `IntersectionObserver` via callback ref |
| Preferência de tema do sistema | `useSyncExternalStore` sobre `matchMedia` |

A regra não é "nunca usar `useEffect`". `useEffect` é o mecanismo correto
para **sincronizar com sistema externo** — atalhos de teclado com
`addEventListener` são o caso legítimo neste projeto. O que se evita é usá-lo
para derivar estado ou sincronizar estado com estado, que é a origem de
re-renders em cascata.

Sobre re-render na tabela, o custo real não está em efeitos e sim no filtro
re-renderizando as linhas virtualizadas a cada tecla. Mitigações: `debounce`
antes de escrever na URL, e `React.memo` na linha com props primitivas.
Ambas aplicadas após medição no Profiler.

### Tema claro e escuro

Escuro é o padrão, seguindo a convenção do gênero. Três estados: `light`,
`dark`, `system`.

A classe é aplicada por script bloqueante no `index.html`, antes do primeiro
paint, lendo `localStorage` e `prefers-color-scheme`. Sem isso, a página
pisca clara antes de aplicar o tema.

Consequência obrigatória: **toda cor vem de CSS variable**. Cor de severidade
e de gráfico definidas como hex no componente não trocam de tema — Recharts
inclusive lê `hsl(var(--severity-error))` em vez de valor literal.

### Tabela virtualizada

`useInfiniteQuery` com TanStack Virtual, altura de linha fixa.

**Cursor composto.** Registros colidem em timestamp; cursor apenas temporal
pula ou duplica linhas. O cursor é a tupla `(timestamp, id)`, com comparação
de linha no SQL:

```sql
WHERE (timestamp, id) < (:cursorTs, :cursorId)
ORDER BY timestamp DESC, id DESC
```

**Reset ao mudar filtro.** Os filtros compõem a `queryKey`; a troca reinicia
a paginação e o scroll retorna ao topo.

**Detalhe em painel lateral, não inline.** Expandir a linha dentro da lista
quebraria a altura fixa exigida pela virtualização. O painel lateral evita
medição dinâmica e é o padrão do gênero.

### Dashboard

Uma query por cartão, não uma consulta monolítica: cada cartão carrega,
falha e exibe skeleton de forma independente.

Os cartões seguem o ADR 0005: taxa de erro no tempo, novos issues na janela,
top issues por volume, issues em pico, distribuição por serviço. **"Total de
logs" não é exibido como número de destaque** — é a métrica de vaidade que o
ADR 0005 rejeita, e exibi-la contradiria a decisão.

### Estados de vazio, erro e carregamento

Obrigatórios em cada superfície. Vazio é chamada para ação, não tabela em
branco. Erro traz mensagem específica e ação de repetir. Carregamento usa
skeleton com a forma do conteúdo, não spinner.

## Alternativas consideradas

**Filtros em estado local ou store global.** Mais simples de implementar.
Descartada porque elimina a propriedade mais útil da ferramenta: a visão
compartilhável por link.

**Redux ou Zustand.** Descartada por ausência de estado global de cliente —
adicionar a camada seria estrutura sem conteúdo.

**Paginação numerada em vez de scroll infinito.** Defensável, e mais simples
de implementar corretamente. Descartada porque o enunciado cita scroll
infinito ou paginação otimizada, e a exploração contínua é o padrão de
interação em ferramentas de log.

**Tabela sem virtualização, apenas com página menor.** Descartada: o
enunciado exige lidar com grandes volumes, e a virtualização é a
demonstração direta desse requisito.

**Next.js com renderização no servidor.** Descartada no ADR 0001; a
aplicação é um painel autenticado e interativo, sem requisito de SEO ou de
primeiro carregamento otimizado.

## Consequências

**Positivas**
- Visões compartilháveis por URL, sem trabalho adicional.
- Cache e revalidação resolvidos por uma biblioteca, não por efeitos.
- Tabela sustenta volume alto com altura de linha previsível.

**Negativas**
- Filtros na URL exigem serialização e validação dos `searchParams` com Zod,
  já que são entrada do usuário.
- Altura de linha fixa obriga a truncar a mensagem na lista, empurrando o
  conteúdo completo para o painel lateral.
- O script bloqueante de tema é código fora do React, que precisa permanecer
  em sincronia com o provider.

## Revisitar quando

A aplicação passar a ter estado de cliente genuinamente global — múltiplas
abas de investigação abertas simultaneamente, por exemplo — momento em que um
store dedicado passaria a se justificar.
