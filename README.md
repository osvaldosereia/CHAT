# Caneca Fácil

MVP de atendimento via WhatsApp para criação de canecas personalizadas com OpenAI.

## Escopo inicial

O fluxo do MVP recebe texto, áudio e até três imagens de referência, constrói um briefing inteligente, gera a arte mestre horizontal, gera um mockup por IA mostrando os dois lados da caneca e conduz o cliente até a aprovação.

## Estrutura planejada

```text
apps/
  admin/   painel operacional
  api/     webhook WhatsApp e orquestrador de IA
packages/
  core/    tipos e regras compartilhadas
supabase/
  migrations/
docs/superpowers/
  specs/
  plans/
```

## Documentação

- Design aprovado: `docs/superpowers/specs/2026-09-15-caneca-facil-mvp-design.md`
- Plano de implementação: `docs/superpowers/plans/2026-09-15-caneca-facil-mvp.md`

O projeto legado anterior está preservado na branch `archive-dona-antonia`.
