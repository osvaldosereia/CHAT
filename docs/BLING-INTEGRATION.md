# Integração Bling — MVP

## Objetivo

Usar o Bling como fonte oficial de produtos, preços, estoque, contatos e pedidos confirmados, mantendo o Admin como interface operacional e base das regras de atendimento.

## Decisões técnicas verificadas em 06/09/2026

- API base atual: `https://api.bling.com.br/Api/v3`.
- API v3 usa OAuth 2.0.
- Novas integrações devem utilizar JWT e enviar `enable-jwt: 1` na emissão/renovação e nas requisições autenticadas.
- `access_token` expira em aproximadamente 21.600 segundos (6 horas).
- `refresh_token` possui prazo superior, documentado pelo Bling como 30 dias.
- Limite global da conta: 3 requisições por segundo e 120.000 por dia.
- Produtos: `GET /produtos`.
- Estoque: `GET /estoques/saldos`.
- Contatos: `/contatos`.
- Pedidos de venda: `/pedidos/vendas`.

Fontes oficiais:

- https://developer.bling.com.br/bling-api
- https://developer.bling.com.br/aplicativos
- https://developer.bling.com.br/migracao-jwt
- https://developer.bling.com.br/limites

## Segurança

O repositório `osvaldosereia/CHAT` está público neste momento.

Por isso, é proibido commitarmos:

- access token;
- refresh token;
- client secret;
- estoque real privado;
- dados de clientes;
- pedidos;
- histórico de conversas.

O sincronizador `scripts/bling/sync-products.mjs` grava por padrão em `runtime/products.json`, diretório ignorado pelo Git.

## Catálogo no frontend

A tela `Produtos` consome `VITE_CATALOG_URL` quando configurado. Sem essa variável, usa o placeholder público `/data/products.json`.

Isso permite desenvolver a interface agora sem acoplar o frontend ao segredo do Bling.

## OAuth — próximo bloco

O fluxo definitivo deve ser server-to-server:

1. usuário autoriza o aplicativo no Bling;
2. callback seguro recebe o `authorization_code`;
3. backend troca o code por `access_token` + `refresh_token` usando Basic Auth com `client_id:client_secret`;
4. tokens ficam em armazenamento privado;
5. backend renova o token automaticamente;
6. frontend e Make nunca recebem `client_secret` ou `refresh_token`.

## Sincronização

Primeira versão do script já implementada:

```bash
BLING_ACCESS_TOKEN=... npm run sync:bling-products
```

Ele:

- pagina `GET /produtos` em lotes de 100;
- consulta `/estoques/saldos` em lotes;
- respeita intervalo mínimo entre requisições;
- trata `429 Too Many Requests` com espera e nova tentativa;
- normaliza o catálogo para o formato do Admin;
- grava em `runtime/products.json`.

## Por que ainda não existe Action agendado

Não vamos cometer o catálogo real em um repositório público e também não vamos usar `access_token` de 6 horas como solução permanente.

Primeiro definiremos o endpoint/armazenamento privado e o gerenciamento seguro do OAuth. Depois o GitHub Action poderá executar sincronizações periódicas sem expor dados ou tokens.
