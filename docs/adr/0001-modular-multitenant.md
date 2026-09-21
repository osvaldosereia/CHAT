# ADR-0001 — Monólito modular multi-tenant

**Status:** Accepted  
**Data:** 2026-09-21

## Contexto
O produto precisa começar pequeno para Dona Antônia e futuramente atender várias empresas e canais.

## Decisão
Adotar um monólito modular multi-tenant com `organization_id` como boundary de dados e módulos independentes por domínio.

## Por que
- menor custo operacional;
- menos infraestrutura prematura;
- transações simples entre chat, cliente e commerce;
- separação suficiente para evoluir;
- permite extrair serviços no futuro quando houver necessidade real.

## Consequências
- toda tabela de negócio deve definir claramente sua organização;
- regras de dependência entre módulos precisam ser explícitas;
- RLS deve ser testada como requisito de segurança;
- nenhum adapter de canal pode virar fonte primária dos dados comerciais.
