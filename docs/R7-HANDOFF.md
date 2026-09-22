# R7 HANDOFF — RETOMADA EXATA

Data do checkpoint: 22/09/2026 08:40 (America/Cuiaba)

## Fontes oficiais

- GitHub: `osvaldosereia/CHAT`
- Branch: `papoai-commerce-os-live-20260921`
- Supabase: `ssbesxgaijknwsjbsbcz`
- Edge: `papo-external-agent-v1` **v52**
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
