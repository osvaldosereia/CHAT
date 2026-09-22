# CURRENT STATE — PapoAI Commerce OS

Atualizado: 22/09/2026
Status: PROJETO APROVADO / IMPLEMENTAÇÃO EM ANDAMENTO

## Fontes oficiais
- GitHub: `osvaldosereia/CHAT`
- Branch: `papoai-commerce-os-live-20260921`
- Supabase: `ssbesxgaijknwsjbsbcz`
- Canal: PapoAI / WhatsApp

## Runtime
- Edge: `papo-external-agent-v1`
- versão ativa/auditada: **v53**
- request/session/text_reply: verificados fisicamente
- outbound image/media_reply: verificado fisicamente
- inbound image/audio: verificados
- silent: verificado fisicamente
- outbound voice: unsupported no Agent External → fallback texto
- handoff automático: único core pendente; bloqueado por contrato server-side do PapoAI

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


## R7 — PROGRAMAÇÃO CONCLUÍDA / FÍSICO PENDENTE

A parte programável da homologação PapoAI/Meta está concluída.

Entregue:
- Edge `papo-external-agent-v1` v41;
- chave v2 staged no Vault;
- autenticação dual v1/v2 comprovada;
- chave inválida retorna 401;
- rotação v1 só finaliza depois de v2 observada fisicamente;
- homologação limitada por hash do telefone + TTL;
- run/cases/evidências versionados;
- probes de texto, imagem, voz, silent e handoff;
- inbound áudio/imagem pode ser validado automaticamente por fetch + processamento;
- handoff pode ser validado pelo `session.human_required`;
- buttons/list/Flow/typing/read receipt continuam fallback/manual_setup_required por falta de shape PapoAI comprovado;
- readiness R7 criado;
- teste de begin/evidence em rollback aprovado.

Estado atual:
- `programming_complete=true`;
- `physical_homologation_complete=false`;
- `ready_for_r8=false`;
- lab real OFF;
- todos os gates de produção OFF.

Bloqueio real: definir um telefone de teste e configurar a chave v2 no Agente Externo do PapoAI. Depois executar o roteiro físico de `docs/R7-PHYSICAL-HOMOLOGATION.md`.


## R7 — CHECKPOINT FÍSICO 22/09/2026 08:40 Cuiabá

Estado real no Supabase:
- Edge `papo-external-agent-v1`: **v52 ACTIVE**;
- run físico: `44d24129-b4a0-40b9-8b2d-2ed196614dbe`;
- telefone de teste real do PapoAI: `+556599828360` (persistido na R7 apenas por hash);
- chave v2 comprovada fisicamente e rotação finalizada;
- **4/5 requisitos core verificados**;
- **1 único requisito core pendente: handoff**;
- R7 ainda `ready_for_r8=false`;
- produção continua OFF.

Capabilities físicas:
- request: verified;
- session: verified;
- text reply: verified em WhatsApp real;
- silent: verified em WhatsApp real;
- handoff: **pending**;
- outbound image: verified em WhatsApp real;
- inbound image: verified;
- inbound audio: verified;
- outbound voice: **unsupported no contrato Agent External atual**; fallback obrigatório para texto;
- buttons: manual_setup_required → fallback texto numerado;
- list: manual_setup_required → fallback texto numerado;
- Flow: manual_setup_required → fallback conversa progressiva;
- typing/read receipt: manual_setup_required → no-op.

Descobertas físicas importantes:
1. A allowlist inicial usava hash do número digitado `+5565999828360`, mas o PapoAI envia `+556599828360`. Isso foi corrigido.
2. Imagem de entrada não chega como URL/arquivo. O PapoAI envia no histórico:
   `[ANEXO IMAGE RECEBIDO]: ... description=...`
   A Edge usa essa descrição visual diretamente, evitando uma segunda chamada de visão.
3. Áudio de entrada também chega como descrição/transcrição produzida pelo PapoAI; a Edge usa essa transcrição diretamente.
4. Imagem de saída precisou compatibilidade WebP→JPEG/cache para renderizar no WhatsApp; foi confirmada visualmente.
5. Áudio de saída foi gerado corretamente (OGG/TTS válido), mas o PapoAI Agent External não renderizou após múltiplos probes; capability marcada `unsupported`, fallback `text`.
6. Silent foi confirmado: HTTP 200, `message=null`, nenhuma mensagem no WhatsApp.
7. Restou somente testar `TESTE_HANDOFF_DONA_ANTONIA` e confirmar que o PapoAI entra em atendimento humano e que a IA fica silenciosa depois.

Próximo passo obrigatório:
- abrir/renovar a janela R7 se necessário;
- enviar `TESTE_HANDOFF_DONA_ANTONIA` pelo número de teste;
- confirmar no PapoAI que a conversa foi transferida para humano;
- validar `session.human_required=true` ou evidência equivalente;
- confirmar precedência humana/silêncio;
- marcar handoff verified;
- executar `finish_papoai_r7_homologation_v1`;
- só então R7 pode ficar `ready_for_r8=true`.

Não reabrir investigação de imagem/áudio salvo se houver regressão; esses itens já foram resolvidos.


## R7 — BLOQUEIO FÍSICO FINAL DO HANDOFF — 22/09/2026 09:15 Cuiabá

- Edge `papo-external-agent-v1`: **v53 ACTIVE**;
- core: **4/5**;
- único pendente: `agent_external.handoff`;
- duas tentativas físicas com `handoff=true` não colocaram o PapoAI em atendimento humano;
- takeover manual foi comprovado e, nesse estado, o Agent External deixa de receber novos turnos;
- DevTools confirmou que o botão **Iniciar Atendimento** usa WebSocket autenticado com evento `assign_session` e resposta `assign_session_success`;
- o evento inclui `session_uid` e o `user_id` do operador que assumiu;
- não há credencial/API server-side do PapoAI configurada no Supabase;
- não será usado token de navegador nem API privada do frontend como dependência de produção;
- fail-safe local da v53 impede a IA de continuar após solicitação de handoff;
- produção continua OFF;
- `ready_for_r8=false`.

Bloqueio externo necessário para concluir R7:
obter do PapoAI o contrato oficial/server-side para takeover humano de uma sessão do **Agente Externo**, ou confirmação formal de que esse recurso não é suportado nesse contrato.


## PRE-ACTIVATION CLEANUP — 22/09/2026 09:25 Cuiabá

Enquanto aguardamos o suporte do PapoAI, foram removidos blockers antigos que já tinham evidência física suficiente:

- `external_customer_e2e_verified=true`;
- rotação da chave v2 registrada como finalizada;
- `papoai_lab_key_rotation_required=false`;
- vínculo atual PapoAI ↔ Agent External marcado como verificado;
- `agent_external.media_reply` promovido de `observed_ui` para `verified_lab` usando a evidência física já existente de outbound image;
- nenhum teste físico já aprovado foi repetido.

Resultado de `get_papoai_commerce_activation_readiness_v1()`:
- data_ready=true;
- transport_ready=true;
- safety_ready=true;
- E2E externo=true;
- rotação pendente=false;
- vínculo PapoAI=true;
- warnings=[];
- blocker legado restante: somente `production_activation_not_authorized`.

IMPORTANTE: esse readiness é anterior ao gate R7 e sozinho **não autoriza produção**.
A política canônica de ativação passa a exigir conjuntamente:
1. `get_papoai_commerce_activation_readiness_v1().ready_for_production=true`;
2. `get_papoai_r7_readiness_v1().ready_for_r8=true`.

Como a R7 ainda está 4/5 por causa do handoff, produção permanece OFF e R8 ainda não foi iniciada.

Preflight de segurança focado:
- RPCs críticos de R7/readiness/handoff são `SECURITY DEFINER`, mas `anon` e `authenticated` não possuem EXECUTE;
- `service_role` mantém EXECUTE;
- tabelas PapoAI sensíveis permanecem protegidas por RLS sem políticas públicas;
- advisors gerais do projeto possuem itens de manutenção amplos/legados, mas nenhum deles substitui ou remove o bloqueio específico do handoff R7.


## HARDENING DO GATE DE PRODUÇÃO — 22/09/2026

O RPC existente `get_papoai_commerce_activation_readiness_v1()` foi endurecido no Supabase para incorporar diretamente a R7.

Mudança:
- `ready_for_production` agora exige também `get_papoai_r7_readiness_v1().ready_for_r8=true`;
- o retorno inclui `r7_ready_for_r8` e o snapshot `r7`;
- enquanto a R7 estiver incompleta, adiciona blocker `r7_physical_homologation_incomplete`;
- a autorização explícita continua separada em `production_activation_not_authorized`.

Estado validado após a mudança:
- data_ready=true;
- transport_ready=true;
- safety_ready=true;
- external_customer_e2e_verified=true;
- api_key_rotation_required=false;
- papoai_channel_link_current_verified=true;
- media_reply=verified_lab;
- warnings=[];
- r7_ready_for_r8=false;
- ready_for_production=false;
- blockers exatamente:
  1. `r7_physical_homologation_incomplete`;
  2. `production_activation_not_authorized`.

Segurança:
- `anon` sem EXECUTE;
- `authenticated` sem EXECUTE;
- `service_role` com EXECUTE;
- advisor de segurança não reportou finding específico novo para esse RPC.

Nenhum gate foi ativado.
Produção continua OFF.


## R7 HANDOFF ASSISTIDO — 22/09/2026

- Edge atual: **v54 ACTIVE**;
- takeover automático do PapoAI: não suportado/comprovado;
- estratégia oficial: **assisted_manual**;
- fila interna de handoff: pronta;
- link direto PapoAI por `provider_session_uid`: pronto;
- precedência humana: pronta;
- pausa absoluta da IA: pronta;
- retomada explícita: pronta;
- dry-run transacional da fila aprovado;
- último teste físico do fluxo integrado preparado;
- R7 permanece 4/5 até esse teste final;
- produção OFF.


## R7 OFICIALMENTE CONCLUÍDA — 22/09/2026

- Edge: `papo-external-agent-v1` **v54 ACTIVE**;
- run R7: `44d24129-b4a0-40b9-8b2d-2ed196614dbe`;
- status: **passed**;
- core: **5/5**;
- pending: **0**;
- handoff: **verified** via `assisted_manual_handoff`;
- capability `agent_external.handoff`: **verified_lab**;
- key rotation: finalized;
- `ready_for_r8=true`;
- laboratório R7: **OFF**;
- produção: **OFF**;
- blocker de ativação restante: apenas `production_activation_not_authorized`.

Próxima etapa: **R8 — Admin mínimo do cérebro, separado, sem inbox/chat**.


## R8 — ADMIN MÍNIMO — 22/09/2026

Programação concluída, aguardando somente smoke físico.

- `admin-service-intelligence-v1`: **v10 ACTIVE**;
- `admin-pin-auth-v1`: **v6 ACTIVE**;
- UI do Commerce OS publicada em `https://donaantonia.com.br/admin/commerce-os/`;
- áreas: Overview, Intelligence, Knowledge, Products, Customers/Memory, Orders, Health, Simulator;
- simulator = sem efeitos colaterais e sem writes;
- versionamento + rollback implementados;
- RLS/service-role-only nas novas tabelas;
- production gates continuam OFF;
- `get_papoai_r8_readiness_v1().programming_complete=true`;
- blocker único: `r8_physical_admin_smoke_pending`;
- `ready_for_r9=false` até o smoke.

Documento canônico: `docs/R8-ADMIN.md`.


## Smoke R8 — correção do Simulador — 22/09/2026

Primeiro smoke físico:
- UI renderizou corretamente;
- login Admin funcionou;
- planner executou;
- decisão/tools/contexto/métricas foram exibidos;
- foi detectado erro de contrato no READ `get_basket`.

Causa:
- RPC real: `get_papoai_commerce_basket_detail_v1(p_basket_query text)`;
- Simulador enviava `p_basket`.

Correção:
- parâmetro alterado para `p_basket_query`;
- `admin-service-intelligence-v1` promovida para **v10 ACTIVE**;
- todos os 11 READs do Simulador tiveram assinatura revisada;
- teste interno read-only com dados reais passou;
- `r8_simulator_read_contract_verified=true`;
- issue: `get_basket_parameter_mismatch_fixed`.

Ainda falta somente repetir uma simulação física após a correção para marcar `r8_physical_admin_smoke_verified=true`.

## R8 OFICIALMENTE CONCLUÍDA / R9 LIBERADA — 22/09/2026

Estado canônico:
- provider WhatsApp atual: **PapoAI**;
- cérebro comercial: **Dona Antônia Commerce OS**;
- Meta Direct: **fora do escopo da fase atual**;
- `admin-service-intelligence-v1`: **v21 ACTIVE**;
- `papo-external-agent-v1`: **v62 ACTIVE**;
- `get_papoai_r8_readiness_v1().ready_for_r9=true`;
- blockers R8: **0**;
- produção: **OFF**.

Evidência física R8:
- login/Admin real;
- UI real no domínio Dona Antônia;
- Simulador executado fisicamente;
- produtos, preços, cestas, imagens e políticas reais consultados;
- contexto real de cliente testado read-only;
- writes/commitments bloqueados no Simulador.

Homologação conversacional:
- baseline: 85/96;
- segunda rodada: 90/96;
- terceira rodada após correções: **96/96**;
- suíte de estresse expandida para **153 cenários**, incluindo erros de português, abreviações e linguagem popular;
- falhas encontradas foram corrigidas por causa raiz;
- runner de homologação recebeu retry/backoff apenas para falhas técnicas transitórias de modelo;
- sobrecarga de teste é separada de regressão funcional.

PapoAI-first:
- capacidades nativas observadas no painel: condições por Mensagem da IA / Mensagem do lead; resposta texto/arquivo; template ou resposta rápida; Flow; tags; Kanban; mensagem externa; webhook; parar assistente; concluir atendimento; transferir para; delay;
- modelos nativos/Sequência aceitam botões;
- estratégia oficial: usar essas capacidades nativas sempre que possível, mesmo que a configuração inicial seja manual no painel PapoAI.

Handoff nativo preparado:
- frase canônica do cérebro: `Vou chamar uma pessoa da nossa equipe para continuar com você.`;
- próxima configuração física no PapoAI: automação com condição `Mensagem da IA contém` essa frase, seguida de `Parar resposta do assistente` + `Transferir para`;
- nenhum token/cookie/WebSocket privado será usado em produção.

Documento: `docs/PAPOAI-NATIVE-AUTOMATIONS.md`.

Terminologia comercial:
- nas respostas da Dona Antônia usar **“a prazo”**;
- o classificador pode continuar entendendo expressões populares equivalentes na entrada do cliente.

R9:
- liberada para programação;
- ativação real de clientes ainda não autorizada;
- próxima prioridade: piloto controlado PapoAI, automações nativas, writes gradualmente, pedido local e só depois Bling.


## PapoAI — WEBHOOKS NATIVOS / COMMAND BUS — 22/09/2026

Evidência visual nova no painel PapoAI:
- automação tem ação nativa `Enviar Webhook`;
- PapoAI informa que nome e telefone do contato são enviados automaticamente junto com o webhook;
- webhook de entrada tem estados Inativo/Teste/Ativo;
- modo Teste captura requisição/mapeamento e não executa ações;
- aceita exemplo ou JSON colado;
- campos JSON aninhados ficam disponíveis para mapeamento;
- webhook de entrada exige Buscar/criar contato por telefone;
- ações observadas: adicionar/remover etiquetas, mover no funil, transferir para atendente, enviar mensagem, enviar webhook, atualizar campo do contato, parar resposta do assistente, concluir atendimento e aguardar.

Implicação arquitetural:
- cérebro → PapoAI pode usar webhook de entrada como command bus oficial;
- PapoAI → Supabase pode usar automação Enviar Webhook como event bus;
- isso é preferível a API privada/WebSocket do frontend;
- novo candidato oficial para handoff: webhook de entrada com Parar resposta do assistente + Transferir para atendente.

Plano:
- ativar primeiro o atendimento básico;
- pós-venda, aprendizado humano e automações avançadas entram depois;
- documento canônico: `docs/PAPOAI-CAPABILITY-MATRIX-AND-BASIC-GOLIVE.md`.

Teste autônomo:
- uma requisição sintética de homologação foi preparada/disparada do Supabase para o webhook de entrada que estava em modo Teste;
- o pg_net permaneceu em fila no momento da verificação; não considerar o teste homologado até observar a requisição no painel PapoAI ou receber resposta HTTP.
