# Ponte Make — contrato do MVP

## Objetivo

Evitar contratar/manter um backend próprio na primeira versão.

O Make será usado somente nas ações que precisam acontecer imediatamente ou acessar credenciais protegidas:

- validar a sessão administrativa;
- consultar/alterar Bling sob demanda;
- persistir dados compartilhados do Admin enquanto não existir backend próprio;
- receber/responder WhatsApp em tempo real;
- criar contato/pedido no Bling após confirmação.

GitHub Actions continua responsável por lotes, sincronizações e tarefas agendadas que não precisam responder em tempo real.

## Segurança

O URL do webhook pode aparecer no frontend, portanto ele NÃO deve ser considerado um segredo.

Toda requisição administrativa deve carregar `adminKey` e o cenário deve comparar esse valor com um segredo configurado no Make ANTES de executar qualquer consulta, gravação ou chamada ao Bling.

A chave:

- não entra no Git;
- não entra em `VITE_*`;
- não entra em localStorage;
- é informada no Admin e mantida somente em `sessionStorage`.

Para produção, além da chave, adicionar autenticação de usuário e limitar origens/requisições. A chave de sessão é uma proteção de MVP, não substitui identidade individual de operador em uma versão madura.

## Envelope de requisição

```json
{
  "action": "system.ping",
  "requestId": "uuid",
  "adminKey": "segredo-digitado-na-sessao",
  "payload": {}
}
```

## Envelope de sucesso

```json
{
  "ok": true,
  "requestId": "uuid",
  "data": {}
}
```

## Envelope de erro

```json
{
  "ok": false,
  "requestId": "uuid",
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Operação não autorizada"
  }
}
```

## Ações da primeira versão

### `system.ping`

Valida Admin → Make.

Resposta sugerida:

```json
{
  "ok": true,
  "data": {
    "service": "chat-admin-bridge",
    "version": "0.1"
  }
}
```

### `products.search`

Uso: consulta imediata de produto durante atendimento/admin.

Payload:

```json
{
  "query": "arroz 5kg"
}
```

O Make consulta o Bling e devolve apenas campos necessários:

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "blingId": "123",
        "sku": "ARROZ-5",
        "name": "Arroz 5 kg",
        "price": 29.9,
        "stock": 18,
        "active": true
      }
    ]
  }
}
```

### `knowledge.list`, `knowledge.save`, `knowledge.delete`

Persistência compartilhada das regras oficiais da empresa.

A IA nunca altera a base automaticamente. Somente o Admin pode gravar conhecimento oficial.

### `baskets.list`, `baskets.save`, `baskets.delete`

Persistência dos metadados comerciais das cestas. Produto, preço, estoque e composição continuam pertencendo ao Bling.

### `customer.find`

Busca cliente pelo telefone/identificador do WhatsApp.

### `order.create`

Só pode ser chamado depois de confirmação explícita do cliente.

O cenário deve validar novamente preço/estoque antes de enviar o pedido de venda ao Bling.

## Primeiro cenário administrativo no Make

Fluxo mínimo:

```text
Custom Webhook
  ↓
validar adminKey
  ↓
Router por action
  ├─ system.ping
  ├─ products.search → Bling
  ├─ knowledge.* → armazenamento
  ├─ baskets.* → armazenamento
  └─ order.create → Bling
  ↓
Web response JSON
```

## Primeiro cenário WhatsApp

Separado da ponte administrativa:

```text
WhatsApp Business Cloud / evento recebido
  ↓
normalizar mensagem de texto
  ↓
obter regras + cestas relevantes
  ↓
OpenAI classifica intenção
  ↓
se produto comum → consultar Bling
  ↓
montar resposta
  ↓
WhatsApp Business Cloud / enviar mensagem
```

Não incluir áudio/imagem até o texto funcionar ponta a ponta.

## Regra de custo

- Admin: poucas operações humanas → Make é aceitável.
- WhatsApp: tempo real → Make.
- Sincronização completa, relatórios, backup, manutenção → GitHub Actions.
- Não duplicar sincronizações nos dois motores.
