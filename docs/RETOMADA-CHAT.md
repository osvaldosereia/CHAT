# RETOMADA — CHAT

## Estado atual

Repositório inicializado em 06/09/2026.

### Decisões fechadas

- Projeto: Admin da Dona Antônia + automação do WhatsApp + Bling.
- Não será criado automatizador próprio.
- Make será usado somente para tempo real/webhooks e integrações síncronas necessárias.
- GitHub Actions será usado para rotinas em lote/agendadas sempre que fizer sentido.
- Bling é a fonte oficial de produtos, preço, estoque, contatos e pedidos confirmados.
- Admin é a fonte oficial das regras de atendimento, regras da empresa, conhecimento comercial das cestas e configurações da automação.
- OpenAI é inteligência conversacional; não é fonte de preço, estoque ou total do pedido.
- Pedido só é enviado ao Bling após confirmação explícita do cliente.

## Já implementado

- README com objetivo e regras de arquitetura.
- `docs/ARCHITECTURE.md` com fluxo e divisão Make x Actions.
- Base React + TypeScript + Vite.
- Dashboard responsivo inicial.
- Navegação dos módulos:
  - Dashboard
  - Produtos
  - Cestas
  - Conhecimento
  - WhatsApp
  - Pedidos
  - Configurações
- Tipos de domínio iniciais.
- Portas/interfaces para Bling, conhecimento e automação.
- `.gitignore` e `.env.example` com regra explícita de não expor segredos.
- GitHub Actions CI para instalar dependências e validar o build.

## Próximo passo EXATO

Fase 2 — conectar o MVP aos dados reais.

Ordem recomendada:

1. Definir onde o Admin terá seu armazenamento operacional e endpoint seguro.
2. Implementar autenticação OAuth do Bling no backend seguro.
3. Implementar `BlingGateway` real:
   - listar/buscar produtos;
   - obter preço e estoque;
   - buscar/criar contato;
   - criar pedido de venda.
4. Criar sincronização inicial Bling → espelho local do Admin.
5. Criar primeira tela real de Produtos consumindo o catálogo sincronizado.
6. Criar CRUD básico da base de conhecimento.
7. Só depois conectar o primeiro cenário do Make para WhatsApp texto.

## Escopo do primeiro cenário Make

Não adicionar áudio/imagem ainda.

Primeiro cenário deve fazer apenas:

```text
WhatsApp Meta
  ↓
Make recebe texto
  ↓
consulta Admin/contexto
  ↓
OpenAI
  ↓
se houver consulta de produto → Bling/Admin
  ↓
Make responde texto no WhatsApp
```

Depois que texto estiver estável:

- áudio;
- imagem;
- carrinho;
- confirmação;
- cliente;
- criação do pedido no Bling;
- handoff humano.

## Regra de continuidade

Priorizar funcionamento antes de acabamento. Não introduzir analytics avançado, RAG vetorial, múltiplos agentes, CRM completo ou editor de cenários Make antes do fluxo básico funcionar ponta a ponta.
