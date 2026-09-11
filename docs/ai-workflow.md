# Uso de IA e Harness Engineering

O desafio permite e incentiva o uso de IA, e pede para entender como a
solução foi estruturada e como as ferramentas foram usadas. Este documento
descreve isso de forma direta: como conduzi o desenvolvimento assistido por
IA, e por que o fiz dessa maneira.

O princípio central é que IA aqui não foi usada como vibe coding, aquele
fluxo solto de pedir código e aceitar o que vem. Foi usada dentro de limites
determinísticos que definem como o agente deve codar, cercando o código
gerado de portões que atestam funcionamento e qualidade conforme as minhas
definições. Isso é o que adaptei do princípio de Harness Engineering: uma estrutura que evita reward hacking do agente e garante escopo fechado, sem alucinação com o que não foi pedido.

## Desenvolvimento em 3 camadas

O desenvolvimento é guiado por três artefatos, cada um respondendo uma
pergunta diferente e com um ciclo de vida próprio.

Os ADRs (em docs/adr/) respondem por que uma decisão foi tomada e o que foi
descartado. São escritos uma vez e revisados quando o contexto muda.

As rules (em .claude/rules/) respondem como o código é escrito aqui. São
permanentes e valem para todo arquivo: fronteiras de dependência, estilo de
código, política de comentários, estratégia de teste, regras de frontend e
de performance.

Os gates (na skill tdd-gates) respondem em que ordem o trabalho acontece.
Também são permanentes e valem para toda mudança de comportamento.

A separação é deliberada. "Escolhi PostgreSQL em vez de MongoDB" é uma
decisão datada com alternativas, então é um ADR. "Um arquivo de query
exporta uma função" é uma restrição permanente sem alternativa a pesar,
então é uma rule. Misturar as duas tornaria ambas mais difíceis de ler. O
CLAUDE.md é o ponto de entrada que amarra tudo.

## Rules verificáveis, não aspiracionais

Uma rule que diz "siga SOLID" é inútil para um agente e para um revisor. Cada
princípio foi traduzido em algo verificável. Inversão de dependência virou
"core não importa de infra", travado por ESLint. Single responsibility virou
"um arquivo de query exporta uma função". Onde a ferramenta consegue impor a
rule, ela impõe: tsc estrito, ESLint com no-restricted-imports na fronteira
de arquitetura, Prettier. A prosa cobre só o que a ferramenta não alcança.

## O ciclo: DoDs, revisão, implementação com gates

O fluxo de cada feature seguiu a mesma forma.

Primeiro eu escrevia o plano na mão e refinava com a IA usando grilling, uma
sessão de perguntas que expõe as decisões em aberto antes de qualquer código.
Adaptei a técnica de grilling numa skill própria acoplada ao write-dod: em
vez de a IA assumir os detalhes que faltam, ela me entrevista sobre as
lacunas que os ADRs não cobrem, uma pergunta de cada vez, e só sobre o que
ainda não foi decidido. Isso puxou à tona, antes de virar código, questões
como o que fazer com severidade indeterminável, como agrupar um stack trace,
ou como tratar um timestamp ambíguo. Cada resposta minha virou um critério
de aceite. O resultado é um Definition of Done que reflete decisões que eu
tomei, não que o agente inventou.

O DoD gerado é o único ponto de aprovação manual do fluxo. Eu reviso e ajusto
antes de liberar a implementação, porque é ali que garanto que os critérios
são observáveis e que nada de escopo extra entrou.

Depois do DoD aprovado, a implementação roda pelos gates: contrato, vermelho,
verde, estático e revisão. Nenhum gate avança antes de o anterior fechar. O
comportamento padrão de um agente de código é escrever a implementação
primeiro e o teste depois, se houver. O gate do vermelho torna o teste que
falha um pré-requisito, não um acessório. É isso que impede o agente de
"passar" a tarefa sem realmente cumprir o comportamento pedido.

## Ensinar o estilo ao agente

Antes de delegar, escrevi código do meu jeito nas partes iniciais do núcleo.
Isso teve um propósito: adaptar as rules à realidade do código e ensinar ao
agente o meu estilo de codar e como eu queria o projeto. Um agente sem
referência do estilo do time usa muito mais tokens e diverge das convenções.
Com o estilo estabelecido no código e nas rules, a delegação passou a
produzir código que já nascia na convenção, em vez de precisar de correção a
cada iteração.

## Cobertura por escopo, não uniforme

Os gates completos foram aplicados em toda feature de core e nas telas
complexas que pedem verificação de ponta a ponta. Em scripts simples, código
de debug e ajustes, os gates foram cortados conscientemente, porque o retorno
não justifica o custo.

Test-first foi obrigatório onde a lógica é pura e o teste é barato: a
normalização de mensagens, o mapeamento de severidade, a paginação por
cursor. Componentes de frontend não têm unit test; a interface é coberta por
um E2E do caminho crítico. Cobertura uniforme em pouco tempo produz cobertura
uniformemente rasa. Concentrar o esforço onde a correção é difícil foi a
troca deliberada.

## Revisão e controle

O agente nunca commitou. Cada diff foi revisado por mim antes do commit e
durante os gates, olhando como o código estava sendo escrito, o comportamento
dos testes numa lógica de shift-left, e se o objetivo final foi atingido com
uma cobertura decente. Essa revisão foi o que pegou problemas que o agente
não pegaria sozinho, como um gargalo de N+1 na ingestão, uma contradição
entre dois ADRs sobre o formato de um placeholder, e um componente de UI
reimplementado à mão em vez de usar o primitivo pronto.

Os gates e as rules são o que transformam "o agente escreveu código que
funciona" em "o agente escreveu o código que eu queria, do jeito que eu
queria, com a garantia de que funciona".