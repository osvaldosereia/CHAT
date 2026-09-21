# Current State — Chat Commerce OS

**Data:** 2026-09-21  
**Repositório:** `osvaldosereia/CHAT`  
**Branch:** `chat-commerce-foundation-r1-20260921`  
**PR:** #1 — Draft  
**Supabase:** `qxstkwshuvplmmftrctj` — Chat Commerce OS  
**Região:** `sa-east-1`

## Estado executivo

A fundação profissional já está criada. O produto deixou de ser apenas protótipo e possui banco multiempresa, Customer 360, chat web, commerce, checkout, inbox humano, reconhecimento de cliente recorrente, recompra, busca fuzzy e AI Core opcional.

## Edge Functions vivas
- `chat-gateway-v1` — **v18 ACTIVE**
- `chat-web-v1` — **v2 ACTIVE**
- `admin-inbox-v1` — **v2 ACTIVE**
- `admin-web-v1` — **v1 ACTIVE**

## Segurança
- RLS ativa nas tabelas expostas;
- isolamento por organização/membership;
- chat público sem CRUD direto nas tabelas comerciais;
- tokens de sessão próprios e rate limiting;
- service/secret não ficam no frontend;
- módulo desligado é bloqueado também no backend;
- Supabase Security Advisor: **0 lints** no último gate.

## Dona Antônia — dados carregados
- 1.670 produtos;
- 1.670 com preço;
- 1.670 com estoque informado;
- 1.667 com imagem;
- 9 cestas;
- 222 relações cesta/produto;
- 18 ofertas importadas; 1 oferta inválida foi desativada.

### Dependência de mídia
- 1.646 imagens ainda apontam para o Storage do Supabase antigo;
- 21 apontam para GitHub;
- 3 produtos estão sem imagem.
Migrar mídia é tarefa própria antes de desligar definitivamente o storage antigo.

## Chat Commerce V1
Já funciona arquiteturalmente com:
- sessão pública;
- histórico de conversa;
- typing/pacing no frontend;
- cestas;
- ofertas;
- busca de produtos;
- cards com foto;
- carrinho;
- checkout progressivo;
- confirmação de pedido;
- atendimento humano;
- idempotência;
- rate limiting.

## Busca
`search_catalog_products_v1` usa `search_text`, `pg_trgm` e `unaccent`.
Testes:
- `omo` → produtos OMO;
- `sabao roupa` → lava-roupas;
- `shampu` → shampoos mesmo com grafia imperfeita;
- `arroz bonini` → Tio Bonini em primeiro.

## Customer 360
Identidade interna: `customer_id`.

Identidades associáveis:
- telefone;
- CPF;
- e-mail;
- web_session;
- WhatsApp futuro;
- Instagram futuro;
- IDs externos futuros.

O chat web grava um visitor ID local; depois que a cliente se identifica pelo telefone, esse visitor passa a reconhecer o mesmo `customer_id` em visitas futuras.

### Customer Context Builder
`get_customer_context_v1` retorna, de forma derivada:
- última compra;
- itens da última compra;
- componentes históricos das cestas;
- cesta favorita;
- quantidade de pedidos;
- lifetime value;
- ticket médio;
- frequência média de recompra;
- produtos recorrentes;
- preferências.

## Recompra
Gateway v13+:
- reconhece intenção de repetir compra;
- `Repetir última compra`;
- `Repetir minha cesta`;
- usa preço/oferta atual;
- não copia preço histórico;
- itens indisponíveis são pulados e registrados;
- gera eventos `order.repeated` / `basket.repeated`.

## Checkout recorrente
Gateway v16+:
- cliente reconhecido não precisa informar nome novamente;
- telefone conhecido não é solicitado novamente;
- se há endereço salvo, pergunta apenas se quer usar o mesmo;
- endereço completo não é exposto no prompt;
- ainda pede forma de pagamento para confirmação atual.

## Multiempresa
`organization_settings` separa configurações por tenant:
- brand_name;
- assistant_name;
- locale;
- currency;
- timezone;
- commerce_configuration;
- experience_configuration.

Dona Antônia:
- locale `pt-BR`;
- moeda `BRL`;
- fuso `America/Cuiaba`;
- foco comercial `baskets`;
- entrega: Cuiabá e Várzea Grande;
- pagamentos na entrega.

O gateway não depende mais do nome Dona Antônia hardcoded.

## Módulos ativos da Dona Antônia
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

A ativação é conferida no backend. Desligar módulo impede a operação direta pela API.

## AI Core
Tabelas:
- `ai_agents`;
- `ai_prompt_versions`;
- `ai_runs`;
- `ai_tool_calls`.

Agente:
- key: `sales_assistant`;
- provider: OpenAI;
- model configurado: `gpt-5.6-luna`;
- estratégia: `deterministic_first_ai_fallback`;
- **enabled=false**.

O gateway v14+ já possui o roteador opcional:
1. regras determinísticas resolvem casos simples;
2. busca normal tenta resolver produto;
3. IA só entra como fallback para linguagem ambígua;
4. IA devolve intenção estruturada;
5. domínio executa a tool;
6. run/tool call ficam auditados.

**A IA paga ainda não está ativa** porque não foi configurado `OPENAI_API_KEY` no backend. Sem a chave, não há chamada nem custo.

## Inbox humano
- Supabase Auth;
- membership por organização;
- papéis owner/admin/manager/agent/viewer;
- listar conversas;
- waiting_human;
- abrir histórico;
- assumir;
- responder;
- devolver à assistente;
- encerrar;
- auditoria de assignment;
- módulo `human_inbox` validado também no backend.

Bloqueio de uso: ainda não existe primeiro usuário em `auth.users`.

## Migrations
A baseline oficial está registrada e novas mudanças passaram a usar `apply_migration`.
Inclui:
- foundation baseline;
- assignment events;
- returning customer context;
- AI Core;
- fuzzy search;
- organization settings;
- índices de performance.

## Gate de homologação externa
O ambiente de execução do ChatGPT não conseguiu resolver o domínio público Supabase para teste HTTP externo.
As Functions são reportadas como ACTIVE pelo Supabase, mas ainda precisamos abrir o chat em navegador real para homologação visual/funcional.

## Próximos blocos recomendados
1. criar conscientemente o primeiro usuário admin;
2. homologar `chat-web-v1` em navegador/celular;
3. configurar segredo OpenAI no backend e somente então ativar `sales_assistant`;
4. adicionar edição de AI/prompts/módulos pelo admin;
5. migrar imagens para o novo Storage;
6. substituir polling do inbox por Realtime privado;
7. testes automatizados de RLS/multi-tenant;
8. melhorar carrinho (quantidade/remover/trocar cesta);
9. tratamento de áudio;
10. hardening final da V1.
