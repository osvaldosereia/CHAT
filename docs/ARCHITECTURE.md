# Arquitetura do MVP — CHAT

## Objetivo

Construir rapidamente um Admin funcional para a Dona Antônia sem criar infraestrutura desnecessária.

## Fontes oficiais

| Dado | Fonte oficial |
|---|---|
| Produto | Bling |
| SKU/GTIN | Bling |
| Preço | Bling |
| Estoque | Bling |
| Cliente confirmado | Bling + espelho no Admin |
| Pedido confirmado | Bling |
| Cesta básica e conteúdo comercial | Bling + Admin |
| Regras de atendimento | Admin |
| Regras da empresa | Admin |
| Conhecimento da IA | Admin |
| Conversa/carrinho em andamento | Admin |

## Fluxo principal do WhatsApp

```text
Cliente
  ↓
WhatsApp Business Platform (Meta)
  ↓
Make
  ↓
Admin/API
  ├─ regras e conhecimento
  ├─ cestas básicas
  ├─ cliente e conversa
  └─ carrinho
  ↓
OpenAI
  ↓
Quando necessário: Bling
  ↓
Make
  ↓
WhatsApp
```

## Fechamento do pedido

```text
cliente confirma
  ↓
validar itens/preços/estoque
  ↓
identificar ou criar cliente no Bling
  ↓
criar pedido de venda no Bling
  ↓
grava Bling order id no Admin
  ↓
responde confirmação ao cliente
```

## Divisão Make x GitHub Actions

### Make
Usar somente para operações que precisam ocorrer imediatamente ou dependem do webhook do WhatsApp:

- receber mensagens da Meta;
- baixar mídia recebida;
- transcrever áudio/analisar imagem;
- consultar contexto da conversa;
- executar OpenAI no atendimento;
- consultar Bling quando necessário em tempo real;
- criar/atualizar cliente no momento da venda;
- criar pedido confirmado no Bling;
- responder ao WhatsApp;
- handoff para humano;
- templates/janela de 24 horas.

### GitHub Actions
Usar para tarefas em lote/agendadas:

- sincronização completa de catálogo;
- reconciliação de estoque/preços;
- validação de inconsistências;
- relatórios;
- backups/exportações;
- manutenção e limpeza;
- verificações periódicas de integração.

## Princípios do código

1. Módulos pequenos e independentes.
2. Integrações externas atrás de adapters/services.
3. Nenhum segredo no frontend/repositório.
4. OpenAI não calcula preço nem total.
5. Total do pedido é calculado pelo sistema.
6. Pedido só vai ao Bling após confirmação explícita.
7. Toda informação operacional importante deve ter origem rastreável.
8. Primeiro fazer funcionar; depois sofisticar.

## Módulos do MVP

### 1. Dashboard
- status das integrações;
- contagem de produtos/cestas;
- conversas abertas;
- pedidos recentes.

### 2. Produtos
- listar catálogo sincronizado do Bling;
- buscar por nome/SKU/GTIN;
- mostrar preço, estoque e status.

### 3. Cestas
- vincular cesta ao produto/composição do Bling;
- texto comercial;
- regras específicas;
- itens/composição;
- ativo no atendimento.

### 4. Conhecimento
- empresa;
- atendimento;
- entrega;
- pagamento;
- pós-venda;
- FAQs.

### 5. WhatsApp
- status da automação;
- conversas;
- bot/humano;
- pedido em andamento.

### 6. Pedidos
- carrinho em atendimento;
- confirmação;
- Bling order id;
- status.

## Fora do primeiro MVP

- analytics avançado;
- campanhas de marketing;
- RAG vetorial sofisticado;
- múltiplos agentes;
- editor visual de cenários Make;
- CRM completo;
- automação própria substituindo o Make.
