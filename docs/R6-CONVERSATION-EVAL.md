# R6 — Conversation Evaluation Suite

Status: **CONCLUÍDA**

A R6 valida o cérebro do PapoAI Commerce OS antes da homologação física do canal. A suíte combina três camadas independentes:

1. **Planner real / OpenAI** — 24 cenários de atendimento executados com o planner real, sem executar tools nem falar com clientes.
2. **Determinístico** — intents, governor, delegação, pagamentos e confirmação de endereço.
3. **Jornada de banco** — catálogo, cesta, personalização, ofertas, checkout, pedido, recompra e handoff em transação com rollback.

## Resultado oficial

Planner live run: `08ae748e-aafd-4c69-8b7d-15ad2790b2bb`

- cenários: **24/24 aprovados**
- falhas críticas: **0**
- ASK desnecessário: **0**
- tool accuracy: **100%**
- handoff: **2/2**
- alucinação comercial detectada: **0**
- latência média: **2.990 ms**
- p95: **4.324 ms**
- input tokens: **60.648**
- output tokens: **3.450**
- cached input tokens: **0**

O custo monetário exato não é inventado: a telemetria registra tokens, mas o alias interno `gpt-5.6-terra` não possui perfil de preço configurado no projeto.

## Correções encontradas pela R6

- busca de `óleo de soja` deixava entrar produtos que apenas citavam óleo/soja em ingredientes;
- busca de `ração para cachorro` podia trazer item de cabelo;
- tokenizador de consulta tinha comportamento inconsistente;
- planner podia inventar prefixo de domínio em tool key (`checkout.set_payment_method`);
- recompra podia fazer uma confirmação redundante antes de preparar a proposta;
- troca delegada podia chamar `get_cart` desnecessariamente antes da recomendação.

Todas foram corrigidas.

## Busca R6

Ranking: `r6-tiered-v1`.

A busca agora prioriza correspondência do catálogo principal e usa conhecimento semântico quando ele realmente agrega. Sinônimos simples e previsíveis, como cachorro → cães, são normalizados sem gastar IA.

Estado medido na conclusão:
- **1.415 produtos vendáveis**
- **9 cestas ativas**
- **0 cestas ativas vazias**

## Segurança de ativação

A suíte de avaliação interna usa a Edge existente e a chave de laboratório. Não cria uma nova Edge, não fala com cliente e não executa tools comerciais durante a avaliação do planner.

Ao concluir a R6 continuaram OFF:
- Commerce Brain;
- write;
- AI Runtime;
- Commercial Policy;
- Channel Runtime;
- Bling Queue;
- runtime tools.

Próximo gate: **R7 — homologação física PapoAI/Meta**.
