# Processo de desenvolvimento

Este documento descreve como abordei o desafio: o raciocínio inicial, as
decisões estruturais, os cortes conscientes de escopo e o que ficou como
evolução. Ele conta a parte que o código não conta, que é o porquê das
escolhas.

## Abordagem

Diante de qualquer problema, começo entendendo os requisitos antes de
escrever código. Nesse caso, o primeiro passo foi entender os formatos de
log mais comuns e relevantes, os que resolveriam a maior parte dos casos
reais. Foquei em GCP Cloud Logging e AWS CloudWatch, que são os dois
ecossistemas de cloud mais presentes, mais um formato genérico de JSON Lines
para cobrir o que não é específico de uma plataforma. Entender esses formatos
me deu a noção do que seria necessário para ler e normalizar os dados.

Com o problema mapeado, fui buscar inspiração em plataformas de
observabilidade que uso no dia a dia, como Sentry e New Relic, para entender
como esse espaço já é resolvido por ferramentas maduras. A partir disso
esbocei um protótipo visual do que seria a entrega final antes de começar a
implementar. Prototipar cedo reduz a incerteza e me deixou começar o projeto
com uma direção clara, com mais assertividade, em vez de ir descobrindo a
interface enquanto construía o backend.

## Por onde comecei

Tanto pelos requisitos quanto pelo ambiente de trabalho fica claro que,
quando se trata de logs, o volume é sempre alto. Uma plataforma que lê logs a
partir de upload de arquivo precisa, antes de tudo, de um módulo de ingestão
robusto e performático, capaz de lidar com esse upload massivo de dados sem
cair.

Por isso o módulo de ingestão foi o primeiro ponto técnico que ataquei. É o
core fundamental do projeto, porque sem uma ingestão que aguente volume nada
do que vem depois, como consulta, dashboard e agrupamento, tem dados para
operar. Comecei pelo mais difícil e mais estruturante, não pelo mais visível.

O núcleo de ingestão foi construído de dentro para fora. Primeiro a
normalização, que é a tokenização das mensagens, o mapeamento de severidade
para a escala OpenTelemetry e o modelo canônico de log. Depois os adapters
por fonte, e depois o pipeline de streaming que costura tudo. Cada peça foi
validada isoladamente antes de ser integrada.

## A decisão de design central: fingerprinting

A decisão de design mais importante do projeto foi definir o fingerprinting
como estratégia de agrupamento e, por consequência, de performance.

Plataformas nativas de log como o Logs Explorer e o CloudWatch não fazem
distinção nem agrupamento. O log é apresentado como raw, de forma repetida e
muitas vezes poluída, o que dificulta entender o que está acontecendo em cada
momento e prejudica o debug, porque o sinal se perde no ruído.

O fingerprinting resolve isso na raiz. Ocorrências que diferem só por valores
variáveis, como um identificador, um IP ou uma duração, são reconhecidas como
o mesmo problema em vez de milhares de eventos sem relação. A mensagem "User
8f3a failed login" e "User 21bc failed login" viram o mesmo issue. Isso
transforma um milhão de linhas em algumas centenas de problemas acionáveis.

É o que diferencia essa plataforma de um visualizador de log. Ela não mostra
o que aconteceu linha a linha, mostra o que está quebrado, desde quando e se
está piorando. As mesmas regras de tokenização que geram o fingerprint no
backend também dão a estrutura visual da mensagem na interface, então é uma
definição só, com dois usos.

## Escopo e ferramentas

O desenho inicial, motivado pelos requisitos de performance e processamento,
nasceu com uma arquitetura mais pesada. A ideia era usar BullMQ para
processamento assíncrono, com worker threads do Node processando em paralelo
e escrevendo na thread principal, e Redis para leitura otimizada em cache do
lado de consulta.

Todas essas ferramentas foram despriorizadas. A prioridade era entregar algo
perfeitamente funcional em pouco tempo, com menos dependências e foco em
quick-wins, para ter uma entrega de valor de forma efetiva, mas deixando
espaço para evoluir para esses cenários quando o produto ficar mais complexo.

O ponto importante é que os cortes foram feitos deixando a costura pronta
para a evolução. O processamento roda de forma síncrona, mas atrás de uma
porta (`JobQueue`) desenhada para que trocar por BullMQ seja só implementar
uma segunda implementação, sem reescrever nada. O Redis foi removido por
completo em vez de ficar como dependência morta no projeto, porque manter uma
ferramenta que nada usa é passivo, não patrimônio.

Essa disciplina de escopo também apareceu na otimização. Durante a ingestão
identifiquei via profiling um gargalo de N+1, onde o upsert de issues fazia
uma operação de banco por fingerprint, em loop. A correção foi agregar em
memória e fazer um upsert em massa numa transação única por lote, o que subiu
o throughput de forma medida, com o passo do upsert caindo de cerca de 185ms
para 18ms por lote. Medir antes e depois, achar a causa real em vez de
otimizar no escuro, e parar no ponto de retorno decrescente foram tão
importantes quanto a correção em si.

## Evolução

Com mais tempo, o caminho natural de evolução é o que foi conscientemente
deixado de fora:

Processamento assíncrono com BullMQ e worker threads, para paralelizar o
parsing, que é CPU-bound, e desacoplá-lo da escrita, que é I/O-bound, com a
resiliência a restart que o processamento in-process atual não tem. A porta
`JobQueue` já é a costura para isso.

Redis para cache das agregações do dashboard, reduzindo a carga das queries
analíticas em consultas repetidas.

Troca do `createMany` por `COPY` na inserção em massa, para empurrar ainda
mais o throughput de ingestão.

E, do lado de produto, o painel de detalhe por ocorrência na tela `/issues`
(timeline, trace) e as ações de resolver/ignorar expostas na UI — a lista
de issues agrupados já existe, o que falta é a navegação issue a issue.