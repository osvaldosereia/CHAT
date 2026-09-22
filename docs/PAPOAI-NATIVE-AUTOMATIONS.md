# PapoAI Native Automations — Dona Antônia Commerce OS

## Decisão arquitetural

O **PapoAI é o provedor/canal canônico atual do WhatsApp**.

O Commerce OS da Dona Antônia permanece responsável por:
- inteligência comercial;
- classificação de intenção;
- contexto e memória;
- catálogo, estoque, preço e cestas;
- regras comerciais;
- carrinho, checkout e confirmação;
- decisão de handoff;
- aprendizado/evolução.

O PapoAI permanece responsável por:
- sessão/canal WhatsApp;
- Agent External;
- automações nativas;
- mensagens/modelos nativos;
- respostas rápidas;
- Flow;
- tags/Kanban;
- pausa do assistente;
- transferência de atendimento;
- conclusão de atendimento.

Meta Direct fica **fora do escopo da fase atual**. Não criar integração paralela enquanto o PapoAI for o provider canônico.

## Capacidades nativas confirmadas visualmente no painel PapoAI — 22/09/2026

### Condições
- Mensagem da IA;
- Mensagem do lead;
- operadores: Igual a / Contém;
- possibilidade de múltiplas condições.

### Ações
- Resposta ao Usuário;
  - Texto;
  - Arquivo;
- Enviar template ou resposta rápida;
- Enviar mensagem interativa com Flow;
- Adicionar Tag;
- Remover Tag;
- Mover no Kanban;
- Enviar Mensagem Externa;
- Enviar Webhook;
- Parar resposta do assistente;
- Concluir Atendimento;
- Transferir para;
- Aguardar (Delay).

### Modelos de mensagem
O painel PapoAI permite criar modelos/Sequências vinculados a um canal e incluir botões.
Esses modelos são considerados artefatos nativos do provider e podem ser criados manualmente quando necessário.

## Contrato nativo de handoff

Frase canônica emitida pelo cérebro:

`Vou chamar uma pessoa da nossa equipe para continuar com você.`

Essa frase deve aparecer no início de toda resposta que represente handoff.

### Automação manual recomendada no PapoAI

Nome:
`DA — Handoff do cérebro`

Agente:
`Dona Antônia — Homologação` durante homologação; migrar para o agente de produção no go-live.

Condição:
- Campo: **Mensagem da IA**
- Operador: **Contém**
- Valor: `Vou chamar uma pessoa da nossa equipe para continuar com você.`

Ações:
1. **Parar resposta do assistente**
2. **Transferir para** a fila/equipe humana da Dona Antônia
3. opcional: **Adicionar Tag** `AI_HANDOFF`

Não usar token/cookie do navegador nem WebSocket privado.

## Estratégia para botões, respostas rápidas e Flow

Não criar dezenas de automações por produto.

Usar poucos blocos nativos reutilizáveis do PapoAI:

1. **Navegação comercial**
   - Ver cestas
   - Ver ofertas
   - Comprar outros produtos

2. **Cesta**
   - Quero esta cesta
   - Ver outra cesta
   - Personalizar

3. **Checkout**
   - Confirmar
   - Alterar
   - Falar com atendente

4. **Flow**
   - usar Flow nativo quando a coleta estruturada for melhor que conversa livre.

A inteligência decide **quando** usar um desses estados.
O PapoAI executa a apresentação nativa.

Até existir contrato oficial server-side para disparar esses artefatos diretamente pelo Agent External, a ligação cérebro → automação deve usar gatilhos naturais e estáveis em mensagens da IA, nunca protocolos privados do frontend.

## Aprendizado com atendimento humano

Objetivo:
- importar/observar conversas manuais do PapoAI;
- extrair padrões, sinônimos, objeções e boas respostas;
- não transformar conversa isolada em regra automática;
- promover aprendizado somente após gates de confiança/evidência.

Ainda é necessário homologar qual mecanismo oficial do PapoAI permite obter:
- mensagens do cliente durante modo humano;
- mensagens do operador;
- eventos de início/fim do atendimento;
- tags/resultado da conversa.

Preferência:
1. webhook nativo do PapoAI;
2. API/documentação oficial;
3. exportação/sincronização suportada.

Não usar scraping, cookies de sessão ou protocolo privado do navegador em produção.
