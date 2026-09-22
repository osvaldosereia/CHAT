# R7 — Homologação física PapoAI / Meta

Estado: **PROGRAMAÇÃO CONCLUÍDA — HOMOLOGAÇÃO FÍSICA PENDENTE**

A R7 não é considerada concluída enquanto o comportamento não for comprovado no canal real. O sistema está pronto para executar a homologação com uma janela controlada.

## O que foi programado

- Edge `papo-external-agent-v1` v41;
- rotação de chave em duas fases;
- chave v2 gerada no Supabase Vault sem invalidar a v1;
- autenticação testada: v1 e v2 aceitas; chave inválida rejeitada;
- telefone de homologação armazenado somente como SHA-256;
- lab limitado a telefone autorizado e com expiração automática;
- tabela de runs e tabela de casos/evidências;
- capabilities só são promovidas com evidência;
- processamento físico de áudio recebido pode validar fetch + transcrição automaticamente;
- processamento físico de imagem recebida pode validar fetch + visão automaticamente;
- host de mídia só entra na allowlist após processamento real bem-sucedido;
- handoff pode ser confirmado automaticamente quando o PapoAI devolver `session.human_required=true`;
- saída de imagem, voz e silent possuem probes reservados de R7;
- formatos sem shape comprovado permanecem com fallback.

## Core obrigatório para avançar

Cinco casos:

1. request;
2. session;
3. text;
4. handoff;
5. silent.

Request, session e text já carregam evidência `verified_lab` existente.
Handoff e silent precisam confirmação física.

## Recursos não-core que também precisam ser resolvidos

- outbound image;
- inbound image;
- inbound audio;
- outbound voice.

Eles podem terminar como `verified` ou `unsupported`. Se forem unsupported, o fallback continua obrigatório.

## Recursos sem contrato PapoAI comprovado

No checkpoint atual:

- reply buttons → `numbered_text`;
- list → `numbered_text`;
- Flow → `progressive_chat`;
- typing → `no_op`;
- read receipt → `no_op`.

Eles ficam como `manual_setup_required` e não viram dependência escondida.

## Roteiro físico

A homologação só deve ser iniciada quando houver um telefone de teste definido.

Ao iniciar:
- lab ativa por 45 minutos por padrão;
- apenas o hash do telefone autorizado é aceito;
- qualquer outro telefone recebe resposta silent;
- produção continua OFF.

Ordem recomendada no WhatsApp:

1. `TESTE_R7_TEXTO_DONA_ANTONIA`
2. `TESTE_R7_IMAGEM_DONA_ANTONIA`
3. `TESTE_R7_AUDIO_SAIDA_DONA_ANTONIA`
4. enviar uma foto de produto;
5. enviar um áudio curto;
6. `TESTE_R7_SILENCIO_DONA_ANTONIA`
7. `TESTE_HANDOFF_DONA_ANTONIA` — por último.

A chave v2 deve ser configurada no Agente Externo do PapoAI antes desses testes. Quando uma chamada física chegar com v2, o run registra `new_key_observed`. Só então a v1 pode ser aposentada.

## O que observar

- texto chega uma única vez;
- imagem realmente aparece no WhatsApp;
- áudio de saída toca como áudio;
- foto enviada chega com URL/mídia recuperável;
- áudio enviado chega e é transcrito;
- silent não gera mensagem;
- handoff ativa humano no PapoAI;
- após humano ativo, IA permanece silenciosa.

## Critério de saída

`get_papoai_r7_readiness_v1()` só retorna `ready_for_r8=true` quando:

- todos os 5 casos core estiverem verificados;
- não houver casos pendentes;
- chave v2 tiver sido observada fisicamente;
- chave v1 tiver sido aposentada;
- R6 continuar verde.

A produção continua proibida. R8 é o Admin mínimo; R9 é piloto/ativação.
