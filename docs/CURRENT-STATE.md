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
- baseline oficial de migration registrada;
- advisor de segurança: **0 lints**.

### Supabase
- projeto novo e isolado criado;
- Dona Antônia cadastrada como primeiro tenant;
- RLS ativa em todas as tabelas públicas;
- acesso interno isolado por membership;
- chat público sem CRUD direto nas tabelas centrais;
- rate limit público server-side;
- checkout conversacional criado;
- histórico de composição das cestas preservado em pedidos;
- trilha de auditoria de atribuição humana criada.

### Catálogo importado
- 1.670 produtos;
- 1.670 com preço;
- 1.670 com estoque informado;
- 1.667 com imagem;
- 9 cestas ativas;
- 222 relações cesta/produto;
- 18 ofertas importadas; 1 inválida foi desativada por preço promocional não inferior ao preço normal.

### Dependência de mídia
- 1.646 imagens ainda apontam para o Storage do Supabase antigo da Dona Antônia;
- 21 imagens apontam para GitHub;
- 3 produtos estão sem imagem.

A migração de mídia para o Storage do Chat Commerce OS é uma tarefa própria e **não deve bloquear** a V1 funcional, mas precisa ser concluída antes de desligar definitivamente o storage antigo.

### Chat cliente
- `chat-gateway-v1` ativo;
- `chat-web-v1` ativo;
- sessão pública com token próprio;
- idempotência de mensagens;
- rate limiting;
- restauração de histórico;
- cestas por faixa de preço;
- ofertas;
- busca de produto;
- carrinho;
- checkout progressivo;
- confirmação de pedido;
- solicitação de atendimento humano;
- UI mobile-first conectada ao gateway.

### Inbox humano
- `admin-inbox-v1` ativo e protegido por Supabase Auth;
- `admin-web-v1` ativo;
- lista de conversas;
- filtro de espera humana;
- abrir histórico;
- assumir;
- devolver à assistente;
- encerrar;
- responder;
- auditoria de atribuições.

**Bloqueio atual do inbox:** ainda não existe usuário em `auth.users`. O primeiro acesso administrativo precisa ser criado conscientemente; nenhuma senha será inventada pelo sistema.

### Módulos Dona Antônia
Ativos:
- chat
- customers
- catalog
- baskets
- offers
- cart
- orders
- human_inbox
- ai

Desligados:
- automation
- analytics
- whatsapp
- instagram

## Regras arquiteturais confirmadas
- `customer_id` é a identidade interna permanente;
- telefone/CPF/email/canais são identidades associadas;
- IA conversa/interpreta; domínio executa;
- fatos comerciais não são substituídos por inferências;
- canais externos serão adapters;
- segredos não ficam no frontend;
- experiência V1 simples; dados preparados para recompra e pós-venda.

## Próximos blocos
1. teste real do chat hospedado no navegador;
2. bootstrap consciente do primeiro usuário admin;
3. Customer Identity linking durante checkout;
4. Customer Context Builder;
5. IA conversacional mínima por tools;
6. migração das imagens para o novo storage;
7. substituir polling do inbox por Realtime privado;
8. testes automatizados RLS/multi-tenant;
9. homologação V1 Dona Antônia.

## Supabase antigo
O projeto Caneca Fácil `ijquzclfijwfgwupoxmg` foi pausado para liberar a vaga do plano gratuito.
