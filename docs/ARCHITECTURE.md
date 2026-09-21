# Arquitetura — Chat Commerce OS

## Decisão central
O sistema será um **monólito modular multi-tenant**. Um único núcleo comercial atende várias organizações, com isolamento por `organization_id` e políticas RLS no Supabase.

## Camadas

### Experience
- Chat web próprio
- Admin / Inbox
- Futuro: WhatsApp adapter
- Futuro: Instagram adapter

### Application
- Chat
- Customer / CRM
- Commerce
- AI Orchestrator
- Automation
- Integrations

### Data
- PostgreSQL / Supabase
- Auth apenas para equipe/admin
- Storage para mídias
- Realtime para mensagens
- Queues/Cron em fases posteriores

## Regra de identidade
`customer_id` é o identificador interno permanente. Telefone, CPF, e-mail, sessão web e futuros IDs de canais são identidades associadas, nunca a chave primária do cliente.

## Regra de IA
A IA não calcula preço, estoque, total ou cria registros diretamente. Ela chama ferramentas de domínio que validam e executam ações.

Exemplos futuros:
- `find_products`
- `find_baskets_by_budget`
- `add_cart_item`
- `create_order`
- `repeat_last_order`
- `handoff_to_human`

## Customer 360
Dados factuais e inferências ficam separados.

**Fatos**
- pedidos
- itens
- mensagens
- eventos
- endereços usados
- pagamentos

**Derivações**
- ticket médio
- frequência de recompra
- afinidade por produto
- cesta preferida
- estágio de jornada

As derivações devem ser recalculáveis a partir dos fatos.

## Segurança
- RLS em toda tabela exposta;
- `service_role` nunca no frontend;
- autorização por organização e membership;
- logs de auditoria para ações administrativas;
- segredos somente no backend/Vault;
- nenhum canal externo é fonte da verdade do cliente.

## Performance
- mobile first;
- imagens responsivas;
- payloads pequenos;
- paginação no inbox;
- contexto de IA resumido e sob demanda;
- evitar polling quando Realtime for suficiente.

## Evolução
A arquitetura suporta múltiplas empresas desde o início, mas o produto V1 expõe apenas o necessário para Dona Antônia.
