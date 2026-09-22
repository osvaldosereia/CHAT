# FAST PATH TO ACTIVATION — Dona Antônia PapoAI Commerce OS

Atualizado: 22/09/2026
Branch: `papoai-commerce-os-live-20260921`
Supabase: `ssbesxgaijknwsjbsbcz`

## Estado executivo

O sistema está tecnicamente muito próximo do próximo gate.

R7:
- 4/5 core verificados;
- único core pendente: `agent_external.handoff`;
- Edge `papo-external-agent-v1` v53 ACTIVE;
- fail-safe local pausa a IA imediatamente após solicitar handoff;
- takeover manual do PapoAI foi comprovado;
- takeover automático por `handoff=true` não foi comprovado;
- suporte do PapoAI foi acionado para fornecer o contrato oficial/server-side.

Produção: OFF.
R8: NÃO INICIADA.

## O que já foi eliminado como blocker

- catálogo/data readiness: OK;
- transport Agent External: OK;
- texto real: OK;
- outbound image/media: OK;
- inbound image: OK;
- inbound audio: OK;
- silent: OK;
- chave v2: observada fisicamente e rotação finalizada;
- vínculo do Agent External: verificado;
- E2E físico externo: verificado;
- safety gates de homologação: OK;
- outbound voice: resolvido como unsupported com fallback texto;
- interactive/Flow/typing/read receipt: fallbacks explícitos, não bloqueantes.

## Único bloqueio técnico externo

Precisamos da resposta oficial do PapoAI para uma destas duas conclusões:

1. **Existe contrato suportado de takeover server-side**
   - implementar somente o adapter desse contrato;
   - renovar janela R7;
   - repetir somente `TESTE_HANDOFF_DONA_ANTONIA`;
   - comprovar humano ativo + ausência de resposta da IA;
   - marcar handoff=verified;
   - executar `finish_papoai_r7_homologation_v1`;
   - confirmar `ready_for_r8=true`.

2. **O Agent External não suporta takeover automático**
   - não usar WebSocket/token privado do navegador;
   - registrar capability como limitação oficial do provider;
   - redesenhar formalmente o critério/fallback de handoff antes de qualquer piloto;
   - preservar pausa local e fila interna de `human_handoffs`.

## Política de gate para ativação

Nunca usar apenas o readiness legado.

Para avançar:
- activation readiness deve estar verde;
- R7 deve estar 5/5 e `ready_for_r8=true`;
- produção deve continuar explicitamente não autorizada até a etapa R9.

Estado atual do activation readiness após reconciliação:
- data_ready=true;
- transport_ready=true;
- safety_ready=true;
- external_customer_e2e_verified=true;
- api_key_rotation_required=false;
- papoai_channel_link_current_verified=true;
- media_reply=verified_lab;
- warnings=0;
- production_activation_authorized=false.

## Trabalho que pode ser feito enquanto aguardamos

Permitido agora, sem furar a ordem do roadmap:
- documentação/checkpoints;
- auditorias read-only;
- correção de flags stale;
- preparar comandos e checklist de ativação;
- investigar resposta oficial do provider;
- hardening que não liga gates nem inicia R8.

Não fazer antes da R7:
- ativar IA/Commerce/Write/Governor em produção;
- iniciar R8 oficialmente;
- iniciar R9;
- ativar Bling queue;
- ativar learning writes;
- depender de WebSocket privado do PapoAI.

## Assim que o PapoAI responder

A resposta do fornecedor vira a única entrada necessária.
Não repetir texto, imagem, áudio, silent ou rotação de chave.

Se o contrato oficial vier completo, a sequência restante da R7 deve ser executável em uma única rodada curta.
