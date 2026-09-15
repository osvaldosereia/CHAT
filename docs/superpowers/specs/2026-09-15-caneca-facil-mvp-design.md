# Caneca Fácil — Especificação de Design do MVP

Data: 2026-09-15
Status: aguardando revisão final do usuário antes do plano de implementação
Repositório: `osvaldosereia/CHAT`

## 1. Objetivo

Criar um atendimento de WhatsApp simples para o projeto **Caneca Fácil**, com automação baseada em OpenAI capaz de receber referências do cliente, entender o pedido, fazer perguntas apenas quando necessário, gerar a arte de uma caneca personalizada, gerar um mockup emocional/comercial mostrando os dois lados da caneca e conduzir o cliente até a aprovação da arte.

O MVP termina na aprovação da arte. A sequência comercial de fechamento, pagamento e produção será definida em uma etapa posterior.

## 2. Isolamento do projeto

O Caneca Fácil será um projeto novo e independente de qualquer sistema existente.

Regras aprovadas:

- usar o repositório GitHub existente `CHAT`;
- preservar o estado antigo do repositório em uma branch `archive-dona-antonia` antes da substituição;
- transformar a `main` em código exclusivo do Caneca Fácil;
- criar um novo projeto Supabase exclusivo para Caneca Fácil;
- não reutilizar tabelas, Storage, credenciais, automações ou dados dos projetos existentes;
- usar um número de WhatsApp dedicado ao Caneca Fácil;
- integrar diretamente com a API oficial do WhatsApp/Meta, sem Make ou PapoAI no caminho principal do MVP.

## 3. Escopo do MVP

O MVP deve provar o fluxo completo abaixo:

1. cliente inicia conversa pelo WhatsApp;
2. sistema identifica se o cliente já possui referência/modelo ou quer criar do zero;
3. cliente pode enviar texto, áudio e até 3 imagens de referência;
4. sistema salva os arquivos originais;
5. áudio é transcrito;
6. IA analisa mensagens, imagens e transcrição;
7. IA cria e atualiza um briefing estruturado;
8. IA faz perguntas flexíveis somente sobre informações importantes que ainda estejam ambíguas;
9. quando houver informação suficiente, sistema gera a arte horizontal mestre;
10. sistema faz validação simples antes de mostrar o resultado;
11. sistema gera por IA um mockup emocional/comercial contendo os dois lados da caneca na mesma imagem;
12. cliente recebe somente o mockup;
13. cliente aprova ou solicita alteração;
14. alterações criam novas versões sem destruir as anteriores;
15. aprovação encerra o escopo do MVP e muda o projeto para estado `approved`.

## 4. Produto inicial

Produto padrão inicial:

- nome: Caneca Tradicional Branca 350 ml;
- tipo: caneca branca tradicional;
- capacidade: aproximadamente 350 ml;
- gabarito de impressão configurável no Admin;
- largura, altura, proporção, margem de segurança e resolução configuráveis;
- nenhuma proporção deve ser codificada de forma fixa no motor.

O sistema deverá nascer preparado para novos gabaritos no futuro, mas o MVP usa apenas o produto inicial.

## 5. Experiência do cliente

### 5.1 Recepção

O atendimento deve ser natural e simples. A IA deve descobrir logo no início se o cliente:

- já possui uma ideia/modelo/referência; ou
- quer que o Caneca Fácil crie do zero.

Não usar formulário longo ou questionário rígido.

### 5.2 Cliente com referência

O cliente poderá enviar:

- de 1 a 3 imagens;
- áudio ou texto explicando o objetivo;
- relações entre imagens, por exemplo: “foto 1 é a pessoa”, “foto 2 é referência de estilo”, “foto 3 é o logo”.

A IA deve entender essas relações e registrá-las no briefing.

### 5.3 Cliente criando do zero

O cliente pode simplesmente descrever a ideia por texto ou áudio. A IA coleta o restante em diálogo natural.

### 5.4 Perguntas flexíveis

Não existe sequência fixa de perguntas. A IA deve:

- usar tudo o que já foi informado;
- não perguntar novamente o que já estiver claro;
- perguntar apenas quando a resposta puder alterar significativamente a arte;
- evitar transformar o atendimento em entrevista;
- tomar pequenas decisões de design sozinha quando o cliente não especificar detalhes secundários.

## 6. Inteligência do briefing

A IA trabalha em quatro etapas lógicas:

`entender -> completar -> validar -> gerar`

O briefing deve distinguir cada informação entre:

- **obrigatório**: deve ser respeitado exatamente ou com máxima fidelidade;
- **preferência**: deve ser seguido quando possível;
- **livre para criação**: decisão de design pode ser tomada pela IA.

Prioridade geral:

1. preservar pessoas, referências e elementos obrigatórios;
2. manter nomes, textos e datas exatamente corretos;
3. respeitar estilo e cores solicitados;
4. usar liberdade criativa em composição, tipografia e elementos secundários.

A IA pode decidir sozinha, quando não especificado:

- tipografia;
- hierarquia visual;
- posição de elementos;
- equilíbrio entre cores;
- detalhes decorativos;
- composição geral.

A IA não pode inventar ou alterar livremente:

- nomes;
- datas;
- textos obrigatórios;
- identidade de pessoas;
- elementos marcados como obrigatórios;
- elementos expressamente proibidos.

## 7. Critério para geração

A IA mantém internamente o estado do briefing e determina se existe informação suficiente para gerar um bom primeiro resultado.

Para o MVP, não haverá fórmula matemática complexa. O sistema deve registrar:

- informações faltantes relevantes;
- avaliação de confiança;
- `ready_to_generate`.

Se a dúvida restante for pequena e não afetar a intenção principal, a IA pode tomar uma decisão criativa e seguir.

O cliente não precisa aprovar um resumo do briefing antes da primeira geração, salvo quando existir alguma ambiguidade crítica.

## 8. Arte mestre

A arte mestre é o arquivo de produção e deve:

- ser horizontal;
- usar o gabarito configurado no Admin;
- respeitar largura, altura, proporção, resolução e margem de segurança configuradas;
- ser salva no Storage;
- ter versionamento;
- ficar disponível no Admin;
- não ser enviada diretamente ao cliente durante o MVP.

Fluxo técnico:

`briefing estruturado -> direção criativa -> prompt técnico -> geração/edição da arte -> validação -> armazenamento`

O texto cru do cliente não deve ser enviado diretamente ao modelo de imagem como única instrução. O orquestrador deve construir uma direção criativa técnica a partir do briefing.

## 9. Validação da arte

Antes de gerar o mockup, o sistema faz uma validação simples da arte contra o briefing.

Verificar pelo menos:

- presença dos elementos obrigatórios;
- coerência geral com o tema;
- fidelidade às referências;
- erros visuais evidentes;
- problemas óbvios em textos, nomes ou datas quando verificáveis;
- deformações graves.

No MVP, o sistema poderá fazer no máximo **1 tentativa automática adicional de correção** para evitar loops e custos descontrolados.

Se ainda houver falha após a tentativa permitida, o projeto deve ficar marcado para revisão no Admin, sem continuar gerando indefinidamente.

## 10. Mockup gerado por IA

O mockup também será gerado por IA.

Regras obrigatórias:

- uma única imagem final;
- aparência realista;
- caráter emocional e comercial;
- produto reconhecível como caneca branca tradicional de aproximadamente 350 ml;
- mostrar os dois lados da caneca na mesma composição;
- permitir ao cliente visualizar praticamente toda a arte sem receber a arte horizontal mestre;
- manter a caneca como foco principal;
- cenário não deve esconder textos, rostos ou elementos relevantes;
- imagem deve ser adequada para envio e avaliação pelo WhatsApp.

Direção visual inicial:

- apresentação elegante e vendável;
- fundo e cenário emocional/comercial, porém controlado;
- iluminação agradável;
- elementos decorativos sutis quando fizer sentido;
- consistência visual entre pedidos.

O sistema deve trabalhar com um **padrão oficial de prompt de mockup**, não com instruções improvisadas a cada pedido.

Cada mockup deve apontar para uma versão específica da arte:

`art_version N -> mockup_version N`

## 11. Revisão pelo cliente

O cliente recebe somente o mockup e pode:

- aprovar;
- solicitar alteração.

Ao solicitar alteração, a IA deve identificar exatamente o que mudou e preservar o restante sempre que possível.

Exemplo de interpretação interna:

`reduzir flores; preservar foto, texto, tipografia e composição principal`

Uma alteração gera nova versão da arte e novo mockup. Versões anteriores permanecem armazenadas.

## 12. Estados do projeto

Estados mínimos do MVP:

- `new`
- `collecting_references`
- `building_briefing`
- `waiting_customer`
- `ready_to_generate`
- `generating_art`
- `validating_art`
- `generating_mockup`
- `waiting_approval`
- `change_requested`
- `needs_review`
- `approved`
- `failed`

As transições devem ser controladas pelo backend para evitar geração duplicada, respostas fora de ordem e perda de versão.

## 13. Arquitetura

O projeto terá duas partes principais no mesmo produto:

### 13.1 Admin Web

Responsável apenas por operação humana e configuração básica.

### 13.2 API / Orquestrador

Responsável por:

- webhook do WhatsApp;
- normalização de eventos;
- download e armazenamento de mídia;
- transcrição de áudio;
- análise multimodal;
- gerenciamento do briefing;
- máquina de estados;
- geração/edição da arte;
- validação;
- geração do mockup;
- envio de mensagens e mídias ao WhatsApp;
- persistência e versionamento.

Fluxo principal:

`WhatsApp -> Backend/Orquestrador -> Supabase/OpenAI -> Backend/Orquestrador -> WhatsApp`

## 14. Uso da OpenAI

Os modelos devem ser configuráveis por variável/configuração, evitando acoplamento permanente a um identificador específico.

Estratégia do MVP:

- modelo multimodal de texto/visão para entendimento da conversa e das referências;
- modelo dedicado de transcrição para áudios recebidos;
- modelo GPT Image atual suportado para geração e edição da arte;
- modelo GPT Image atual suportado para criação do mockup.

Na implementação, os modelos e preços vigentes devem ser conferidos na documentação oficial antes de fixar defaults. O objetivo é usar modelos econômicos para interpretação/transcrição e maior qualidade somente quando ela tiver impacto direto no resultado visual.

## 15. Supabase — projeto novo

Criar um novo projeto Supabase exclusivo para Caneca Fácil.

### 15.1 Tabelas do MVP

#### `customers`

- `id`
- `name`
- `phone`
- `whatsapp_id`
- `created_at`
- `updated_at`

#### `conversations`

- `id`
- `customer_id`
- `channel`
- `status`
- `started_at`
- `finished_at`
- `last_message_at`
- `active_project_id`

#### `messages`

- `id`
- `conversation_id`
- `customer_id`
- `direction`
- `type`
- `text`
- `media_id`
- `whatsapp_message_id`
- `created_at`

#### `mug_projects`

- `id`
- `customer_id`
- `conversation_id`
- `template_id`
- `title`
- `creation_mode`
- `status`
- `current_briefing_id`
- `current_art_version_id`
- `current_mockup_id`
- `approved_art_version_id`
- `approved_mockup_id`
- `created_at`
- `approved_at`

#### `project_media`

- `id`
- `project_id`
- `message_id`
- `media_type`
- `storage_path`
- `mime_type`
- `original_filename`
- `duration_seconds`
- `width`
- `height`
- `reference_order`
- `reference_role`
- `created_at`

#### `audio_transcriptions`

- `id`
- `project_media_id`
- `transcription`
- `language`
- `model`
- `created_at`

#### `briefings`

- `id`
- `project_id`
- `version`
- `occasion`
- `recipient`
- `main_theme`
- `desired_style`
- `color_preferences`
- `mandatory_text`
- `names`
- `dates`
- `mandatory_elements`
- `forbidden_elements`
- `reference_analysis`
- `composition_notes`
- `creative_direction`
- `missing_information`
- `confidence_score`
- `ready_to_generate`
- `created_at`

#### `art_versions`

- `id`
- `project_id`
- `briefing_id`
- `version`
- `parent_version_id`
- `generation_type`
- `prompt_used`
- `model`
- `storage_path`
- `width`
- `height`
- `aspect_ratio`
- `generation_status`
- `quality_status`
- `created_at`

#### `mockup_versions`

- `id`
- `project_id`
- `art_version_id`
- `template_id`
- `version`
- `prompt_used`
- `model`
- `storage_path`
- `generation_status`
- `created_at`

#### `review_events`

- `id`
- `project_id`
- `art_version_id`
- `mockup_id`
- `event_type`
- `customer_message`
- `ai_interpretation`
- `created_at`

Eventos iniciais:

- `sent_for_review`
- `approved`
- `change_requested`
- `rejected`
- `internal_rejected`

#### `mug_templates`

- `id`
- `name`
- `active`
- `capacity_ml`
- `art_width_mm`
- `art_height_mm`
- `aspect_ratio`
- `safe_margin_mm`
- `output_width_px`
- `output_height_px`
- `dpi`
- `background_mode`
- `mockup_configuration`
- `created_at`
- `updated_at`

### 15.2 Relacionamento principal

`customer -> conversation -> mug_project -> media -> briefings -> art_versions -> mockup_versions -> review_events`

## 16. Storage

Buckets privados iniciais:

- `customer-uploads` — fotos e áudios recebidos;
- `artwork-master` — artes horizontais de produção;
- `mockups` — imagens de apresentação enviadas ao cliente.

Os buckets não devem ser públicos por padrão. O backend usa acesso server-side e URLs temporárias quando necessário.

Arquivos originais enviados pelo cliente nunca devem ser substituídos pela interpretação da IA.

## 17. Admin MVP

O Admin começa propositalmente simples.

### 17.1 Login

- um único administrador no MVP;
- autenticação via Supabase Auth;
- arquitetura não deve impedir múltiplos usuários no futuro.

### 17.2 Lista de projetos

Mostrar no mínimo:

- cliente;
- título/projeto;
- status;
- data da última atividade;
- indicador de pendência/revisão.

### 17.3 Tela do projeto

Mostrar:

- dados básicos do cliente;
- histórico da conversa;
- imagens e áudios originais;
- transcrição;
- briefing atual;
- versões de briefing quando necessário;
- arte horizontal mestre;
- mockup atual;
- histórico de versões de arte/mockup;
- status;
- histórico de aprovação/alterações.

### 17.4 Configuração do gabarito

Permitir configurar o produto inicial:

- largura;
- altura;
- proporção;
- margem de segurança;
- resolução;
- DPI quando aplicável;
- parâmetros básicos do mockup.

## 18. Segurança

Requisitos mínimos:

- nunca expor chave secreta ou `service_role` no frontend;
- RLS habilitado nas tabelas expostas;
- Admin autenticado;
- operações privilegiadas executadas server-side;
- buckets privados;
- segredos somente em variáveis de ambiente/Secrets;
- webhook da Meta validado e eventos idempotentes;
- armazenar o mínimo de dados pessoais necessário;
- não registrar prompts completos em logs públicos;
- não publicar fotos e artes dos clientes por URL permanente aberta.

## 19. Tratamento de duplicidade e erros

O backend deve ser idempotente para eventos do WhatsApp.

Regras:

- `whatsapp_message_id` único quando disponível;
- uma mensagem recebida não pode iniciar a mesma geração duas vezes;
- jobs de geração devem ter estado explícito;
- falhas devem deixar o projeto recuperável;
- nenhuma rotina deve gerar em loop;
- uma falha de IA não pode apagar briefing, mídia ou versão anterior válida.

## 20. Fora do MVP

Não implementar agora:

- pagamento;
- checkout;
- pedido de produção;
- integração com ERP;
- múltiplos administradores e permissões avançadas;
- dashboard sofisticado;
- relatórios financeiros;
- analytics avançado;
- automações de remarketing;
- catálogo de vários produtos;
- modelos de mockup selecionáveis pelo cliente;
- métricas detalhadas de custo por projeto;
- campanhas de WhatsApp;
- fluxos Meta complexos.

Esses itens ficam para evolução depois que o ciclo principal estiver funcionando.

## 21. Critérios de sucesso do MVP

O MVP é considerado funcional quando, em ambiente de teste:

1. uma mensagem real chega do WhatsApp e cria/recupera o cliente;
2. texto, áudio e até 3 imagens são associados ao projeto correto;
3. áudio é transcrito e preservado;
4. IA cria briefing coerente e faz perguntas contextuais quando necessário;
5. sistema evita perguntas repetidas;
6. projeto chega de forma determinística a `ready_to_generate`;
7. uma arte mestre horizontal é criada e salva;
8. validação ocorre antes do mockup;
9. um mockup por IA é gerado em uma única imagem mostrando os dois lados da caneca;
10. somente o mockup é enviado ao cliente;
11. pedido de alteração gera nova versão preservando histórico;
12. aprovação coloca o projeto em `approved`;
13. Admin permite reconstruir a linha completa `mensagem -> referência -> briefing -> arte -> mockup -> aprovação`.

## 22. Ordem conceitual de implementação

A implementação será detalhada em um plano separado após aprovação desta especificação. A sequência esperada é:

1. preservar o projeto antigo em `archive-dona-antonia` e preparar a nova `main`;
2. fundação do novo app;
3. novo Supabase, schema, RLS, Auth e Storage;
4. Admin MVP;
5. webhook e camada de WhatsApp;
6. ingestão de mídia e transcrição;
7. motor de briefing e estados;
8. geração e validação da arte;
9. geração do mockup;
10. ciclo de revisão/aprovação;
11. testes integrados ponta a ponta.

## 23. Princípio de evolução

A prioridade é **fazer o fluxo básico funcionar bem antes de acrescentar recursos**. Novas funções devem ser adicionadas depois sem transformar o MVP inicial em um sistema maior do que o necessário.
