# Current State — Chat Commerce OS

**Data:** 2026-09-21  
**Repositório:** `osvaldosereia/CHAT`  
**Branch:** `chat-commerce-foundation-r1-20260921`  
**PR:** #1 — Draft  
**Supabase:** `qxstkwshuvplmmftrctj` — Chat Commerce OS  
**Região:** `sa-east-1`

## Estado atual

### Fundação
- arquitetura monólito modular multi-tenant;
- Customer 360 desde a primeira conversa;
- contratos TypeScript e event ledger;
- migration baseline canônica;
- seed da Dona Antônia;
- configuração das Edge Functions versionada.

### Dados da Dona Antônia
- 1 organização ativa;
- 1.670 produtos ativos com preço migrados;
- 1.667 produtos com imagem;
- 9 cestas oficiais;
- 222 linhas de composição de cestas;
- 18 ofertas ativas;
- IDs legados preservados para rastreabilidade de migração.

### Chat Core
- sessão pública com token próprio e expiração;
- tabelas comerciais sem acesso direto do visitante;
- gateway público `chat-gateway-v1`;
- idempotência de mensagens;
- rate limit por origem/sessão;
- conversa compassada no frontend;
- busca de produtos;
- cards de cestas/ofertas/produtos;
- carrinho real no Supabase;
- bloqueio de produto sem estoque;
- pedido de atendimento humano.

### Checkout
- fechamento dentro da conversa;
- coleta progressiva de nome;
- telefone e resolução de identidade do cliente;
- endereço;
- pagamento na entrega;
- revisão;
- confirmação;
- snapshot do pedido;
- snapshot dos componentes da cesta;
- evento de pedido confirmado.

### Inbox humano
- API autenticada `admin-inbox-v1`;
- membership obrigatória por organização;
- roles owner/admin/manager/agent/viewer;
- fila de conversas;
- detalhe de conversa/cliente/pedidos;
- assumir atendimento;
- devolver para assistente;
- responder como humano;
- encerrar;
- trilha de auditoria de assignment/handoff.

### Homologação publicada
- Chat cliente: `https://qxstkwshuvplmmftrctj.supabase.co/functions/v1/chat-web-v1`
- Admin: `https://qxstkwshuvplmmftrctj.supabase.co/functions/v1/admin-web-v1`

O admin exige usuário Supabase Auth + membership ativa; nenhum bootstrap público inseguro foi criado.

### Segurança
- RLS em tabelas expostas;
- visitante não acessa tabelas centrais diretamente;
- `public_chat_sessions` sem SELECT para anon/authenticated;
- RPC de rate limit executável somente por service_role;
- pg_trgm fora do schema public;
- anon validado com 0 linhas visíveis em products/customers/conversations;
- authenticated sem membership validado com 0 organizações/produtos/pedidos.

## Próximos passos
1. criar primeiro usuário owner via fluxo seguro de Auth;
2. homologar chat completo no navegador;
3. homologar inbox humano;
4. substituir polling do inbox por Realtime privado;
5. melhorar Customer Context Builder;
6. iniciar AI Core mínimo somente após a jornada determinística estar estável;
7. migrar/normalizar endereços históricos e preferências quando necessário.

## Observação
O Supabase Caneca Fácil `ijquzclfijwfgwupoxmg` continua pausado; não foi excluído definitivamente porque a integração disponível não expõe exclusão de projeto.
