# R8 — Admin mínimo do cérebro — Dona Antônia PapoAI Commerce OS

Atualizado: 22/09/2026.

## Objetivo
Admin próprio do Commerce OS, separado do inbox/chat do PapoAI, para observar, testar e ajustar o cérebro comercial sem editar código.

## Estado
- programação: **completa**;
- smoke físico: **pendente**;
- `get_papoai_r8_readiness_v1().programming_complete=true`;
- único blocker: `r8_physical_admin_smoke_pending`;
- `ready_for_r9=false` até o smoke;
- produção continua OFF.

## Runtime
- `admin-service-intelligence-v1`: **v9 ACTIVE**;
- `admin-pin-auth-v1`: **v6 ACTIVE**;
- UI publicada como página estática do site oficial em `https://donaantonia.com.br/admin/commerce-os/`;
- autenticação reutiliza Supabase Auth + `admin_users`;
- navegador recebe somente publishable key; service role fica server-side;
- não existe inbox/chat duplicado.

O projeto atingiu o limite de Edge Functions do plano. Por isso a R8 foi incorporada à Edge Admin existente em vez de criar uma nova função. Todas as ações antigas foram preservadas e as novas usam prefixo `r8_`.

## Áreas
1. Visão geral — readiness, métricas, pedidos e planner recente.
2. Inteligência — modelos, limites, política comercial, canal, preços de modelo, versionamento/rollback.
3. Conhecimento — conhecimento, orientações e procedimentos.
4. Produtos — produto + conhecimento comercial.
5. Clientes e memória — contexto e memória não sensível.
6. Pedidos — observação de conversão/sync, sem ativar Bling.
7. Saúde — readiness, erros e Handoff Assistido.
8. Simulador — mesmo planner do Commerce OS, sem efeitos colaterais.

## Simulador
- usa `get_papoai_ai_context_pack_v3`;
- usa `planPapoAiTurn`;
- opcionalmente usa contexto real por telefone;
- executa somente tools READ;
- WRITE e COMMITMENT ficam bloqueadas;
- registra resposta, decisão, tools, contexto, tokens, latência e custo estimado;
- `external_side_effect=false`.

## Estruturas adicionadas
- `papoai_admin_config_versions`;
- `papoai_admin_simulator_runs`;
- `papoai_model_price_profiles`;
- `papoai_admin_web_sessions` (reservada, não necessária no fluxo atual).

As tabelas novas têm RLS e não possuem grants para `anon`/`authenticated`.

## Segurança
- alterações exigem owner/admin/manager;
- rollback e preço de modelos exigem owner;
- campos editáveis são explicitamente allowlisted;
- `production_activation_authorized` não é editável pela R8;
- gates de IA/write/Bling/learning não são liberados pela UI;
- simulador nunca executa write;
- memória manual bloqueia chaves obviamente sensíveis;
- CSP bloqueia frames e limita origens/conexões;
- service role nunca vai ao navegador.

## Gate formal
RPC: `get_papoai_r8_readiness_v1()`.

Antes do smoke:
- programming_complete=true;
- physical_admin_smoke_verified=false;
- ready_for_r9=false;
- blocker único = `r8_physical_admin_smoke_pending`.

## Smoke físico mínimo
1. abrir UI;
2. autenticar com PIN;
3. confirmar Visão Geral e Saúde;
4. abrir Simulador;
5. simular uma mensagem simples;
6. confirmar resposta + decisão + tools/métricas;
7. nenhum write/cliente/Bling deve ser afetado.

Depois do smoke, registrar evidência, confirmar `ready_for_r9=true`, salvar checkpoint e iniciar R9.


## Correção de hosting — 22/09/2026

O primeiro smoke exibiu o HTML como texto puro no domínio `*.supabase.co/functions/v1/...`.

Causa confirmada: Supabase Hosted Edge Functions não servem HTML no domínio padrão; respostas `text/html` são reescritas para `text/plain` sem custom domain.

Correção aplicada:
- frontend movido para `https://donaantonia.com.br/admin/commerce-os/`;
- arquivo publicado em `osvaldosereia/SUCEDOAN12:main/admin/commerce-os/index.html`;
- `admin-service-intelligence-v1` promovida para **v9**;
- GET da Edge agora redireciona para a UI estática;
- POST continua sendo a API autenticada;
- readiness atualizado para exigir `r8_admin_ui_hosted=true`, não HTML embutido na Edge;
- blocker continua somente `r8_physical_admin_smoke_pending`.
