# ADR-0002 — Chat público não acessa tabelas diretamente

**Status:** Accepted  
**Data:** 2026-09-21

## Contexto
A V1 precisa permitir que uma pessoa converse e compre sem criar uma conta. Ao mesmo tempo, clientes, mensagens, endereços e pedidos são dados sensíveis e multiempresa.

## Decisão
O chat público utilizará um gateway controlado (Edge Function/API) para operações de sessão, mensagem e commerce. O navegador não recebe permissão direta de CRUD nas tabelas centrais.

## Motivos
- reduz superfície da Data API;
- facilita rate limiting e proteção contra abuso;
- mantém regras de negócio no servidor;
- impede que uma sessão pública tente enumerar dados;
- prepara adapters futuros de WhatsApp/Instagram usando o mesmo Application Core.

## Consequências
- haverá uma camada adicional de API;
- mensagens precisam de idempotency/client_message_id;
- sessões públicas terão token próprio de curta duração;
- Realtime público será autorizado por tópico/sessão ou entregue pelo gateway.
