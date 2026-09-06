# RETOMADA — CHAT

## Estado atual

MVP 0.3 em desenvolvimento no repositório `osvaldosereia/CHAT`.

### Decisões fechadas

- Projeto: Admin da Dona Antônia + automação oficial do WhatsApp + Bling.
- Não será criado automatizador próprio.
- Make será usado somente para tempo real, webhooks e ações síncronas que precisam de credenciais protegidas.
- GitHub Actions será usado para rotinas em lote/agendadas sempre que fizer sentido.
- Bling é a fonte oficial de produtos, preço, estoque, contatos e pedidos confirmados.
- Admin é a fonte oficial das regras de atendimento, regras da empresa, conhecimento comercial das cestas e configurações da automação.
- OpenAI é inteligência conversacional; não é fonte de preço, estoque ou total do pedido.
- Pedido só é enviado ao Bling após confirmação explícita do cliente.
- O repositório `CHAT` está público; dados privados e segredos NÃO podem ser commitados.

## Já implementado

### Fundação

- React + TypeScript + Vite.
- Dashboard responsivo.
- Navegação: Dashboard, Produtos, Cestas, Conhecimento, WhatsApp, Pedidos e Configurações.
- GitHub Actions CI validando frontend e módulos server-side.
- `.gitignore` e `.env.example` com fronteira de segurança.
- documentação de arquitetura e retomada.

### Produtos / Bling

- Tela real de Produtos.
- Busca por nome, SKU, GTIN e ID Bling.
- Exibição preparada para preço, estoque e status.
- Serviço de catálogo com `VITE_CATALOG_URL` configurável.
- Placeholder público vazio em `public/data/products.json`.
- Script `scripts/bling/sync-products.mjs` com paginação, estoque, retry 429 e limite de requisições.
- Saída real em `runtime/`, ignorada pelo Git.
- `server/bling/oauth.mjs` com authorization code / refresh token e JWT.
- `server/bling/client.mjs` com produtos, estoque, contatos e pedido de venda.
- `docs/BLING-INTEGRATION.md`.

### Cestas — funcional no MVP

- CRUD de cestas no Admin.
- Campos: ID Bling, SKU, nome, descrição comercial, orientação de venda, regras de substituição e status.
- Modelo mantém Bling como dono de preço, estoque e composição.
- Persistência atual é local no navegador apenas para desenvolvimento.

### Base de conhecimento — funcional no MVP

- CRUD de regras oficiais.
- Categorias: Empresa, Atendimento, Entregas, Pagamentos, Cestas e Pós-venda.
- Busca, ativação/desativação, edição e exclusão.
- IA não aprende automaticamente com clientes.
- Persistência atual é local no navegador apenas para desenvolvimento.

### Ponte Make — código do Admin

- `src/services/makeBridge.ts` criado.
- Configuração pública via `VITE_ADMIN_BRIDGE_URL`.
- `ADMIN_KEY` nunca entra em `VITE_*` ou Git; usuário informa por sessão.
- Chave mantida apenas em `sessionStorage`.
- Tela Configurações permite salvar chave na sessão e executar `system.ping`.
- Contrato documentado em `docs/MAKE-BRIDGE.md`.
- Ações previstas: `system.ping`, `products.search`, `knowledge.*`, `baskets.*`, `customer.find`, `order.create`.

### Ponte Make — cenário criado

- Cenário criado na conta Make: `CHAT - Admin Bridge`.
- Está INATIVO propositalmente.
- Trigger `Custom Webhook` criado e corretamente associado ao cenário.
- O URL do webhook NÃO foi gravado no GitHub público.
- Modo de aprendizado foi testado e desligado sem capturar credenciais reais.
- Próxima etapa no Make é aprender a estrutura do payload e somente depois adicionar validação de `adminKey`, rotas e respostas.

## API Bling confirmada em 06/09/2026

- Base: `https://api.bling.com.br/Api/v3`.
- OAuth 2.0.
- JWT com `enable-jwt: 1` para integração nova.
- Access token: `expires_in` 21.600 segundos.
- Refresh token: 30 dias segundo documentação consultada.
- Limite: 3 requisições/segundo e 120.000/dia.

## Estratégia atual de custo

Não contratar backend próprio no primeiro MVP.

```text
ADMIN
  ↓
MAKE BRIDGE (somente operações imediatas)
  ├─ Bling
  ├─ armazenamento compartilhado
  └─ depois WhatsApp/OpenAI

GITHUB ACTIONS
  └─ lotes, sincronizações, manutenção e tarefas agendadas
```

Os módulos server-side diretos do Bling permanecem no repositório para sincronizações via Actions e para uma futura migração sem dependência do Make, mas não são requisito para colocar o primeiro MVP no ar.

## Próximo passo EXATO

### Fase 3 — completar `CHAT - Admin Bridge`

1. Colocar o webhook em modo de aprendizado.
2. Enviar uma amostra SEM segredo real com esta estrutura:

```json
{
  "action": "system.ping",
  "requestId": "uuid",
  "adminKey": "LEARN_ONLY_NOT_SECRET",
  "payload": {}
}
```

3. Ler os campos detectados pelo Make.
4. Adicionar validação obrigatória da `adminKey` ANTES de qualquer ação.
5. Adicionar `Webhook response` para `system.ping`.
6. Criar armazenamento compartilhado para `knowledge.*` e `baskets.*`.
7. Adicionar `products.search` usando Bling.
8. Somente após tudo isso ativar o cenário.
9. Configurar `VITE_ADMIN_BRIDGE_URL` fora do repositório e testar pelo Admin.
10. Migrar Cestas e Conhecimento de localStorage para a ponte Make.

### Observação operacional

O ambiente de execução desta conversa não conseguiu enviar diretamente o POST de aprendizado ao domínio `hook.eu1.make.com`. Portanto o cenário foi deixado inativo e o learning mode foi desligado para não capturar acidentalmente uma requisição qualquer.

## Primeiro cenário WhatsApp

Não adicionar áudio/imagem ainda.

```text
WhatsApp Meta
  ↓
Make recebe texto
  ↓
consulta conhecimento/cestas
  ↓
OpenAI classifica e responde
  ↓
se produto fora de cesta → Bling
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
