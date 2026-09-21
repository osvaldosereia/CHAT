# Chat Commerce OS

Plataforma modular e multiempresa de comércio conversacional.

## Primeiro tenant
**Dona Antônia** — V1 focada em cesta básica, ofertas, produtos avulsos, carrinho e pedido em uma conversa simples e humanizada.

## Princípios
- experiência simples; modelo de dados preparado para evolução;
- conversa como interface principal;
- componentes visuais apenas quando ajudam a decidir;
- IA conversa e interpreta; regras comerciais executam;
- multiempresa e isolamento de dados desde o início;
- Customer 360 construído a partir de fatos, não de suposições;
- WhatsApp, Instagram e outros canais entram futuramente como adapters;
- alterações de banco sempre versionadas e auditáveis.

## Estrutura inicial
```
apps/
  chat-web/          experiência do cliente
  admin/             inbox e operação humana (próxima rodada)
packages/
  domain/            contratos independentes de framework
database/
  schema-v0.sql      desenho inicial antes da primeira migration oficial
docs/
  ARCHITECTURE.md
  PRODUCT-V1-DONA-ANTONIA.md
  ROADMAP.md
  adr/
```

## Estado
Rodada 1 — Fundação em desenvolvimento.

Branch: `chat-commerce-foundation-r1-20260921`
