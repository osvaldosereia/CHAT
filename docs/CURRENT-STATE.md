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
