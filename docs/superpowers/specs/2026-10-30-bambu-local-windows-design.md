# Design — aplicativo local de preparação para Bambu A1 mini

**Status:** proposta técnica para revisão do usuário. Nenhum código de produto será iniciado até a aprovação deste desenho.
**Data:** 30 de outubro de 2026.
**Repositório e branch:** osvaldosereia/CHAT, codex/bambu-a1-mini-foundation-20261029.

## Intenção

Criar um aplicativo de desktop para Windows que receba um STL local, analise a geometria, explique riscos e recomendações para a Bambu Lab A1 mini e prepare um projeto que possa ser aberto e revisado no Bambu Studio instalado no mesmo computador. O objetivo é reduzir as decisões manuais sem fingir que análise de software garante o sucesso físico da impressão.

A pessoa escolhe ou confirma o bico instalado, revisa o resultado no Bambu Studio e continua sendo responsável por iniciar a impressão.

## Decisões confirmadas

- V1 exclusivamente local no Windows: sem site online, Supabase, fila remota ou envio de STL à nuvem.
- GitHub guarda o código, documentação e builds do aplicativo; nunca guarda STL, 3MF de usuário, chave OpenAI ou relatórios privados.
- OpenAI API é usada para interpretar medições e imagens renderizadas. O STL original fica no computador; vistas renderizadas e métricas selecionadas são enviadas ao serviço OpenAI.
- Equipamento inicial: Bambu Lab A1 mini, bico físico 0,4 mm ou 0,2 mm, Generic PLA e Bambu Textured PEI Plate original.
- Bambu Studio continua sendo o fatiador e o caminho oficial para revisar o Preview e enviar à impressora.
- Nenhum envio automático para a impressora e nenhuma API privada ou reversa da Bambu.
- O bico deve ser confirmado para cada trabalho: a aplicação não presume que consegue detectar uma troca física.

## Objetivos

1. Abrir ou arrastar um STL local e preservar o arquivo original sem modificações.
2. Calcular métricas verificáveis da malha e mostrar vistas da peça.
3. Identificar escala ambígua, malha defeituosa, detalhes finos e riscos de orientação, suporte ou aderência.
4. Consultar a OpenAI com evidências derivadas e obter recomendações limitadas a campos conhecidos.
5. Validar recomendações contra os perfis oficiais compatíveis com a versão instalada do Bambu Studio.
6. Quando a integração local estiver comprovada, fatiar com o CLI oficial e gerar um 3MF que abra no Bambu Studio.
7. Exibir com precisão se o resultado está apenas analisado, configurado, fatiado/verificado ou aguardando revisão.
8. Guardar histórico e resultados somente no perfil local do Windows, com opção de remover tarefas e arquivos.

## Fora de escopo da V1

- Acesso ao aplicativo por outro computador, celular ou local remoto.
- Sincronização de arquivos, histórico ou fila pela internet.
- Controle remoto de interface por automação de cliques, envio por protocolos privados ou disparo de impressão sem confirmação.
- Suporte multicolor/AMS Lite, múltiplos materiais, vários modelos de impressora ou outros slicers.
- Reparos que mudem a intenção do desenho sem aprovação explícita.
- Prometer uma impressão sem falhas: o software pode validar malha, configurações e resultado do slicer, mas não o resultado físico.

## Abordagens consideradas

### A. Aplicativo local de desktop para Windows — escolhida

O programa lê o STL do disco, calcula as métricas localmente, guarda o histórico localmente, chama a API OpenAI com dados derivados e executa o Bambu Studio instalado. Essa opção atende ao pedido de uso local, evita custos e dependências do Supabase nesta fase e mantém o STL original no computador. A desvantagem é que o aplicativo e seu histórico não ficam disponíveis remotamente.

### B. Aplicativo local com portal e fila Supabase

Um serviço no Windows processaria tarefas enviadas por uma página online. Permitiria submissão de outro local, desde que o computador de casa estivesse ligado e o agente ativo. Exigiria autenticação, armazenamento privado, uma conexão de rede persistente e avaliação de custo/segurança. Fica para uma fase futura, caso o usuário volte a priorizar acesso remoto.

### C. Processamento em GitHub Actions

GitHub Actions poderia executar trabalhos temporários, mas os arquivos seriam enviados para runners externos, haveria limites e tratamento adicional de segredos, e o CLI do Bambu Studio no Windows ainda precisa ser validado. Não se ajusta à decisão de manter STL e preparação no PC local; não será usado para processar modelos.

### Escolha técnica dentro da abordagem local

Por decisão técnica do desenvolvedor, a primeira implementação será uma aplicação desktop em Python com PySide6, análise de malha usando Trimesh e histórico SQLite local. Python aproxima a UI do ecossistema de análise geométrica e permite iniciar o Bambu Studio como processo local. PySide6 tem distribuição comunitária LGPLv3/GPLv3; os avisos e obrigações de bibliotecas serão revisados antes de publicar um build. A alternativa Tauri com worker Python seria possível, mas introduziria um segundo runtime, build Rust e empacotamento de sidecar sem benefício necessário para uma ferramenta de uso próprio.

## Experiência e fluxo

1. Na primeira abertura, o usuário informa onde está instalado o Bambu Studio. O app registra sua versão/build e verifica se o CLI responde ao comando de ajuda.
2. O usuário seleciona o STL. A interface calcula hash, tamanho, formato e dimensões provisórias; não altera escala silenciosamente.
3. O usuário confirma a variante A1 mini e o bico fisicamente instalado. Generic PLA e Textured PEI ficam visíveis como seleções padrão.
4. O app executa análise geométrica local e produz vistas frontal, lateral, superior e uma vista de riscos de balanço/contato quando suportada.
5. O app identifica o que pode concluir com segurança e o que precisa de confirmação. Casos de escala ambígua, geometria aberta grave, múltiplas conchas inesperadas ou reparo incerto ficam como needs_review ou blocked.
6. Se autorizado para a tarefa, o app envia à OpenAI métricas e imagens renderizadas. Não envia o STL bruto. Se a API não estiver configurada ou a internet estiver indisponível, a análise geométrica local continua e a recomendação da IA fica indisponível.
7. O código valida cada campo da resposta da IA por enumeração, tipo, faixa e compatibilidade com os perfis oficiais. Campos desconhecidos são rejeitados, não aplicados.
8. O app prepara o projeto e tenta fatiar usando o CLI do Bambu Studio instalado. Verifica saída, arquivo, metadados e configurações detectáveis.
9. O botão Abrir no Bambu Studio abre o arquivo local. O usuário confere máquina, bico, material, placa, suportes e Preview e decide se envia à A1 mini.

## Arquitetura local proposta

| Componente | Responsabilidade |
|---|---|
| Interface PySide6 | Seleção de STL, configuração da impressora, progresso, relatório e abertura do Bambu Studio. |
| Núcleo Python | Validar arquivo, executar análise determinística, produzir imagens e validar recomendações. |
| Trimesh e NumPy | Carregar STL, bounds/dimensões, componentes, volume quando válido, faces degeneradas, watertightness e operações geométricas disponíveis. |
| Adaptador Bambu Studio | Localizar o executável, consultar versão, chamar CLI sem shell intermediário, passar perfis e parâmetros, capturar logs locais e verificar arquivos de saída. |
| Adaptador OpenAI | Chamar a Responses API com schema de resposta limitado, métricas e imagens renderizadas. A chamada exige internet. |
| SQLite e arquivos locais | Histórico mínimo, estado de cada trabalho, medições, decisões e caminhos de resultados. Arquivos do usuário ficam em diretório local configurável. |
| GitHub Actions | Compilar e empacotar a aplicação para Windows; não processar uploads nem receber segredos em execução de pull request. |

### Arquivos e segredos

- Pasta padrão proposta: %LOCALAPPDATA%/BambuPrep para configuração, base SQLite, logs locais e cache temporário; cada resultado pode ser salvo em uma pasta escolhida pelo usuário.
- O STL de entrada é somente leitura. Reparos produzem uma cópia com hash e relatório de antes/depois.
- A chave OpenAI é fornecida pelo próprio usuário. Nunca será embutida no executável, repositório ou build compartilhado; será guardada no Windows Credential Manager ou mecanismo equivalente de proteção por usuário.
- Cada instalação usa uma chave OpenAI individual. A API é faturada separadamente da assinatura ChatGPT; o aplicativo deve explicar essa cobrança e permitir configurar limites/avisos antes de chamar a API.
- Mesmo sem enviar o STL bruto, vistas renderizadas podem revelar o formato da peça. A interface mostrará exatamente quais dados sairão do computador e pedirá consentimento antes da primeira chamada.

## Análise geométrica e limites da IA

A geometria será medida por código determinístico, não inferida pela IA. O relatório incluirá, quando calculável:

- X/Y/Z, contagem de triângulos, número de componentes/conchas, bounds, volume com indicação de validade e hash do arquivo;
- bordas abertas, watertightness, normais inconsistentes, triângulos degenerados/duplicados e indícios de geometria autointersectante;
- espessuras/detalhes estimados em relação ao bico escolhido, zonas de balanço, área de contato e candidatas a orientação;
- vistas e justificativas das recomendações de suporte e adesão.

STL não armazena uma unidade de medida confiável. Dimensões implausíveis serão sinalizadas e exigirão confirmação; nenhuma escala será corrigida sem aviso. Reparos simples de normais ou furos só poderão ocorrer em cópia e com registro de ferramenta/versão, operação, hash e medidas antes/depois. Se a correção exigir adivinhar a forma pretendida, o app pede revisão.

A OpenAI explica e prioriza evidências. Não altera vértices, não produz G-code e não é fonte autoritativa de presets. O código e o Bambu Studio continuam sendo a autoridade sobre medidas, limites e fatiamento.

## Bambu Studio: integração e estado de validação

O CLI oficial documenta opções para carregar arquivo STL/3MF, carregar perfil de máquina/processo e filamento, orientar, organizar, fatiar e exportar 3MF. Isso é adequado para uma integração local direta. Porém, há relatos no projeto oficial de diferenças e falhas silenciosas em Windows/headless; a versão do Studio do usuário ainda não foi registrada. Por isso, nenhum build pode declarar slicer_verified até executar a prova com a instalação real, o STL de referência e a saída reaberta no Studio.

Se o CLI falhar ou gerar uma saída que não possa ser validada, a aplicação mantém o relatório e informa os nomes/valores exatos para conferência manual. Não apresenta uma recomendação como projeto fatiado. O primeiro teste de integração usa o STL Sentinel Busts já fornecido, sem adicionar esse arquivo ao repositório.

Estados visíveis:

| Estado | Significado |
|---|---|
| uploaded | STL local selecionado e validado como entrada. |
| analyzing | Cálculos locais e geração de vistas em andamento. |
| needs_review | Uma decisão de escala, reparo, orientação ou configuração exige o usuário. |
| recommendation_ready | Há análise e recomendação, mas ainda sem fatiamento oficial verificado. |
| project_configured | Há projeto exportado com configurações detectadas, mas o slice não foi validado. |
| slicer_verified | CLI concluiu e o projeto/perfis/saída foram conferidos no Bambu Studio; isso não garante sucesso físico. |
| blocked | Malha ou configuração impede preparar o projeto com segurança. |
| failed | Erro técnico descrito com ação de recuperação. |

## Privacidade, segurança e custo

- V1 não transmite STL, 3MF, histórico ou tarefas para Supabase/GitHub. GitHub Actions recebe apenas código confiável para criar o build.
- Entrada STL é tratada como dado inerte. O executável do slicer será iniciado com uma lista de argumentos, sem composição de comando por shell e sem executar conteúdo recebido do arquivo.
- A chamada OpenAI envia apenas campos necessários, com um aviso de privacidade; imagens da geometria podem identificar o design e não são consideradas anônimas.
- A chave OpenAI pertence ao usuário. OpenAI recomenda não embutir chaves em aplicações cliente; cada instalação deverá solicitar sua própria chave, protegê-la no Windows e nunca compartilhar uma chave pronta no build.
- Uso da API OpenAI pode gerar cobrança separada do ChatGPT Plus. Aviso de custo e limite de uso são parte da configuração inicial.
- Logs técnicos ficam localmente, evitam copiar o STL e removem dados sensíveis/identificadores desnecessários.

## Critérios de aceite da V1

1. O aplicativo instala/abre em Windows suportado e localiza ou solicita o caminho do Bambu Studio.
2. Aceita STL ASCII/binário incluindo o arquivo de referência denso, sem enviar o arquivo ao GitHub ou à OpenAI.
3. Preserva o original e exibe dimensões, triângulos, componentes e avisos calculados.
4. Obriga a confirmação do bico instalado e mostra Generic PLA e Textured PEI como configuração selecionada.
5. Explica que vistas e métricas serão enviadas à OpenAI e só faz isso após consentimento e chave válida.
6. Rejeita campos não permitidos/incompatíveis da resposta de IA e mantém justificativa/rastreabilidade.
7. Só gera estado slicer_verified depois de validar o CLI e reabrir o 3MF no Bambu Studio sem divergência conhecida.
8. Quando o CLI não puder ser validado, mostra instruções exatas de conferência manual e usa recommendation_ready/project_configured.
9. Nunca inicia impressão física automaticamente.
10. A pessoa consegue apagar o histórico e arquivos locais do app.

## Marcos de desenvolvimento

1. **Prova local do Bambu Studio:** registrar Windows e build instalado, descobrir executável/CLI, preparar máquina/processo/filamento oficiais e validar o STL de referência em 0,4 mm e 0,2 mm, sem imprimir.
2. **Base desktop e segurança:** interface Windows, seletor de perfis, chave OpenAI protegida, estrutura de diretórios, SQLite local e estados de trabalho.
3. **Análise geométrica:** ingestão STL, diagnósticos, vistas, limites de tamanho/memória e relatório local.
4. **Recomendação IA:** chamadas Responses com schema restrito, envio de métricas/imagens consentidas, validação local, rastreabilidade e aviso de cobrança.
5. **Projeto 3MF e fatiamento:** chamada CLI do Studio, verificação dos perfis/saída, abertura local no Studio e fallback manual preciso.
6. **Build Windows:** empacotar com pyside6-deploy em distribuição standalone, incluir avisos de licença e publicar release sem dados de usuário.

A ordem dos marcos é intencional: confirmar o CLI instalado é uma prova de viabilidade antes de assumir que o app pode fazer fatiamento completo automaticamente.

## Pendências que não bloqueiam o desenho, mas bloqueiam a prova final

- Versão/build do Bambu Studio e versão do Windows.
- Confirmação se o STL Sentinel Busts continua acessível como arquivo de prova no momento da implementação.
- Chave individual OpenAI e autorização para usar a API, com orçamento/limite inicial definido na configuração.
- Regras de retenção local (proposta inicial: não apagar arquivos de resultado automaticamente; usuário controla exclusão).
- Verificação final de licenças e tamanho do pacote das dependências congeladas.

## Fontes técnicas consultadas

- Bambu Studio — uso de linha de comando: https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage
- Bambu Studio — relato de CLI no Windows: https://github.com/bambulab/BambuStudio/issues/9802
- Bambu Studio — relato recente de falha silenciosa no CLI: https://github.com/bambulab/BambuStudio/issues/10402
- Qt for Python — implantação PySide6 e modos standalone/onefile: https://doc.qt.io/qtforpython-6/deployment/deployment-pyside6-deploy.html
- Qt for Python — licença comunitária LGPLv3/GPLv3 e comercial: https://doc.qt.io/qtforpython-6/
- Trimesh — formatos, análise, watertightness e orientação para fixar versão: https://github.com/mikedh/trimesh
- OpenAI — segurança de chaves de API: https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety
- OpenAI — faturamento separado entre ChatGPT e API: https://help.openai.com/pt-br/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform