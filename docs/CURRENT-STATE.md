# CURRENT STATE — PapoAI Commerce OS

Atualizado: 21/09/2026.

## Runtime atual

Supabase: `ssbesxgaijknwsjbsbcz`

Edge Function:
- `papo-external-agent-v1`
- versão auditada: v28
- ACTIVE

Transporte comprovado:
- request: verified_lab
- session: verified_lab
- text_reply: verified_lab
- media_reply: observed_ui
- button/list/flow/handoff/silent: ainda não comprovados fisicamente

## Gates

Continuam OFF até homologação real:
- Commerce Brain
- write
- AI
- Conversation Governor
- Bling queue
- learning enqueue

## Comércio já implementado

- busca de produtos;
- catálogo/cestas;
- carrinho avulso;
- personalização de cesta;
- substituição;
- substituição delegada;
- Governador RESPOND/ASK/RECOMMEND/ACT;
- máximo 2 perguntas;
- “você decide”;
- ofertas;
- contexto do cliente;
- memória;
- recompra;
- checkout progressivo;
- pedido;
- idempotência;
- precedência humana;
- proteção de identidade para Bling.

## Catálogo real

`products`:
- total: 1.814
- ativos: 1.673
- vendáveis técnicos sem `is_whatsapp_active`: 1.415
- pool atual do chat: 306
- com alguma imagem: 1.777
- sem GTIN: 27
- sem marca: 213
- sem descrição curta e longa: 1.101
- tags: 0/1.814

Conhecimento:
- `product_sales_knowledge`: 306 produtos
- 122 seeded
- 184 pending_research
- jobs de enriquecimento: 306 pending
- pesquisa web/IA de enriquecimento: OFF

Problema atual prioritário:
a busca PapoAI filtra `is_whatsapp_active=true`, reduzindo 1.415 produtos tecnicamente vendáveis para 306.

## Bloqueios externos atuais

- teste E2E com cliente/número externo;
- rotação da chave de homologação;
- confirmar vínculo atual canal/agente no PapoAI;
- autorização posterior de produção;
- verificar mídia fisicamente.

## Regra de continuidade

Não voltar a implementar inbox próprio.
Não trocar para o Supabase duplicado.
Não reconstruir o catálogo.
Usar o PapoAI ao máximo onde capacidade for comprovada.
