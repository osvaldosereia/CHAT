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
