# R7 HANDOFF — RETOMADA EXATA

Data do checkpoint: 22/09/2026 08:40 (America/Cuiaba)

## Fontes oficiais

- GitHub: `osvaldosereia/CHAT`
- Branch: `papoai-commerce-os-live-20260921`
- Supabase: `ssbesxgaijknwsjbsbcz`
- Edge: `papo-external-agent-v1` **v53**
- Run R7: `44d24129-b4a0-40b9-8b2d-2ed196614dbe`
- Adapter PapoAI: `88761df6-abe7-4759-826c-995d7c557cec`

## Estado

A R7 está praticamente concluída.

Core:
- request ✅
- session ✅
- text ✅
- silent ✅
- handoff ⏳ **ÚNICO CORE PENDENTE**

Não-core:
- outbound image ✅
- inbound image ✅
- inbound audio ✅
- outbound voice = unsupported → fallback text
- buttons/list/Flow = fallbacks definidos
- typing/read receipt = no-op

Readiness:
- `programming_complete=true`
- `physical_homologation_complete=false`
- `ready_for_r8=false`
- motivo: somente `handoff` pendente

## Próxima ação exata

1. Consultar `get_papoai_r7_homologation_status_v1('44d24129-b4a0-40b9-8b2d-2ed196614dbe')`.
2. Se a janela expirou, renovar apenas a homologação protegida para o hash já salvo do telefone real `+556599828360`.
3. No WhatsApp de teste, enviar:
   `TESTE_HANDOFF_DONA_ANTONIA`
4. Confirmar:
   - a Edge respondeu com handoff;
   - PapoAI colocou a conversa em humano;
   - nova mensagem do cliente não recebe IA;
   - `session.human_required=true` ou evidência equivalente chegou de volta.
5. Registrar `handoff=verified`.
6. Rodar `finish_papoai_r7_homologation_v1(run_id)`.
7. Confirmar `get_papoai_r7_readiness_v1().ready_for_r8=true`.
8. Só depois iniciar R8.

## Não refazer

- chave v2: já comprovada e rotação finalizada;
- texto real: já aprovado;
- imagem entrada/saída: já aprovadas;
- áudio entrada: já aprovado;
- áudio saída: já classificado unsupported com fallback texto;
- silent: já aprovado.

Produção continua OFF.


## Checkpoint 22/09/2026 08:52 — falha física de takeover detectada

Teste físico de handoff executado no WhatsApp real `+556599828360`.

Evidência:
- comando `TESTE_HANDOFF_DONA_ANTONIA` chegou à Edge;
- correlation_id do handoff: `80461a92-399a-482a-9788-258986b081e7`;
- Edge respondeu HTTP 200 com `response_kind=handoff` e `handoff=true`;
- mensagem de transferência apareceu no WhatsApp;
- mensagem seguinte `TESTE_POS_HANDOFF_DONA_ANTONIA` gerou nova resposta automática;
- correlation_id pós-handoff: `e81146e0-4d20-473b-9608-c6d71b11c3a6`;
- payload seguinte voltou com `session.status=ACTIVE` e `session.human_required=false`;
- portanto o PapoAI **não efetivou o takeover humano** e o caso `handoff` continua `attempted`, não `verified`.

Correção de segurança aplicada:
- Edge `papo-external-agent-v1` atualizada para **v53**;
- ao solicitar handoff, a sessão local do Agent External passa imediatamente para `paused` até a expiração da janela protegida;
- isso impede que a nossa IA volte a responder caso o PapoAI ignore a transferência;
- este fail-safe **não é usado como prova de handoff físico do PapoAI**;
- produção continua OFF;
- `ready_for_r8=false`.

Próxima ação física:
- revisar no PapoAI a configuração de **Transferência** do agente **Dona Antônia — Homologação**;
- confirmar destino humano/fila configurado;
- manter **“Manter IA ativa após transferência” DESLIGADO**;
- repetir somente o handoff após correção da configuração.


## Diagnóstico 22/09/2026 09:05 — estado humano real do PapoAI

Evidência física adicional:
- após o takeover manual pelo botão **Iniciar Atendimento**, a UI exibiu:
  - `Osvaldo sereia junior iniciou o atendimento`;
  - botão **Voltar IA**;
- com humano ativo, foi enviada a mensagem `TESTE_HUMANO_ATIVO_DONA_ANTONIA` pelo WhatsApp;
- essa mensagem **não chegou ao Agent External**;
- não houve nova linha em `channel_provider_agent_lab_calls`;
- não houve novo `normalized_channel_event` para a sessão;
- o último correlation_id permaneceu `0b6ec000-567b-4a8e-9df7-48f95fdded45`.

Conclusão física:
- quando um humano assume de verdade no PapoAI, o Agent External deixa de receber novos turnos;
- portanto a ausência de chamada ao endpoint + estado visual humano é evidência física equivalente de precedência humana;
- porém o takeover observado foi **manual**, não provocado automaticamente por `handoff=true`;
- por isso `handoff` permanece `attempted`, não `verified`.

Diagnóstico de integração:
- não existe no Supabase credencial/API do PapoAI para controlar o inbox;
- o adaptador PapoAI permanece `inbound_mode=active`, `outbound_mode=disabled`;
- a única integração programática atual é o endpoint Agent External;
- próximo diagnóstico: capturar a requisição real feita pela UI do PapoAI ao clicar em **Iniciar Atendimento**, para descobrir se existe ação HTTP automatizável de takeover.

Produção continua OFF e `ready_for_r8=false`.


## Diagnóstico 22/09/2026 09:15 — contrato real do takeover manual

Captura física do DevTools/Socket do PapoAI mostrou o mecanismo real usado pela UI ao clicar em **Iniciar Atendimento**:

- transporte: WebSocket autenticado da sessão do navegador;
- evento enviado pela UI: `assign_session`;
- campos observados: `session_uid` e `user_id`;
- resposta do servidor: `assign_session_success`;
- o `user_id` é o operador humano autenticado que clicou para assumir;
- não foi observado endpoint REST/server-side documentado para executar a mesma ação;
- pesquisas públicas não localizaram documentação oficial do PapoAI para takeover server-side do Agent External.

Decisão de engenharia:
- **não** reutilizar token/cookie/WebSocket da sessão do navegador no Supabase;
- **não** fixar `user_id` de operador em produção;
- **não** depender de protocolo interno/privado do frontend do PapoAI;
- manter fail-safe da Edge v53: após solicitação de handoff, nossa IA pausa localmente;
- manter fila interna `human_handoffs`/precedência humana do Commerce OS;
- takeover automático no inbox do PapoAI continua **não homologado**.

Bloqueio único restante da R7:
- obter do PapoAI um contrato server-side/documentado para transferir/atribuir uma sessão do Agent External a humano/equipe **ou** confirmar oficialmente que essa automação não é suportada;
- até isso, `handoff` permanece `attempted`, R7 segue 4/5 core e `ready_for_r8=false`.

Não repetir testes de texto, imagem, áudio, silent ou chave.


## Suporte PapoAI acionado — 22/09/2026

O pedido técnico ao suporte do PapoAI já foi enviado pelo responsável do projeto.

Pergunta pendente ao fornecedor:
- qual contrato oficial/server-side permite ao **Agente Externo** transferir uma sessão automaticamente para atendimento humano/equipe;
- se existe campo de response JSON, endpoint/API ou evento suportado;
- se o Agent External não suporta esse takeover automático.

Enquanto a resposta não chega:
- não repetir probes físicos já aprovados;
- não usar o WebSocket privado `assign_session` em produção;
- Edge v53 e fail-safe local permanecem ativos;
- R7 segue 4/5;
- produção OFF;
- R8 não iniciada;
- continuar apenas pre-activation cleanup/hardening/documentação.


## Estratégia alternativa oficial — Handoff Assistido — 22/09/2026

Decisão: não bloquear mais o avanço esperando indefinidamente por um contrato server-side do PapoAI.

Novo contrato operacional:
1. IA decide/recebe pedido de atendimento humano;
2. sistema cria `human_handoffs`;
3. conversa canônica entra em `mode=human` e `human_required=true`;
4. IA fica silenciosa por precedência humana absoluta;
5. handoff recebe `provider_session_uid` e link direto da conversa no PapoAI;
6. operador abre o link e clica **Iniciar Atendimento**;
7. para devolver à IA, o handoff precisa ser resolvido explicitamente e a conversa retomada.

Implementação:
- `queue_papoai_assisted_handoff_v1`;
- `get_papoai_assisted_handoff_queue_v1`;
- `complete_papoai_assisted_handoff_v1`;
- `queue_papoai_commerce_handoff_v1` agora delega para o modo assistido e infere o `session_uid`;
- Edge `papo-external-agent-v1` **v54 ACTIVE**;
- comando R7 `TESTE_HANDOFF_DONA_ANTONIA` agora cria a fila assistida e pausa localmente a IA.

Importante:
- takeover automático do PapoAI continua não comprovado e não será fingido;
- WebSocket privado `assign_session` continua proibido como dependência de produção;
- o core R7 de handoff será homologado pelo fluxo assistido completo: fila + pausa IA + takeover manual real no PapoAI.

Produção continua OFF até R7 concluir.


## R7 FINALIZADA — 22/09/2026

Resultado oficial:
- run: `44d24129-b4a0-40b9-8b2d-2ed196614dbe`;
- status: **passed**;
- core: **5/5 verified**;
- pending_cases: **0**;
- key_rotation_state: **finalized**;
- `finish_papoai_r7_homologation_v1` executado;
- `get_papoai_r7_readiness_v1().ready_for_r8=true`;
- laboratório R7 voltou para `enabled=false` / `mode=off`;
- produção continua OFF.

Handoff homologado no modo **assisted_manual_handoff**:
- Edge v54;
- fila `human_handoffs` criada;
- `provider_session_uid` persistido;
- link direto da conversa PapoAI persistido;
- conversa canônica entra em `mode=human`;
- `human_required=true`;
- IA pausada/silenciosa;
- operador humano assume no PapoAI manualmente;
- takeover automático privado do PapoAI não é dependência do sistema.

Próxima etapa oficial: **R8 — Admin mínimo separado, sem inbox/chat**.
