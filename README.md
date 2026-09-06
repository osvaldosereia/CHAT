# CHAT — Admin + WhatsApp + Bling

Painel operacional da Dona Antônia para administrar produtos do Bling, cestas básicas, regras de atendimento, base de conhecimento e automação do WhatsApp.

## Objetivo do MVP

Começar pequeno e funcional:

1. Admin central da operação.
2. Produtos comerciais vêm do Bling.
3. Cestas básicas recebem conhecimento adicional no Admin.
4. Regras da empresa e do atendimento ficam no Admin.
5. WhatsApp oficial da Meta é atendido via Make + OpenAI.
6. Pedido confirmado é enviado ao Bling com cliente, itens e valor final.
7. GitHub Actions executa rotinas em lote/agendadas para reduzir consumo do Make.

## Regra de arquitetura

- **Admin:** centro de gestão e configuração.
- **Bling:** fonte oficial de produtos, preços, estoque, contatos e pedidos confirmados.
- **Make:** caminho em tempo real do WhatsApp e integrações síncronas necessárias.
- **GitHub Actions:** sincronizações, validações e rotinas que não precisam ocorrer em segundos.
- **OpenAI:** entendimento e redação das respostas; nunca é fonte oficial de preço, estoque ou total do pedido.

## Estrutura inicial

```text
src/
  app/           shell e navegação do Admin
  modules/       módulos funcionais
  core/          tipos, contratos e regras compartilhadas
docs/
  ARCHITECTURE.md
  RETOMADA-CHAT.md
.github/workflows/
  ci.yml
```

## Desenvolvimento

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Segurança

Nunca commitar tokens ou segredos. Credenciais de Bling, Meta, OpenAI e Make devem ficar em variáveis de ambiente/Secrets do ambiente que executar cada integração.

## Status

Fase 1 — fundação do MVP em construção. Consulte `docs/RETOMADA-CHAT.md` para continuar o projeto em outra conversa sem perder o ponto de andamento.
