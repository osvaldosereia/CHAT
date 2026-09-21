# HANDOFF — Chat Commerce OS

Leia primeiro:
1. `docs/CURRENT-STATE.md`
2. `docs/ARCHITECTURE.md`
3. `docs/PRODUCT-V1-DONA-ANTONIA.md`
4. `docs/SECURITY.md`
5. `docs/ROADMAP.md`

## Fontes oficiais
- GitHub: `osvaldosereia/CHAT`
- Branch atual: `chat-commerce-foundation-r1-20260921`
- PR draft: #1
- Supabase: `qxstkwshuvplmmftrctj`

## Regra de continuidade
Antes de editar:
- confirme HEAD da branch;
- compare o source vivo das Edge Functions com o GitHub;
- preserve alterações paralelas;
- DDL somente via migration;
- rode Security Advisor após alterações de banco;
- nunca exponha secret/service keys;
- não reative WhatsApp/Instagram/automation sem decisão explícita do roadmap.

## Princípios que não devem ser revertidos
- monólito modular multi-tenant;
- RLS como boundary;
- `customer_id` interno permanente;
- canais são adapters;
- IA não controla preço/estoque/pedido;
- determinístico primeiro, IA fallback;
- Customer 360 derivado de fatos;
- experiência simples, banco preparado para evolução;
- módulo desligado deve falhar também no backend.

## Próxima continuação
Prioridade imediata:
1. bootstrap do primeiro usuário admin;
2. homologação do chat publicado;
3. carrinho editável;
4. Realtime privado no inbox;
5. ativação controlada da IA somente após segredo de backend.
