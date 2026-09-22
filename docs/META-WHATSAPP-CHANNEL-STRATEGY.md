# ESTRATÉGIA DE CANAL — META / WHATSAPP / PAPOAI

Data: 21/09/2026
Projeto: Dona Antônia — PapoAI Commerce OS
GitHub: osvaldosereia/CHAT
Supabase oficial: ssbesxgaijknwsjbsbcz

## Princípio

O PapoAI é o canal operacional e inbox humano.
A Meta/WhatsApp fornece os recursos nativos de mensagem.
O Supabase é o cérebro e a fonte de verdade.
A OpenAI interpreta linguagem, imagem e áudio quando necessário.

Não duplicar recursos que o PapoAI já entrega.
Não acoplar o Commerce Brain ao formato específico de uma plataforma.

## Camada de capacidades do canal

O cérebro gera uma intenção de saída canônica:

- text
- image
- image_caption
- voice
- buttons
- list
- flow
- product
- product_list
- location
- template
- typing
- handoff
- silent

O adapter PapoAI/Meta decide como materializar a intenção.

Cada capacidade possui estado:
- verified
- available_unverified
- unavailable
- unknown

Fallbacks obrigatórios:
- buttons -> numbered text
- list -> concise numbered text
- flow -> progressive chat questions
- product -> image + caption
- product_list -> max 3 product cards/text
- voice -> text
- image_caption -> image + separate text
- typing -> no-op
- handoff -> explicit PapoAI handoff or safe silent/manual signal

## Recursos oficiais Meta prioritários

### 1. Texto
Default da conversa. Curto, humano e contextual.

### 2. Typing indicator + read receipt
Usar quando o canal permitir, sem delays artificiais longos.
Serve para dar sensação natural sem gastar tokens.

### 3. Imagem + texto
Para produto específico, oferta, cesta ou comparação visual.
Preferir uma imagem relevante em vez de carrossel excessivo.

### 4. Reply buttons
Usar para decisões binárias/ternárias:
- Confirmar
- Trocar
- Ver outra opção

Nunca transformar toda a conversa em menu.

### 5. List messages
Usar apenas quando existirem 4-10 escolhas naturais:
- categorias
- formas de pagamento
- cestas
- opções equivalentes

### 6. WhatsApp Flows
Reservar para tarefas estruturadas, não para a conversa inteira.
Casos Dona Antônia:
- confirmação/edição de endereço
- dados finais de checkout
- eventualmente personalização estruturada de cesta
- consentimentos

O Flow é uma ferramenta de coleta/execução; o cérebro conversacional continua nosso.

### 7. Product / product list
Avaliar catálogo Meta como segunda fase.
Supabase continua fonte de verdade.
Se usado, sincronizar apenas produtos ativos/vendáveis e manter product_retailer_id estável.

### 8. Templates
Fora da janela livre de atendimento, usar templates aprovados.
Separar utility de marketing.
Nunca misturar promoção em template transacional.

## Entrada multimodal

### Texto
Processamento normal.

### Áudio recebido
1. canal fornece/permite obter mídia;
2. transcrever com modelo barato;
3. salvar somente texto normalizado e metadados necessários;
4. Commerce Brain processa igual a uma mensagem digitada;
5. responder em texto por padrão;
6. responder em áudio somente se o cliente usar/preferir áudio ou pedir explicitamente.

Modelo inicial: gpt-4o-mini-transcribe.
Fallback: gpt-transcribe/gpt-4o-transcribe para baixa confiança/casos difíceis.

### Imagem recebida
Primeiro identificar se a imagem realmente precisa de IA.
Casos:
- foto de produto/embalagem: visão low;
- comprovante ou documento: fluxo separado e restrito;
- foto sem relação comercial: não gastar visão;
- código/EAN legível recebido como dado: usar determinístico quando possível.

Modelo inicial: gpt-5.6-luna com detail low.
Subir detail apenas quando necessário.

## Saída multimodal

### Texto
Padrão.

### Áudio
TTS sob demanda, não por padrão.
Modelo inicial: gpt-4o-mini-tts.
Gerar OGG/Opus quando necessário para voice message da Meta.

### Imagem
Usar imagem existente do produto no Supabase.
Não gerar imagem por IA para responder venda comum.
Imagem gerada fica restrita a marketing/criativos.

## Estratégia OpenAI de baixo custo

### Modelo principal
gpt-5.6-luna.

Uso:
- interpretação de intenção ambígua;
- Governor;
- tool selection;
- redação final;
- visão de imagens quando necessário.

Reasoning:
- none/low para turno normal;
- medium somente para casos complexos;
- nunca high por padrão no WhatsApp.

### Evitar IA quando
- cliente clicou botão com ID conhecido;
- escolheu item de lista;
- confirmou sim/não;
- pediu preço/estoque de produto identificado;
- pediu formas de pagamento;
- pediu composição de cesta;
- pediu status/pedido conhecido;
- cálculo comercial.

Esses casos usam regras/tools determinísticas.

### Contexto
Nunca enviar histórico inteiro.
Enviar:
- resumo curto;
- últimas mensagens relevantes;
- carrinho atual;
- cliente/contexto mínimo;
- resultados das tools.

Manter prompt estático cacheável e dados variáveis separados.

## Ferramentas do Commerce Brain

Core V1:
- identify_customer
- get_customer_context
- search_products
- get_product
- search_baskets
- get_basket
- get_offers
- add_cart_item
- remove_cart_item
- change_quantity
- replace_basket_item
- recommend_replacement
- get_cart
- repeat_last_purchase
- update_checkout_profile
- preview_order
- confirm_order
- request_handoff

Channel V1:
- send_text
- send_image
- send_voice
- send_buttons
- send_list
- send_flow
- send_product
- send_location
- set_typing
- handoff
- silent

## Admin

Admin próprio não possui inbox.

Configurações editáveis:
- personalidade/tom;
- limite de perguntas;
- regras comerciais;
- quando usar imagem;
- quando responder áudio;
- quantos produtos mostrar;
- thresholds de handoff;
- ofertas proativas;
- capacidade de canal ativada/desativada;
- modelo OpenAI por tarefa;
- orçamento diário/mensal;
- templates/Flows homologados;
- feature flags.

Todas as configurações versionadas e auditáveis.

## Plano rápido

### M1 — Capability Adapter
Contrato canônico + feature flags + fallbacks.
Sem alterar conversa atual.

### M2 — Multimodal
Entrada: áudio + imagem.
Saída: imagem+texto + voz.
Testes físicos PapoAI.

### M3 — Native UX
Typing/read receipts.
Buttons.
Lists.
Handoff/silent.

### M4 — Flow mínimo
Um único Flow: checkout/endereço.
Não construir vários Flows antes de comprovar valor.

### M5 — Pilot
Ativar cérebro para grupo controlado.
Medir custo, latência, busca sem resultado, ASK rate, handoff, conversão.

## Regra de produto

Conversação livre é o padrão.
Recursos estruturados são atalhos contextuais.

Meta/PapoAI fazem a interface.
Supabase decide.
OpenAI interpreta.
