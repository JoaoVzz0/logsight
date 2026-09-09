# ADR 0011 — Legibilidade de log e acessibilidade

- **Status:** Aceita
- **Data:** 2026-09-08

## Contexto

O problema que a plataforma resolve não é armazenar logs — é lê-los. Log
bruto é texto livre: identificadores, endereços e durações misturados à
mensagem, sem hierarquia visual, sem alinhamento, sem separação entre o que
varia e o que é constante.

Uma tabela que apenas exibe as linhas do arquivo em HTML não resolve nada
que `cat` já não resolvesse. As decisões abaixo tratam legibilidade e
acessibilidade como requisito de produto, não como acabamento.

## Decisão

### O tokenizador de fingerprint também é o realce visual

O ADR 0005 define regras de normalização que identificam UUID, IP, número,
hexadecimal, timestamp, caminho e e-mail dentro da mensagem, para calcular a
assinatura de agrupamento.

**As mesmas regras são usadas no frontend para tokenizar e colorir a
mensagem.** Identificador, valor numérico e causa recebem tratamento visual
distinto:

```
User 8f3a-21b failed login from 192.168.1.44 after 3200ms — upstream refused
     └ id                       └ ip                └ duração   └ causa
```

Uma função, dois usos: agrupa no backend, dá estrutura visual no frontend. A
plataforma não recebe estrutura pronta — ela **infere** estrutura e a exibe.

A tokenização é memoizada por linha ou aplicada na chegada dos dados, nunca
recalculada a cada frame de scroll.

### Na lista de issues, exibir o padrão, não a amostra

O issue mostra a forma normalizada, com os placeholders estilizados como
elementos distintos do texto fixo:

```
User ⟨id⟩ failed login from ⟨ip⟩ after ⟨num⟩ms
47.291 ocorrências · 3 serviços · primeira vez há 3 dias
```

Essa é a representação legível do problema. A ocorrência concreta pertence
ao detalhe, não à lista.

### Atributos como tabela clicável, nunca JSON bruto

O campo `attributes` (JSONB, ADR 0002) é renderizado como pares de
chave/valor. Clicar em um valor **adiciona o filtro correspondente** e o
escreve na URL (ADR 0010).

É o que transforma "vi um erro" em "vi todos os erros desta região" em um
clique, e é o que dá valor de interface ao JSONB, não apenas de
armazenamento. O JSON original permanece disponível em seção recolhida, com
ação de copiar — é o campo `raw`, presente para auditoria sem poluir a
leitura.

### Densidade e alinhamento

- Fonte monoespaçada no corpo do log; colunas de largura fixa
- `font-variant-numeric: tabular-nums` nos números, para que o olho varra a
  coluna verticalmente sem reler
- Severidade como **faixa na borda esquerda**, não linha inteira colorida —
  linha colorida vira ruído em densidade alta
- Tempo relativo visível, absoluto no `title`
- Cabeçalho fixo ao rolar

### Divulgação progressiva

Linha fechada: severidade, hora, serviço e mensagem truncada.
Painel de detalhe: mensagem completa tokenizada, atributos em tabela,
`trace_id` linkável e JSON original recolhido.

O `trace_id` filtra todos os registros do mesmo trace, atravessando
serviços — correlação distribuída aproveitando o campo já previsto no
modelo canônico.

### Acessibilidade

**Lista virtualizada.** O DOM contém apenas as linhas visíveis, então um
leitor de tela anunciaria "linha 1 de 30" para um conjunto de centenas de
milhares. O container declara `role="grid"` com `aria-rowcount` real, e cada
linha declara `aria-rowindex`. É a armadilha específica de tabelas
virtualizadas e é tratada explicitamente.

**Severidade nunca apenas por cor.** Cor, rótulo textual e ícone de forma
distinta (triângulo para erro, círculo para aviso). Cerca de 8% dos homens
têm alguma deficiência de percepção de cor, e um painel de erro que dependa
de vermelho e amarelo é inutilizável para eles.

**Contraste verificado nos dois temas.** Os tokens de severidade são
conferidos contra o fundo de cada tema; o vermelho padrão do Tailwind sobre
fundo cinza médio costuma ficar abaixo de 4.5:1.

**Navegação por teclado.** Setas percorrem a tabela, `Enter` abre o detalhe,
`Esc` fecha. Foco sempre visível — o outline não é removido sem substituto.

**`aria-live="polite"`** no progresso de importação, para anunciar conclusão
sem interromper.

**`prefers-reduced-motion`** desativa as transições de abertura de painel.

## Alternativas consideradas

**Exibir a mensagem como texto puro, sem tokenização.** Mais simples e sem
risco de realce incorreto. Descartada porque é exatamente o problema que a
plataforma se propõe a resolver.

**Um tokenizador próprio do frontend, separado do fingerprint.** Permitiria
regras de realce mais ricas que as de agrupamento. Descartada por duplicar
regra de domínio em dois lugares, com risco de divergência.

**Realce sintático por biblioteca genérica** (Highlight.js, Prism). Descartada
por serem orientadas a linguagens de programação, não a formatos de log.

**Renderizar atributos como JSON formatado.** Mais fiel ao dado original.
Descartada por não permitir a interação de filtro por clique, que é o que
acelera a exploração.

**Cores de severidade fixas por linha inteira.** Comum em ferramentas mais
antigas. Descartada por prejudicar a leitura em densidade alta.

## Consequências

**Positivas**
- A regra de normalização tem um único dono e dois consumidores.
- A exploração por filtro é acessível a um clique, sem digitar consulta.
- A interface é utilizável por teclado e por leitor de tela, incluindo o caso
  difícil da lista virtualizada.

**Negativas**
- Realce incorreto é possível quando a heurística de token erra; o texto
  permanece legível, apenas sem destaque adequado.
- `aria-rowcount` em lista virtualizada exige atenção a cada mudança de
  paginação, e é fácil de quebrar em refatoração.
- Verificar contraste nos dois temas é trabalho manual, sem automação neste
  escopo.

## Revisitar quando

O conjunto de fontes crescer a ponto de as regras de token divergirem entre
agrupamento e realce — momento em que o tokenizador compartilhado precisaria
expor dois modos em vez de um.
