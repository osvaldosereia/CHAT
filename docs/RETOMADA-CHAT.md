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
- O repositório `CHAT` está público; dados privados e segredos NÃO podem ser commitados.

## Já implementado

### Fundação

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

### Fase 2 — Produtos/Bling iniciada

- Tela real de Produtos criada.
- Busca por nome, SKU, GTIN e ID Bling.
- Exibição preparada para preço, estoque e status.
- Serviço de catálogo com `VITE_CATALOG_URL` configurável.
- Placeholder público vazio em `public/data/products.json`.
- Domínio `ProductCatalog` e `ProductSummary` ampliado.
- Script `scripts/bling/sync-products.mjs` criado.
- Script pagina `GET /produtos`, consulta `/estoques/saldos`, trata 429 e respeita limite de requisições.
- Dados reais do script são gravados em `runtime/`, ignorado pelo Git.
- `docs/BLING-INTEGRATION.md` documenta API, JWT, limites e segurança.

## API Bling confirmada em 06/09/2026

- Base: `https://api.bling.com.br/Api/v3`.
- OAuth 2.0.
- JWT recomendado/necessário para nova integração, com `enable-jwt: 1`.
- Access token: `expires_in` documentado em 21.600 segundos.
- Refresh token: 30 dias segundo documentação atual.
- Limite: 3 requisições/segundo e 120.000/dia.

## Próximo passo EXATO

### Fase 2B — endpoint seguro + OAuth do Bling

1. Definir/implementar um pequeno backend seguro para o Admin, sem colocar segredos no frontend.
2. Implementar callback OAuth do Bling.
3. Guardar `access_token`/`refresh_token` em armazenamento privado.
4. Implementar renovação automática JWT.
5. Expor endpoint interno seguro de produtos para o Admin.
6. Fazer a tela Produtos consumir dados reais.
7. Depois criar CRUD básico de Cestas e Conhecimento.

### Restrição atual

Não criar Action agendado que grave catálogo real no Git enquanto o repositório estiver público. Não usar access token de 6 horas como solução permanente.

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
