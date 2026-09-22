# PLANO DE PROGRAMAÇÃO ATÉ PRODUÇÃO — Dona Antônia PapoAI Commerce OS

Status: APROVADO
Data canônica: 21/09/2026
GitHub: osvaldosereia/CHAT
Branch: papoai-commerce-os-live-20260921
Supabase oficial: ssbesxgaijknwsjbsbcz

## Objetivo de conclusão

Entregar uma atendente comercial no WhatsApp, operando via PapoAI, com IA ativa e humanizada, capaz de entender texto, áudio e imagem; reconhecer clientes e usar contexto/memória; conhecer cestas, produtos, ofertas e regras; recomendar e vender; personalizar cesta/carrinho; conduzir checkout; confirmar e criar pedido; transferir para humano no PapoAI; usar recursos oficiais Meta/PapoAI quando disponíveis; e operar com custo controlado por arquitetura, não por redução de inteligência.

## Princípios obrigatórios

1. IA é a atendente principal.
2. Supabase é a fonte de verdade.
3. PapoAI é canal/inbox humano, não cérebro.
4. OpenAI interpreta, recomenda, decide estratégia conversacional e redige.
5. Supabase calcula preço, estoque, total e executa mutações.
6. Contexto é carregado sob demanda.
7. Governor: RESPOND / ASK / RECOMMEND / ACT.
8. Máximo de 2 perguntas segmentadoras por assunto.
9. “Você decide” = delegação.
10. Oferta proativa apenas com oportunidade forte.
11. Humano ativo no PapoAI = IA silenciosa.
12. Rodadas curtas, cada uma com testes e checkpoint.

## Estado já concluído

- integração PapoAI Agent External;
- sessões e resposta texto verificadas;
- Edge papo-external-agent-v1 ativa;
- identificação/contexto de cliente;
- cestas, carrinho, personalização, substituição e substituição delegada;
- ofertas, recompra, checkout progressivo, pedido, idempotência e precedência humana;
- Governor, limite de 2 perguntas e regra “você decide”;
- 1.814 produtos no banco oficial, 1.673 ativos e 1.415 tecnicamente vendáveis;
- busca ampliada para os 1.415;
- product_sales_knowledge para 1.415/1.415;
- estratégia Meta/PapoAI/WhatsApp definida;
- Admin separado decidido, sem inbox.

## R1 — Base e catálogo real

Status: CONCLUÍDA.

- catálogo oficial consolidado;
- busca sem dependência de is_whatsapp_active;
- conhecimento determinístico para 1.415 produtos;
- buscas reais validadas.

## R2 — AI Core, contexto e tools

**Status: CONCLUÍDA — 21/09/2026**

Objetivo: transformar a IA em atendente principal sem enviar excesso de dados.

Programar Context Pack v1 com identidade/persona, regras essenciais, Conversation State, Customer Summary curto, últimas mensagens relevantes, carrinho resumido e resultados de tools apenas quando usados.

Criar Customer Summary com nome, cliente novo/recorrente, cesta frequente, produtos recorrentes, preferências declaradas, inferências confiáveis, última compra, rejeições comerciais relevantes e pedido/carrinho atual.

Tool Registry v1:
- identify_customer
- get_customer_context
- search_products
- get_product
- search_baskets
- get_basket
- get_offers
- get_cart
- add_cart_item
- remove_cart_item
- change_quantity
- replace_basket_item
- recommend_replacement
- repeat_last_purchase
- update_checkout_profile
- preview_order
- confirm_order
- request_handoff

Modelos:
- GPT-5.6 Terra para turnos conversacionais, recomendação, venda e decisão complexa;
- GPT-5.6 Luna para resumo, classificação simples e tarefas auxiliares;
- determinístico para botões, IDs, preço, estoque, cálculo e confirmação explícita.

Critério: contexto pequeno, tools claras, nenhum cálculo comercial no modelo, logs de modelo/tokens/latência/tools.

## R3 — Vendedora humanizada e comercial

Adicionar commercial_opportunity = none / weak / strong.

Comportamento:
- responder direto quando suficiente;
- perguntar somente quando muda materialmente a resposta;
- recomendar 2–3 opções;
- explicar diferenças de forma curta;
- entender orçamento, marca, finalidade e preferência;
- adaptar ranking ao cliente;
- aceitar mudança de ideia;
- não insistir em venda recusada.

Oferta inteligente:
- explícita quando solicitada;
- proativa somente com signal strong;
- máximo 1 por carrinho;
- cooldown após recusa;
- complemento relevante;
- não interromper fechamento por oferta fraca.

Jornada invisível: descoberta → escolha → personalização → complementação → checkout → confirmação → concluído.

## R4 — Channel Adapter Meta/PapoAI + multimodal

Criar capacidades canônicas:
text, image, image_caption, voice, buttons, list, flow, product, product_list, location, template, typing, handoff, silent.

Estados: verified / available_unverified / unavailable / unknown.

Fallbacks obrigatórios:
buttons→texto numerado; list→texto numerado; flow→perguntas progressivas; product→foto+legenda; product_list→até 3 produtos; voice→texto; typing→no-op; handoff→sinalização segura/manual.

Áudio recebido: obter mídia, transcrever, tratar como mensagem normal, gpt-4o-mini-transcribe inicialmente.

Imagem recebida: visão apenas quando necessária, detail low por padrão, depois consultar catálogo.

Áudio enviado: texto por padrão; voz quando cliente usa/pede áudio ou preferência estiver configurada; gpt-4o-mini-tts.

Imagem enviada: usar imagem oficial do Supabase; não gerar imagem durante venda comum.

## R5 — Checkout, pedido e handoff completos

- cliente conhecido não repete dados confiáveis;
- novo cliente fornece somente dados faltantes;
- no máximo 2 perguntas de checkout;
- endereço anterior reutilizável;
- forma de pagamento;
- preview final;
- alteração de última hora;
- confirmação explícita;
- snapshot imutável;
- idempotência;
- pedido concluído.

PapoAI humano:
request_handoff, human precedence, silent enquanto humano ativo, retomada explícita.

Bling não bloqueia piloto. Ativar depois de pedido local comprovado.

## R6 — Suíte de testes conversacionais

**Status: CONCLUÍDA — 22/09/2026**

Cenários: cliente novo, recorrente, idoso, mensagens curtas, erros de português, áudio transcrito, indeciso, mudança de ideia, “você decide”, irritado, humano.

Comércio: cesta por preço, família, composição, retirar/adicionar, substituir, busca literal, semântica, produto por necessidade, oferta explícita/proativa, recusa, recompra, checkout e pedido.

Métricas: ASK rate, perguntas desnecessárias, produto correto no top 3, tool correta, hallucination comercial, latência, tokens, custo, conclusão de pedido e handoff.

## R7 — Homologação física PapoAI/Meta

**Status: PROGRAMAÇÃO CONCLUÍDA — HOMOLOGAÇÃO FÍSICA PENDENTE**

- confirmar canal/agente;
- rotacionar chave de homologação;
- testar sessão, texto, foto+texto, áudio recebido/enviado, typing/read receipt, reply buttons, list, handoff, silent e Flow mínimo;
- registrar capabilities reais;
- nenhum recurso não verificado vira dependência obrigatória.

Flow inicial: somente checkout/endereço se comprovado.

## R8 — Admin mínimo do cérebro

Admin separado, sem inbox.

Áreas:
- Visão geral;
- Inteligência;
- Conhecimento;
- Produtos;
- Clientes/memória;
- Simulador;
- Saúde.

Tudo editável/configurável sem alterar código, com versionamento, auditoria e rollback.

Simulador mostra resposta, decisão, contexto usado, tools, produtos, custo, latência e commercial_opportunity.

## R9 — Piloto, ativação e liberação

Etapa A: ativar reads + IA + Governor.
Etapa B: ativar write + carrinho/personalização.
Etapa C: ativar pedido local.
Etapa D: piloto pequeno e monitorado.
Etapa E: ativar Bling controladamente.
Etapa F: liberação geral.

Pré-requisitos da liberação geral:
- E2E real aprovado;
- vínculo PapoAI confirmado;
- chave rotacionada;
- capabilities principais comprovadas;
- suíte crítica verde;
- custos dentro do esperado;
- nenhuma falha comercial grave;
- produção explicitamente autorizada.

## Pós-go-live — não bloqueia lançamento

- enriquecimento externo por lacuna;
- Meta Catalog em piloto;
- ampliar Flows;
- tags/campos/funil PapoAI;
- pós-venda;
- recompra 15/30 dias;
- remarketing;
- aniversário;
- customer scoring;
- aprendizado controlado.

## Definição de concluído

O projeto está concluído para uso quando texto/áudio/imagem entram corretamente; IA usa contexto certo; produtos/cestas/ofertas são encontrados sem carregar banco inteiro; conversa é natural e comercial; perguntas são necessárias; ofertas são relevantes; cesta/carrinho podem ser alterados; checkout coleta só o necessário; pedido é confirmado e criado uma única vez; humano assume no PapoAI e silencia IA; recursos Meta têm fallback; Admin controla o cérebro sem inbox; custo/tokens/latência são observáveis; piloto real passa; e produção é ativada de forma controlada.

## Ordem obrigatória

R2 → R3 → R4 → R5 → R6 → R7 → R8 → R9.

Se surgir melhoria que não bloqueia a rodada, registrar em backlog e seguir. Prioridade absoluta: colocar uma atendente excelente em uso real, não construir perfeição teórica antes do primeiro cliente.


## Regra de execução das rodadas

Cada R1, R2, R3 etc. é uma unidade completa de entrega.
Não usar subdivisões oficiais A/B/C no planejamento.
Durante a implementação podem existir commits/checkpoints técnicos pequenos, mas a rodada só é declarada concluída quando todo o seu escopo estiver programado, testado, corrigido e documentado.
