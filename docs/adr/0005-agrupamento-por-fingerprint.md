# ADR 0005 — Agrupamento de eventos por fingerprint

- **Status:** Aceita
- **Data:** 2026-09-08

## Contexto

Uma plataforma que apenas lista e filtra logs entrega pouco valor analítico.
Uma tela com 1,2 milhão de linhas e um gráfico de volume total não responde a
pergunta que o time de operações realmente faz: *o que está quebrado, desde
quando, e está piorando?*

O problema é que o mesmo erro aparece milhares de vezes com variações
irrelevantes — um UUID diferente, outro IP, outra duração em ms. Contados
como eventos distintos, viram ruído. Agrupados, viram um problema.

Este é o conceito central de ferramentas como Sentry, e é o que transforma
volume em informação.

## Decisão

Calcular um **fingerprint** por registro no momento da ingestão e manter uma
entidade `Issue` agregando todos os eventos de mesma assinatura.

### Normalização da mensagem

Antes do hash, a mensagem é tokenizada. O resultado da normalização é uma
**sequência ordenada de spans tipados**: trechos de texto fixo intercalados
com spans variáveis, cada um carregando a sua espécie. A assinatura vem de
uma serialização canônica dessa sequência — uma string derivada, detalhe
interno do cálculo, que não é exibida nem persistida.

```
"User 8f3a-21b failed login from 192.168.1.44 after 3200ms"
                        ↓
[texto "User "] [uuid] [texto " failed login from "] [ip]
[texto " after "] [num] [texto "ms"]
                        ↓
fingerprint = sha1(serialização canônica + service_name + severity_number)
```

Espécies reconhecidas: UUID, IP (v4 e v6), número, hexadecimal longo,
timestamp, caminho com identificador, e-mail, e valores entre aspas.

A notação `<uuid>`, `<ip>`, `<num>` usada neste documento — e a notação
`⟨id⟩` usada no ADR 0011 — é **ilustrativa**. Nenhuma forma de colchete é
valor armazenado; as duas descrevem a mesma sequência de spans. Quem
renderiza escolhe a representação visual de cada espécie (ADR 0011).

### Escopo do corpo considerado

O agrupamento usa a **primeira linha não vazia do corpo**, com espaços em
sequência colapsados. O corpo completo é preservado em `raw` (ADR 0002) e
exibido no detalhe da ocorrência.

O trade-off é assumido: a primeira linha agrupa demais quando a mensagem de
topo é genérica — `Internal server error` cobre causas distintas. Isso é
contido pela presença de `service_name` e `severity_number` na assinatura, e
o refinamento já previsto é o fingerprint hierárquico descrito em
*Revisitar quando*.

### Serviço e severidade ausentes

Nem toda fonte traz serviço, e nem toda severidade é determinável (ADR 0002).
Cada ausência contribui para a assinatura com um **sentinela estável**,
escolhido de forma que não possa ocorrer naturalmente como valor real.
Registros sem serviço agrupam entre si e nunca se confundem com um serviço
existente; o mesmo vale para severidade.

Não se assume o nível mais baixo da escala no lugar da severidade ausente.
Isso transformaria "não classificado" em um nível real, misturaria registros
sem severidade com registros genuinamente de nível mínimo e distorceria a
taxa de erro que o dashboard calcula.

### Entidade Issue

```
issue
├─ fingerprint        (único)
├─ sample_message     amostra representativa
├─ severity_number
├─ first_seen         primeira ocorrência
├─ last_seen          última ocorrência
├─ event_count        contador
├─ affected_services  serviços distintos atingidos
└─ status             unresolved | resolved | ignored
```

O upsert por `fingerprint` acontece no mesmo lote da inserção dos eventos,
dentro da mesma transação.

### O que isso habilita no dashboard

Métricas que só existem porque há agrupamento:

- **New issues** — fingerprints vistos pela primeira vez na janela. É o sinal
  mais útil que a plataforma produz.
- **Regression** — issue marcado como resolvido que voltou a ocorrer.
- **Spike** — issue crescendo N× acima da média da janela anterior.
- **Blast radius** — quantos serviços ou hosts distintos o mesmo issue atinge.

A alternativa a essas métricas seria "total de logs" e distribuição por
nível, que são números de vaidade: mudam sempre, e não indicam ação.

## Alternativas consideradas

**Agrupar por mensagem exata.** Trivial de implementar. Inútil na prática:
qualquer identificador dinâmico na mensagem gera um grupo por evento.

**Agrupar por similaridade textual (trigram, Levenshtein) em tempo de
consulta.** Mais tolerante a variações que a normalização por regex não
prevê. Descartado por custo: comparação par a par não escala, e o
agrupamento precisa estar pronto na ingestão para que o dashboard seja
responsivo.

**Clusterização por embedding.** Capturaria similaridade semântica, não só
sintática. Descartado por adicionar dependência de modelo, custo e latência
de ingestão, com ganho marginal sobre normalização por regex no domínio de
logs — que é altamente formulaico.

**Não agrupar.** Descartado: é a decisão que separa este projeto de um CRUD
de logs com filtro.

## Consequências

**Positivas**
- Reduz o dashboard de milhões de eventos a dezenas de problemas acionáveis.
- Habilita a família de métricas de tendência (novo, regressão, pico).
- O custo é pago uma vez na ingestão, não a cada consulta.

**Negativas**
- Normalização por regex é heurística: pode agrupar demais (dois erros
  distintos com a mesma forma) ou de menos (variação não prevista). Mitigado
  por incluir `service_name` e severidade no hash, e por manter a amostra
  visível para inspeção.
- Mudar as regras de normalização invalida fingerprints existentes. Um
  reprocessamento a partir de `raw` seria necessário — outro motivo para a
  decisão do ADR 0002.

## Revisitar quando

A taxa de agrupamento indevido for perceptível na operação. O próximo passo
seria fingerprint hierárquico (agrupar por stack trace quando presente, cair
para a mensagem quando não), como Sentry faz.
