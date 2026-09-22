# ROADMAP — PapoAI Commerce OS

Status: APROVADO PARA IMPLEMENTAÇÃO
Data: 21/09/2026

## Concluído
- R0 — estratégia e arquitetura canônica;
- R1 — catálogo real e conhecimento determinístico para 1.415 produtos.

## Execução restante
- R2 — AI Core, contexto, tools, executor seguro e planner de observação — **CONCLUÍDA**;
- R3 — vendedora humanizada e Governor comercial — **CONCLUÍDA**;
- R4 — Channel Adapter Meta/PapoAI + áudio/imagem/UX nativa — **CONCLUÍDA**;
- R5 — checkout, pedido e handoff completos — **CONCLUÍDA**;
- R6 — suíte de testes conversacionais — **CONCLUÍDA**;
- R7 — homologação física PapoAI/Meta — **CONCLUÍDA — 5/5 CORE; handoff assistido homologado**;
- R8 — Admin mínimo do cérebro, sem inbox;
- R9 — piloto, ativação gradual, Bling e liberação geral.

Plano detalhado:
`docs/PROGRAMMING-PLAN-TO-PRODUCTION.md`

Regra de execução:
- cada rodada é concluída por inteiro antes da próxima;
- não subdividir oficialmente em A/B/C;
- commits internos podem ser pequenos por segurança;
- para o roadmap, uma rodada só muda para CONCLUÍDA após programação + testes + correções + checkpoint.


## Aceleração enquanto R7 aguarda fornecedor

Sem iniciar oficialmente a R8, foram adiantados apenas itens de pre-activation que pertencem à consolidação da R7:

- reconciliar evidências físicas e remover blockers stale;
- confirmar E2E, chave v2 e vínculo do Agent External;
- promover media_reply com evidência já existente;
- auditar gates de segurança;
- documentar o caminho exato de ativação.

R8 foi iniciada após `ready_for_r8=true` e está com programação concluída. R9 permanece bloqueada até o smoke físico da R8.
Produção permanece OFF.


### Estado R8 — 22/09/2026
- programação: concluída;
- Admin Edge: v9;
- PIN Auth: v6;
- 8 áreas implementadas;
- simulator safe/no-write;
- versionamento/rollback: pronto;
- único blocker: `r8_physical_admin_smoke_pending`;
- `ready_for_r9=false` até a prova física.
