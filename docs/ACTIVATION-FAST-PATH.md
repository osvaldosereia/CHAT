# FAST PATH TO ACTIVATION — Dona Antônia PapoAI Commerce OS

Atualizado: 22/09/2026  
Branch: `papoai-commerce-os-live-20260921`  
Supabase: `ssbesxgaijknwsjbsbcz`

## Estado executivo

### R7 — concluída
- **5/5 core**;
- run `44d24129-b4a0-40b9-8b2d-2ed196614dbe` = passed;
- handoff homologado como `assisted_manual_handoff`;
- Edge `papo-external-agent-v1` v54;
- `ready_for_r8=true`.

### R8 — programação concluída
- Admin mínimo separado, sem inbox/chat;
- `admin-service-intelligence-v1` v8 ACTIVE;
- `admin-pin-auth-v1` v6 ACTIVE;
- oito áreas implementadas;
- simulator safe/no-write;
- versionamento e rollback implementados;
- `get_papoai_r8_readiness_v1().programming_complete=true`;
- único blocker: `r8_physical_admin_smoke_pending`.

### Produção
- **OFF**;
- R9 ainda não iniciada;
- activation readiness tem apenas `production_activation_not_authorized`, mas a política do projeto exige também R8 pronta para R9.

## Próxima ação exata

Executar o smoke físico mínimo da R8:
1. abrir o Admin Commerce OS;
2. autenticar com o PIN administrativo;
3. confirmar Visão Geral;
4. confirmar Saúde;
5. abrir Simulador;
6. simular uma mensagem simples;
7. confirmar resposta, decisão e métricas;
8. verificar que nenhuma ação de escrita foi executada.

Se passar:
- registrar `r8_physical_admin_smoke_verified=true`;
- confirmar `get_papoai_r8_readiness_v1().ready_for_r9=true`;
- salvar checkpoint R8;
- iniciar R9.

## R9 — caminho curto até produção

1. **Canary read-only**
   - ligar apenas reads + IA + Governor em coorte controlada;
   - write=false;
   - Bling=false;
   - learning=false.

2. **Writes comerciais controlados**
   - carrinho/personalização;
   - confirmação explícita;
   - rollback disponível.

3. **Pedido local**
   - criar pedido no Supabase;
   - idempotência;
   - snapshot imutável;
   - Bling ainda protegido.

4. **Piloto real pequeno**
   - acompanhar erro, latência, custo, handoff e conversão;
   - humano sempre prevalece.

5. **Bling controlado**
   - só após pedido local;
   - falha do Bling nunca perde pedido local.

6. **Go-live**
   - somente após gates verdes;
   - `production_activation_authorized=true` exige autorização explícita do responsável.

## Regras que continuam valendo

- não repetir homologações físicas já aprovadas;
- não usar WebSocket privado do PapoAI;
- não duplicar inbox;
- não ativar learning automático cedo;
- não ativar Bling antecipadamente;
- preços/estoque/totais continuam autoridade do Supabase;
- writes exigem confirmação/políticas do Commerce OS;
- humano tem precedência absoluta.


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
