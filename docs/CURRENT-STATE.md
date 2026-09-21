# Current State — Chat Commerce OS

**Data:** 2026-09-21  
**Repositório:** `osvaldosereia/CHAT`  
**Branch:** `chat-commerce-foundation-r1-20260921`  
**PR:** #1 — Draft  
**Supabase:** `qxstkwshuvplmmftrctj` — Chat Commerce OS  
**Região:** `sa-east-1`

## Estado atual

### Fundação
- arquitetura monólito modular multi-tenant definida;
- Customer 360 desde a V1;
- contratos TypeScript de domínio;
- event ledger inicial;
- V1 Dona Antônia documentada;
- protótipo mobile do chat criado.

### Supabase
- projeto novo e isolado criado;
- schema v0 aplicado em ambiente de desenvolvimento;
- 19 tabelas centrais criadas;
- RLS ativada em todas;
- policies de leitura por membership aplicadas;
- escrita de cliente liberada somente para staff autorizado;
- chat público sem CRUD direto nas tabelas centrais;
- índices de chaves estrangeiras e idempotência adicionados;
- advisor de segurança: **0 lints** após hardening;
- advisor de performance: apenas índices “não usados”, esperado em banco recém-criado sem tráfego.

### Primeiro tenant
Dona Antônia criada como primeira organização.

Módulos ligados:
- chat
- customers
- catalog
- baskets
- offers
- cart
- orders
- human_inbox
- ai

Módulos desligados:
- automation
- analytics
- whatsapp
- instagram

## Decisões confirmadas
- cliente possui UUID interno permanente;
- telefone/CPF/email/sessão/canais são identidades associadas;
- IA não executa regra comercial diretamente;
- fatos e inferências ficam separados;
- canais externos serão adapters;
- visitante do chat passa por gateway controlado;
- multiempresa é boundary de segurança desde o início.

## Próxima programação
1. criar Chat Core público: sessão, conversa, mensagens e idempotência;
2. gateway do chat sem acesso direto às tabelas pelo browser;
3. Realtime/private channel para operação interna;
4. primeiro inbox humano;
5. catálogo/cestas/ofertas reais da Dona Antônia;
6. Customer Context Builder e AI Core mínimo.

## Observação operacional
O projeto Supabase Caneca Fácil `ijquzclfijwfgwupoxmg` foi **pausado** para liberar a vaga do plano gratuito. Não foi excluído definitivamente porque a integração disponível não oferece operação de exclusão de projeto.
