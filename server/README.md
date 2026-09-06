# Camada server-side

Esta pasta contém código que **nunca deve ser executado no navegador**.

## Responsabilidades

- OAuth do Bling;
- renovação de access token;
- comunicação REST com Bling;
- futuramente: endpoints internos usados pelo Admin e pelo Make;
- futuramente: armazenamento privado de tokens, clientes, carrinhos e conversas.

## Não é um novo automatizador

O projeto continua usando:

- **Make** para WhatsApp em tempo real;
- **GitHub Actions** para rotinas em lote/agendadas;
- esta camada apenas como API segura do Admin, necessária porque OAuth secrets não podem existir no frontend.

## Arquivos atuais

- `bling/oauth.mjs`: troca de authorization code e refresh token com JWT (`enable-jwt: 1`).
- `bling/client.mjs`: cliente REST com tratamento de 429 e intervalo mínimo entre requests.

## Pendente

Ainda não escolhemos o armazenamento/hospedagem definitivo. Por isso não existe endpoint HTTP público nem token store implementado nesta fase.

O código foi mantido sem dependência de framework para facilitar implantação posterior em um serviço serverless/container barato.
