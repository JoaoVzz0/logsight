# ADR 0007 — Docker Compose como entrega, cloud como demonstração

- **Status:** Aceita
- **Data:** 2026-09-08

## Contexto

O enunciado exige conteinerização Docker e código no GitHub, e lista
"documentação e instruções de execução" entre os critérios de avaliação.
Na prática, isso significa que **o avaliador vai clonar o repositório e
rodar localmente**. Se esse caminho falhar, nenhum ambiente publicado
compensa.

Ao mesmo tempo, publicar a aplicação tem valor demonstrativo real, e o
projeto se beneficia de tratar infraestrutura como decisão explícita e não
como detalhe de entrega.

## Decisão

**Prioridade um:** `docker compose up` funcionando do zero, sem passo manual
além de copiar o `.env.example`. Serviços: `api`, `worker`, `web`,
`postgres`, `redis`. Migrations e seed de dados de exemplo rodam na
inicialização.

**Prioridade dois:** documentação da arquitetura em nuvem no README, com
diagrama, `Dockerfile` multi-stage já compatível com Cloud Run e pipeline de
build descrito.

**Prioridade três:** deploy real, apenas se o escopo funcional estiver
concluído.

Se houver deploy, a topologia é:

| Componente | Escolha | Motivo |
|---|---|---|
| API + Web | Cloud Run | escala a zero, deploy direto de container |
| Worker | Cloud Run com alocação de CPU contínua | processamento fora de requisição |
| PostgreSQL | Neon ou Supabase | free tier e pooling de conexão |
| Redis | Upstash | free tier |
| Arquivos | Cloud Storage | contorna o limite de upload (abaixo) |

## Alternativas consideradas

**Cloud SQL e Memorystore.** Seriam a escolha correta em produção e são o
que o README indica como alvo. Descartados no escopo do desafio por custo:
Cloud SQL não tem free tier e Memorystore parte de uma faixa incompatível
com um projeto de avaliação. A decisão está registrada como consciente, não
como desconhecimento do serviço gerenciado.

**Infraestrutura como código (Terraform), VPC, load balancer.** Descartados
por desproporção: em 3 dias, aumentam superfície sem serem executados por
ninguém na avaliação.

**Publicar em vez de garantir o compose.** Descartado pela ordem de
prioridade acima — inverter isso arrisca o requisito explícito para ganhar
um bônus.

## Restrições conhecidas do Cloud Run

Três pontos que afetam o desenho e ficam registrados porque mudam a
arquitetura, não só o deploy:

**Limite de tamanho de requisição.** Cloud Run limita requisições a 32 MB
sobre HTTP/1; o limite não se aplica com HTTP/2, que precisa ser habilitado
explicitamente no serviço. Um arquivo de log de algumas centenas de MB
estoura o padrão.

A saída arquiteturalmente correta não é aumentar o limite, e sim **gerar uma
signed URL e fazer o navegador enviar o arquivo direto para o Cloud
Storage**, com o backend lendo do bucket depois. Localmente, o upload segue
direto para a API pelo compose.

**Alocação de CPU.** Cloud Run só garante CPU durante a requisição. Um
worker processando um arquivo em background é estrangulado no modelo padrão,
o que exige CPU sempre alocada, instância mínima, ou Cloud Run Jobs.

**Cold start.** Com escala a zero, o primeiro acesso paga latência de
inicialização. Instância mínima resolve, ao custo de cobrança contínua.

## Consequências

**Positivas**
- O caminho de avaliação (`clone` + `up`) é o caminho mais testado.
- As restrições do Cloud Run ficam documentadas como decisão de arquitetura,
  não descobertas em deploy.
- A escolha de banco e cache gerenciados externos é justificada por custo,
  com o alvo de produção declarado.

**Negativas**
- O ambiente publicado, se existir, não é idêntico ao local — o caminho de
  upload difere (direto para a API versus signed URL para o bucket).
- Sem IaC, o deploy não é reproduzível automaticamente.

## Revisitar quando

O projeto sair do escopo de demonstração. Nesse ponto, Cloud SQL com IP
privado, Memorystore, Terraform e ambientes separados deixam de ser
desproporcionais e passam a ser requisito.
