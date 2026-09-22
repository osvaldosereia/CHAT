# PROJECT MASTER — Dona Antônia PapoAI Commerce OS

Data canônica: 21/09/2026.

## Objetivo

Colocar em produção um atendente comercial no WhatsApp com comportamento humano, rápido e contextual, usando ao máximo os recursos nativos do PapoAI sem entregar ao PapoAI o controle do cérebro comercial.

## Arquitetura

WhatsApp → PapoAI → Agente Externo → Supabase → Commerce Brain → OpenAI/tools determinísticas → resposta → PapoAI → WhatsApp.

### Responsabilidades

**PapoAI**
- WhatsApp;
- inbox humano;
- transporte das mensagens;
- handoff;
- recursos nativos que forem comprovados: mídia, botões, listas, Flow, tags, campos, funil e automações.

**Supabase**
- fonte de verdade;
- clientes e identidade;
- produtos, cestas, ofertas e estoque;
- carrinho;
- regras de preço;
- pedidos;
- memória/contexto;
- idempotência;
- observabilidade.

**OpenAI**
- entender linguagem;
- classificar intenção;
- escolher tools;
- redigir respostas naturais;
- nunca calcular preço, total, estoque ou regra comercial por conta própria.

## Estratégia de atendimento

O atendente deve agir como um vendedor humano competente.

1. Se já existe informação suficiente para uma resposta satisfatória, responde imediatamente.
2. Só pergunta quando a resposta sem aquela informação seria materialmente pior.
3. Máximo de 2 perguntas segmentadoras por assunto.
4. Uma pergunta por vez.
5. Se o cliente disser “você decide”, “pode escolher” ou equivalente, isso é delegação: RECOMMEND, não ASK.
6. Priorizar respostas curtas, naturais e compassadas.
7. Nunca transformar a conversa em menu/URA.

Decisões do Governador:
- RESPOND
- ASK
- RECOMMEND
- ACT

## Comércio

### Cestas
- cesta básica é eixo principal;
- composição sempre completa em uma única mensagem;
- agrupada por categoria;
- quantidades e nomes;
- preço total;
- sem preços individuais dos componentes;
- valor oculto/ajuste interno nunca aparece ao cliente.

### Personalização
Entender linguagem natural para:
- retirar;
- aumentar;
- trocar;
- adicionar;
- substituir por valor semelhante;
- delegar escolha.

Mudança comercial é calculada e executada no Supabase e exige confirmação quando necessário.

### Produtos
O atendente deve procurar produtos por necessidade, não apenas pelo nome.

Exemplo: “shampoo para cabelo crespo” deve encontrar produtos adequados mesmo que “crespo” não esteja no título.

A busca usa:
- nome;
- marca;
- categoria;
- subcategoria;
- embalagem;
- taxonomia para cliente;
- descrições;
- conhecimento comercial;
- regras semânticas;
- pesquisa externa apenas para lacunas relevantes.

### Ofertas
- ofertas explícitas quando solicitadas;
- oferta proativa somente quando relevante;
- no máximo 1 oferta proativa por carrinho;
- respeitar rejeição/cooldown;
- usar foto quando visualmente útil.

### Cliente e memória
Contexto mínimo útil:
- nome;
- identidade canônica;
- histórico de compras;
- última compra;
- cesta frequente;
- produtos recorrentes;
- preferências declaradas;
- preferências inferidas somente com evidência;
- ofertas aceitas/rejeitadas;
- pedido/carrinho atual.

Não exibir conhecimento de forma invasiva.

### Recompra
- reconhecer cliente;
- permitir repetir última cesta/compra;
- recalcular com preços, estoque e ofertas atuais;
- nunca copiar preço histórico;
- não repetir automaticamente substituições antigas.

### Checkout
- pedir somente dados faltantes;
- nome/endereço em uma mensagem quando necessário;
- máximo de 2 perguntas;
- cliente conhecido não repete dado já confiável;
- confirmação final explícita.

### Humano
Toda conversa humana fica no PapoAI.
- pedido de humano → handoff;
- humano ativo → IA silenciosa;
- nosso Admin não possui janela de chat.

## Admin próprio

Admin separado do Admin legado. Não é inbox.

Áreas:
1. Visão geral;
2. Inteligência e comportamento;
3. Conhecimento/regras;
4. Produtos e conhecimento comercial;
5. Clientes e memória;
6. Pedidos/conversão;
7. Saúde/testes;
8. Simulador de atendimento.

## Banco de produtos oficial

Tabela canônica: `public.products` no Supabase `ssbesxgaijknwsjbsbcz`.

Estado auditado em 21/09/2026:
- 1.814 produtos totais;
- 1.673 ativos;
- 1.415 ativos + fisicamente verificados + estoque positivo + preço positivo;
- apenas 306 passam também pela flag antiga `is_whatsapp_active`.

A flag `is_whatsapp_active` não deve limitar o cérebro a 306 produtos sem decisão comercial explícita.

## Repositórios/bancos antigos

A branch `chat-commerce-foundation-r1-20260921` e o Supabase `qxstkwshuvplmmftrctj` são referência de trabalho anterior do mesmo dia, mas não são a fonte de verdade do novo PapoAI Commerce OS.

Não duplicar catálogo nem migrar o runtime para esse banco.

## Prioridade de entrega

Primeiro colocar o atendente real funcionando bem.
Depois enriquecer e ampliar ferramentas.

Evitar rodadas longas. Cada rodada deve ter um objetivo verificável e pequeno.
