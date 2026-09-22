# PapoAI — Capability Matrix, Command Bus e Plano de Ativação Básica

Data: 22/09/2026

## Decisão arquitetural

O **PapoAI permanece o provedor/canal canônico do WhatsApp**.
O Dona Antônia Commerce OS permanece o **cérebro comercial**.

Responsabilidade do cérebro:
- entender intenção;
- identificar cliente;
- usar histórico e memória;
- consultar catálogo, cestas, preços, estoque e ofertas;
- personalizar cesta;
- controlar carrinho/checkout;
- decidir handoff;
- decidir oportunidades comerciais;
- calcular timing de pós-venda/recompra;
- produzir comandos para o PapoAI.

Responsabilidade do PapoAI:
- sessão e canal WhatsApp;
- Agent External;
- automações;
- webhook de entrada;
- webhook de saída;
- mensagens/modelos/respostas rápidas;
- Flow;
- tags;
- funil/Kanban;
- pausa da IA;
- transferência humana;
- conclusão do atendimento;
- follow-up e disparos operacionais.

Meta Direct permanece fora do escopo da fase atual.

---

## Evidências novas confirmadas por telas do PapoAI — 22/09/2026

### 1. Automação → ação "Enviar Webhook"

Tela confirmada:
- ação nativa `Enviar Webhook`;
- campo único de URL do webhook;
- o PapoAI informa explicitamente que **nome e telefone do contato são enviados automaticamente junto com o webhook**.

Conclusão:
- existe um caminho oficial PapoAI → sistema externo;
- o payload completo ainda precisa ser capturado em um teste real;
- é candidato natural para espelhar eventos e estados no Supabase.

Status: **confirmado recurso / payload ainda não homologado**.

### 2. Webhook de entrada

Tela confirmada:
- URL pública própria do webhook;
- estados: `Inativo`, `Teste`, `Ativo`;
- modo `Teste` captura requisição e mapeamento;
- em modo Teste **as ações não são executadas**;
- aceita `Usar exemplo` ou `Colar JSON`;
- JSON aninhado é apresentado em campos mapeáveis;
- histórico de requisições recebidas.

Exemplo visível na UI:
- `event`;
- `payment.id`;
- `payment.amount`;
- `payment.status`;
- `payment.paid_at`;
- `customer.name`;
- `customer.email`;
- `customer.phone`.

Conclusão:
- o webhook de entrada é um **motor de comando oficial** para sistemas externos acionarem recursos do PapoAI;
- pode receber dados estruturados arbitrários e mapear campos para ações.

Status: **confirmado**.

### 3. Ação obrigatória do webhook de entrada

A tela mostra como primeira ação:
- **Buscar ou criar um contato**;
- telefone WhatsApp é o identificador;
- telefone pode ser mapeado de qualquer campo recebido;
- DDI + DDD + número;
- nome completo pode ser criado/atualizado;
- e-mail é opcional.

Conclusão:
- nosso cérebro pode endereçar um contato no PapoAI usando o telefone;
- o contato pode ser criado/atualizado quando necessário.

Status: **confirmado**.

### 4. Ações disponíveis no webhook de entrada

Menu observado:
- Adicionar etiquetas;
- Remover etiquetas;
- Adicionar ou mover no funil;
- Transferir para atendente;
- Enviar mensagem;
- Enviar webhook;
- Atualizar campo do contato;
- Parar resposta do assistente;
- Concluir atendimento;
- Aguardar.

Conclusão:
- o PapoAI oferece um **command bus sem API privada**;
- isso pode substituir vários hacks/integrações que seriam desnecessários;
- handoff automático pode ser implementado oficialmente via webhook de entrada;
- CRM/funil/tags podem ser controlados pelo cérebro;
- mensagens proativas podem ser disparadas pelo PapoAI;
- sincronização PapoAI ↔ Supabase pode usar webhooks oficiais.

Status: **confirmado recurso / cada ação ainda precisa de homologação física**.

---

## Arquitetura candidata de integração

### Atendimento em tempo real

```
WhatsApp
  ↓
PapoAI
  ↓ Agent External
Commerce OS / Supabase
  ↓
decisão + resposta
  ↓
PapoAI
  ↓
cliente
```

### Command bus cérebro → PapoAI

```
Commerce OS
  ↓ HTTPS
Webhook de entrada PapoAI
  ↓
Buscar/criar contato
  ↓
ação nativa configurada
  ↓
PapoAI executa
```

Casos prioritários:
1. handoff;
2. parar IA;
3. transferir para equipe;
4. tag;
5. mover funil;
6. enviar mensagem;
7. concluir atendimento.

### Event bus PapoAI → Supabase

```
Automação PapoAI
  ↓ Enviar Webhook
Supabase
  ↓
normalização + timeline + memória
```

Objetivos:
- capturar atendimento humano;
- tags;
- funil;
- conclusão;
- follow-up;
- resultados;
- aprendizado posterior.

---

## Descoberta crítica para handoff

Antes:
- `handoff:true` no Agent External não colocava o inbox do PapoAI em humano automaticamente;
- WebSocket privado `assign_session` foi observado, mas rejeitado para produção.

Agora:
- webhook de entrada oferece oficialmente:
  - `Parar resposta do assistente`;
  - `Transferir para atendente`.

Nova estratégia preferida:
1. criar webhook de entrada exclusivo de handoff;
2. mapear telefone do payload;
3. ações:
   - buscar/criar contato;
   - parar resposta do assistente;
   - transferir para atendente;
   - opcional: adicionar tag `AI_HANDOFF`;
4. cérebro chama o webhook quando decide handoff.

Isso usa apenas recursos nativos e suportados do PapoAI.

---

## Plano de ativação BÁSICA

Objetivo: colocar atendimento real no ar rapidamente sem esperar pós-venda, aprendizado e automações avançadas.

### Básico obrigatório para go-live

1. Agent External funcionando;
2. identificação do cliente por telefone quando disponível;
3. lista de 9 cestas com preços;
4. pergunta de desambiguação quando cliente pede conteúdo sem dizer qual cesta;
5. lista completa dos produtos e quantidades da cesta;
6. catálogo de produtos;
7. preços;
8. ofertas;
9. fotos quando úteis;
10. áudio recebido;
11. personalização da cesta;
12. carrinho/checkout;
13. formas de pagamento;
14. entrega Cuiabá/Várzea Grande;
15. handoff real via recurso nativo PapoAI;
16. produção com kill switch e rollback.

### Pode entrar depois do básico

- tags/funil avançados;
- webhook de saída completo;
- aprendizado com atendimento humano;
- follow-up personalizado;
- recompra preditiva;
- win-back;
- mensagens proativas avançadas;
- biblioteca completa de botões/modelos;
- áudio de saída nativo;
- NPS/pós-venda avançado.

---

## Testes mínimos antes de ativar clientes

### T1 — Webhook de entrada em Teste
Objetivo:
- confirmar que payload do Commerce OS é reconhecido;
- mapear `customer.phone`, `customer.name`, `command`, `message`;
- ações permanecem sem execução.

### T2 — Handoff webhook em contato de homologação
Modo Ativo somente no webhook exclusivo de handoff.
Ações:
- buscar/criar contato;
- parar assistente;
- transferir para atendente;
- tag opcional.

Aceite:
- conversa muda para humano;
- Agent External deixa de responder;
- operador vê a conversa;
- rollback é simples.

### T3 — Outgoing webhook PapoAI → Supabase
Criar automação de teste:
- condição controlada;
- ação Enviar Webhook para endpoint de captura;
- capturar payload completo;
- confirmar nome e telefone;
- verificar se mensagem, sessão, agente, tags ou evento aparecem.

### T4 — Mensagem humana → webhook
Com conversa em modo humano:
- atendente envia texto;
- verificar se alguma automação/webhook consegue exportar essa informação.

Resultado esperado:
- se sim, habilita aprendizado com atendimentos humanos.

---

## Política de custos

No atendimento básico:
- respostas simples e regras conhecidas: determinístico/Supabase;
- busca de produto/cesta: tools;
- IA forte somente para ambiguidade real, recomendação, personalização e contexto de venda;
- prioridade máxima de qualidade quando cliente entra em personalização/checkout.

---

## Terminologia comercial

Respostas da Dona Antônia:
- usar **“a prazo”**;
- não usar “fiado” como linguagem da marca;
- o classificador continua entendendo expressões populares equivalentes na entrada.

---

## Estado

- PapoAI = provider canônico;
- Meta Direct = fora do escopo;
- produção = OFF;
- webhook de entrada = recurso confirmado visualmente;
- outgoing webhook = recurso confirmado visualmente, payload a capturar;
- novo caminho oficial para handoff identificado;
- próxima ação física mais valiosa: T1/T2.
