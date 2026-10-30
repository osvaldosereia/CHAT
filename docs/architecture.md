# Arquitetura proposta

## Visão geral

A interface própria reduz decisões repetitivas, analisa a geometria e prepara a recomendação. Bambu Studio permanece como slicer e ferramenta oficial para revisar o Preview e enviar à A1 mini.

| Parte | Responsabilidade |
|---|---|
| Interface da aplicação | App Windows local para eliminar backend mensal; app online exige backend e armazenamento privado. GitHub Pages só entrega arquivos estáticos. |
| Supabase Auth | Sessão do usuário |
| Supabase Storage privado | STL original, cópia reparada, vistas, relatório e 3MF temporários |
| Supabase Postgres | Perfil A1 mini, tarefas, métricas, decisões, versões de regras e eventos |
| Supabase Edge Functions | Validar sessão, iniciar tarefa, criar URLs assinadas, consultar conhecimento e chamar OpenAI |
| GitHub Actions | Processamento pesado em runner efêmero: validar arquivo, extrair métricas e renderizar vistas; CLI oficial apenas após prova |
| API OpenAI Responses | Interpretar imagens e medições; retornar recomendação em schema estruturado |
| Bambu Studio desktop | Abrir projeto, fatiar/verificar e enviar pelo fluxo oficial da Bambu |

## Fluxo de uma tarefa

1. Navegador autentica no Supabase e envia STL a um bucket privado com upload retomável.
2. Edge Function valida propriedade/tamanho/extensão, calcula ou registra hash e cria uma tarefa com estado uploaded/queued.
3. A função inicia o workflow de análise no GitHub Actions com identificador de tarefa e acesso de curta duração aos arquivos. Credencial de disparo fica apenas no segredo da função.
4. O runner baixa somente o objeto da tarefa, valida STL e gera medições, diagnósticos e imagens. Não escreve o STL em artefatos públicos ou logs.
5. O runner envia resultados derivados de volta ao Storage privado/Postgres e termina; disco efêmero é descartado pelo runner.
6. Edge Function recupera os perfis versionados e trechos relevantes da base técnica, chama a API OpenAI com imagens/métricas e valida a saída contra schema e limites conhecidos.
7. O site apresenta relatório, avisos e decisões. Se o CLI oficial foi executado e conferido, apresenta o status slicer_verified; caso contrário, recommendation_ready/needs_review.
8. Se existir 3MF válido, o navegador oferece download e link protocolado bambustudio://open?file=<URL HTTPS temporária codificada>. O usuário aprova a abertura externa, confere Prepare/Preview no Studio e decide se envia à impressora.

## Limite entre IA e ferramentas determinísticas

A IA não mede malha por intuição nem substitui cálculos geométricos. O código determina dimensões, topologia, bounds, espessuras aproximadas, balanços e valida os campos. O modelo usa essas evidências e imagens para explicar e priorizar opções. Saída livre não altera configurações: apenas campos permitidos em schema versionado são aceitos.

## Geração do 3MF e papel do Bambu Studio

O formato 3MF básico não basta para provar que o arquivo está fatiado nem que os metadados Bambu estão corretos. A geração precisa ser baseada em perfil oficial e passar por uma instalação real do Bambu Studio. A investigação anterior confirma que o CLI documenta operações de perfil, orientação, organização, slice e exportação, mas também registra problemas em modo headless/Windows.

Por isso:

- a primeira prova usa o STL de referência e o Bambu Studio instalado no Windows;
- um worker automatizado só recebe a marca “slicer_verified” após confirmar os perfis e o Preview no slicer oficial;
- se o CLI não for confiável em runner do GitHub, o produto mostra relatório e valores exatos para revisão/manual no Studio; não inventa um status de fatiamento;
- abrir por protocolo remoto e baixar o arquivo são dois caminhos para o mesmo projeto; o protocolo não controla os outros campos nem inicia o print.

## Conhecimento técnico rastreável

A base do especialista é formada por:

- manual e guia da A1 mini;
- presets de impressora, bico, processo e filamento de uma release identificada do repositório oficial Bambu Studio;
- documentação e notas de release relevantes;
- regras geométricas explícitas e exemplos validados em modelos de referência.

Cada registro precisa guardar origem, data de captura, release aplicável, hash e estado de revisão. Uma nova versão de perfil não modifica silenciosamente a configuração registrada em tarefas antigas. Supabase pgvector auxilia a recuperar trechos; validações finais são regras de código.

## GitHub e execução

- A branch atual do trabalho é isolada da branch principal e das outras branches do repositório.
- Não armazenar uploads, relatórios de usuário, STL/3MF ou segredos em commits.
- GitHub Actions é candidato para processamento em lote, não uma suposição já provada para operação de produção.
- O disparo do workflow deve limitar permissões do token ao repositório e ao evento necessários; nunca executar código de pull request não confiável com segredos.
- Runner deve ser descartável e não deixar modelo em artefato ou log.
- Chaves nunca vão ao navegador. No modelo online, chamadas privadas passam pelo backend Supabase; no modelo local, a chave OpenAI fica na configuração local protegida do Windows.

## Supabase e privacidade

- Criar projeto isolado para não misturar dados aos sistemas já existentes.
- Usar tabelas com owner_id, RLS em cada tabela, bucket privado, URLs assinadas curtas e retenção configurável.
- Edge Functions guardam chaves e coordenam; não fazem processamento pesado de STL por limites do runtime.
- Tráfego do browser para Storage deve aplicar limites de arquivo e autenticação; upload grande usa transferência retomável.
- Filas e jobs usam estados idempotentes: reenvio de webhook não cria cópias nem cobra OpenAI duas vezes.

## Alternativa sem Supabase

É possível eliminar o backend mensal transformando o produto em um aplicativo local para Windows. O aplicativo lê o STL do disco local, executa as ferramentas geométricas, usa o Bambu Studio/CLI instalado quando validado, chama a API OpenAI e guarda relatórios localmente. GitHub mantém o código e distribui versões; os arquivos do usuário não entram no repositório.

Essa rota não oferece uma página online com upload/histórico compartilhado. Para usar outro computador, o usuário instala o app e o Bambu Studio nele e usa os arquivos locais desse computador. Um fluxo online acessível de qualquer lugar precisa de um backend que proteja autenticação/chaves e de armazenamento privado; GitHub Pages sozinho não resolve isso.

## Custo do Supabase sem criar outro projeto

Se a experiência online for prioritária, avaliar primeiro o uso de um projeto Pro existente. Um schema, bucket e políticas RLS próprios podem separar logicamente as tabelas Bambu, mas essa separação é menor que uma instância independente e compartilha quotas de armazenamento/tráfego da organização. Conferir permissões, uso atual e riscos dos sistemas existentes antes de escolher o projeto.

Não criar projeto adicional por padrão: a cobrança atual do Supabase informa que cada projeto tem uma instância Postgres dedicada e projetos Pro adicionais começam em aproximadamente US$ 10/mês, sujeito a compute e uso.

## Impressão remota

A aplicação pode ser acessada fora de casa, sem depender de um PC doméstico como retransmissor, desde que a impressora esteja vinculada à conta Bambu e conectada ao Bambu Cloud. O usuário precisa ter o Bambu Studio instalado no computador que está usando e autenticado na mesma conta para abrir o projeto e enviar. Se a impressora estiver em LAN-only, o fluxo remoto via Cloud não se aplica. Não usar endpoints privados da Bambu.