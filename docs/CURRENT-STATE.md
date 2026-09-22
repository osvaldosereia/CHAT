# CURRENT STATE — PapoAI Commerce OS

Atualizado: 21/09/2026
Status: PROJETO APROVADO / IMPLEMENTAÇÃO EM ANDAMENTO

## Fontes oficiais
- GitHub: `osvaldosereia/CHAT`
- Branch: `papoai-commerce-os-live-20260921`
- Supabase: `ssbesxgaijknwsjbsbcz`
- Canal: PapoAI / WhatsApp

## Runtime
- Edge: `papo-external-agent-v1`
- versão auditada: v28
- request/session/text_reply: verificados em laboratório
- media_reply: observado na UI
- button/list/flow/handoff/silent: precisam homologação física

## Catálogo
- produtos totais: 1.814
- ativos: 1.673
- tecnicamente vendáveis: 1.415
- conhecimento determinístico: 1.415/1.415
- busca do Commerce Brain não depende mais de `is_whatsapp_active`

Testes já corrigidos: arroz Tio Bonini, desodorante feminino, shampoo/cabelo crespo e expansão de fraldas/outros produtos fora do antigo pool de 306.

## Comércio implementado
- cestas e composição;
- carrinho;
- personalização;
- substituição e substituição delegada;
- ofertas;
- cliente/contexto e memória;
- recompra;
- checkout progressivo;
- pedido;
- idempotência;
- precedência humana;
- Bling identity guard;
- Governor RESPOND/ASK/RECOMMEND/ACT;
- limite de 2 perguntas;
- regra “você decide”.

## Estratégia aprovada
- IA ativa como atendente principal;
- GPT-5.6 Terra para turnos conversacionais importantes;
- GPT-5.6 Luna para tarefas auxiliares;
- dados/contexto sob demanda;
- Supabase executa regras e cálculos;
- PapoAI cuida do canal/inbox humano;
- recursos Meta via capability adapter e fallbacks;
- Admin separado, sem inbox.

## Gates
Continuam OFF até homologação:
- ai_enabled
- write_enabled
- commerce_enabled
- governor_enabled
- bling_queue_enabled
- learning_enqueue_enabled
- agent_learning_write_enabled

## R2 — CONCLUÍDA

AI Core, contexto, tools, executor e planner de observação concluídos.

Entregue:
- `papoai_ai_runtime_config` com política Terra/Luna;
- AI Runtime mantido OFF;
- Context Pack v1 compacto e sem PII desnecessária;
- 21 tools registradas e prontas;
- nenhuma tool runtime-enabled neste checkpoint;
- executor seguro `execute_papoai_ai_tool_v1`;
- auditoria de tools;
- planner estruturado `papoai-ai-planner-v1`;
- telemetria de modelo, tokens, cache, latência, decisão e tools propostas;
- planner integrado à Edge somente em modo `observe` e sem efeito no cliente;
- Edge `papo-external-agent-v1` em v30;
- filtros de produto alinhados ao catálogo real de 1.415 vendáveis;
- teste comprovou produto com `is_whatsapp_active=false` pesquisável pelo cérebro;
- tentativa de execução real permanece bloqueada por `ai_runtime_not_active`.

Próxima rodada: **R3 — Vendedora humanizada e Governor comercial**, executada inteira antes de avançar.

Plano completo:
`docs/PROGRAMMING-PLAN-TO-PRODUCTION.md`


## R3 — CONCLUÍDA

Vendedora humanizada e Governor comercial concluídos.

Entregue:
- política comercial configurável `papoai_commercial_policy_config`;
- oportunidade comercial determinística `none / weak / strong`;
- sinal `weak` não interrompe a necessidade principal;
- sinal `strong` pode permitir uma única oferta contextual;
- oferta proativa proibida durante checkout, confirmação, humano e após recusa;
- oferta proativa exige política comercial explicitamente habilitada;
- rejeições continuam registradas e entram em cooldown;
- Governor v2 força `RECOMMEND` após “você decide” e após 2 perguntas;
- Context Pack v2 inclui jornada, sinal comercial e ação pendente;
- busca personalizada v2 suporta teto de preço e prioridade por preço/produto habitual;
- mudança de ideia cancela ação pendente incompatível;
- planner Terra recebeu regras de vendedora ativa, natural e orientada a fechamento;
- normalizador do planner corrige violações comerciais antes de qualquer futura execução;
- Edge `papo-external-agent-v1` atualizada para v31;
- telemetria registra jornada, próximo passo, sinal comercial e ajustes de política;
- índice de performance criado para `papoai_commerce_turns.customer_id`.

Testes concluídos:
- none/weak/strong;
- comprador recorrente => strong;
- oferta fraca => weak;
- limite de oferta => none;
- “você decide” => RECOMMEND;
- terceira pergunta => RECOMMEND;
- orçamento máximo respeitado;
- strong permitido fora de checkout;
- strong suprimido durante checkout;
- mudança de ideia cancela pending action;
- AI Runtime, Commercial Policy e runtime tools continuam OFF.

Próxima rodada: **R4 — Channel Adapter Meta/PapoAI + multimodal**, executada inteira antes de avançar.


## R4 — CONCLUÍDA

Channel Adapter Meta/PapoAI e multimodal concluídos em código.

Entregue:
- Edge `papo-external-agent-v1` atualizada para v35;
- capability matrix canônica para text, image, voice, buttons, list, flow, handoff, silent, typing, read receipt, inbound audio e inbound image;
- resolução automática de formato com fallback;
- texto permanece capability verificada;
- imagem está `observed_ui`, mas continua bloqueada até verificação física;
- botões/listas caem para texto numerado;
- Flow cai para conversa progressiva;
- typing/read receipt viram no-op se não comprovados;
- contrato PapoAI aceita mensagem somente de áudio ou imagem;
- `media_refs` estruturados no evento normalizado;
- URLs assinadas de mídia não são persistidas;
- host, MIME, tipo e IDs podem ser persistidos com segurança;
- áudio: pipeline `gpt-4o-mini-transcribe` programado;
- imagem: visão com `gpt-5.6-luna`, detail low por padrão;
- voz: pipeline `gpt-4o-mini-tts` em Opus + Storage privado + signed URL;
- mídia externa exige HTTPS + host previamente homologado em allowlist;
- inbound audio/image só processam com capability verificada + feature enabled;
- saída de imagem/voz passa pelo capability resolver;
- preferência por áudio só pode gerar voz quando o cliente usa/pede áudio e a capability está verificada;
- payload real de mídia passa a registrar automaticamente `observed_payload`, sem promover para verified;
- telemetria criada para processamento multimodal e resolução de canal;
- readiness do canal criado;
- índice de mídia criado para a FK de message.

Gates mantidos:
- Channel Runtime OFF;
- inbound audio OFF;
- inbound image OFF;
- outbound image OFF;
- outbound voice OFF;
- interactive OFF;
- Flow OFF;
- typing/read receipt OFF;
- allowlist de mídia vazia;
- AI Runtime OFF;
- Commercial Policy OFF;
- runtime tools 0.

Estado físico atual:
- text_reply: verified_lab;
- outbound image/media: observed_ui;
- áudio recebido/enviado: não verificado;
- buttons/list/Flow/handoff/silent/typing/read receipt: não verificados.

Próxima rodada: **R5 — Checkout, pedido e handoff completos**, executada inteira antes de avançar.


## R5 — CONCLUÍDA

Checkout, pedido local, snapshot imutável, idempotência e handoff concluídos.

Entregue:
- checkout v2 com estado próprio;
- máximo de 2 perguntas de checkout;
- cliente conhecido confirma endereço salvo em vez de redigitar;
- cliente novo informa somente dados faltantes;
- endereço salvo recusado: segunda pergunta combina novo endereço + pagamento;
- parser determinístico de confirmação de endereço e forma de pagamento;
- Context Pack v3 com estado de checkout sem endereço completo;
- preview final antes do pedido;
- confirmação final explícita obrigatória;
- carrinho alterado após preview força reconfirmação;
- pedido local nasce antes de qualquer fila Bling;
- snapshot imutável do pedido com hash;
- itens do pedido usam os valores efetivos do carrinho confirmado;
- confirmação repetida retorna replay idempotente e nunca duplica pedido;
- promoção de novo cliente/endereço ocorre somente na confirmação final;
- Bling continua desacoplado: falha de identidade/ERP não perde pedido local;
- fila Bling só é criada quando o gate estiver habilitado e a identidade estiver pronta;
- handoff ativa precedência humana absoluta;
- IA não retoma enquanto houver handoff aberto;
- retomada exige resolução explícita;
- Edge `papo-external-agent-v1` atualizada para v36;
- 24/24 tools prontas, 0 runtime-enabled;
- readiness R5 retorna `ready_for_r6=true`.

Testes transacionais com rollback passaram para:
- cliente novo;
- cliente conhecido;
- endereço antigo aceito;
- endereço antigo recusado;
- pagamento;
- resumo final;
- pedido local;
- snapshot;
- replay idempotente;
- carrinho alterado antes da confirmação;
- Bling habilitado sem CPF mantendo pedido local;
- handoff e bloqueio de retomada da IA.

Gates continuam OFF:
- Commerce Brain;
- write;
- AI Runtime;
- Commercial Policy;
- Channel Runtime;
- Bling queue;
- runtime tools.

Próxima rodada: **R6 — suíte de testes conversacionais**, executada inteira antes de avançar.


## R6 — CONCLUÍDA

Suíte conversacional completa concluída.

- planner real: **24/24** cenários aprovados;
- falhas críticas: **0**;
- ASK desnecessário: **0**;
- tool accuracy: **100%**;
- handoff: **2/2**;
- alucinação comercial: **0**;
- latência média do planner: **2.990 ms**;
- p95: **4.324 ms**;
- tokens: **60.648 input / 3.450 output**;
- determinístico: **24/24 assertions**;
- jornada transacional com rollback: aprovada;
- busca atualizada para `r6-tiered-v1`;
- catálogo validado com **1.415 produtos vendáveis**;
- **9 cestas ativas / 0 vazias**;
- Edge `papo-external-agent-v1`: **v40**;
- eval interno protegido pela chave de laboratório;
- migration R6 registrada no Supabase;
- workflow estático de regressão adicionado.

Bugs reais encontrados e corrigidos:
- falsos positivos por ingredientes na busca;
- tokenização de consulta;
- tool key com prefixo inventado;
- confirmação redundante na recompra;
- get_cart desnecessário na troca delegada.

Readiness: `get_papoai_r6_readiness_v1()` retorna **ready_for_r7=true**.

Todos os gates de produção continuam OFF.

Próxima rodada: **R7 — homologação física PapoAI/Meta**.
