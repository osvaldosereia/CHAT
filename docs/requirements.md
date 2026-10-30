# Requisitos do produto

## Objetivo

A partir de um STL enviado pelo usuário, produzir uma análise técnica para Bambu Lab A1 mini e preparar o melhor projeto de impressão que as ferramentas oficiais permitirem. O resultado deve explicar decisões e abrir no Bambu Studio para revisão.

## Perfil inicial confirmado

- Impressora Bambu Lab A1 mini.
- Windows no computador de uso; número/build do Bambu Studio pendente até a instalação.
- Bico 0,4 mm ou 0,2 mm, instalado fisicamente um de cada vez.
- Generic PLA como material inicial.
- Bambu Textured PEI Plate original.
- Prioridade: manter a intenção do modelo, buscar qualidade/detalhe e reduzir suporte quando a geometria permitir.
- STL de prova existente: Meshy_AI_Sentinel_Busts_20261029_generate.stl. Não copiar o arquivo ao repositório.

## Requisitos funcionais

### Envio e histórico

- Aceitar arquivo STL por interface web e armazená-lo em bucket privado.
- Calcular hash, tamanho e metadados de cada upload; manter o original inalterado.
- Mostrar fila, progresso, resultado, data e histórico de tarefas.
- Permitir remover arquivos e tarefas conforme uma política de retenção a definir.
- Tratar o tamanho real do modelo de prova (aprox. 90 MB e 1,8 milhão de triângulos) como caso inicial de dimensionamento.

### Análise de geometria

A análise determinística deve medir e relatar, no mínimo:

- dimensões X/Y/Z em milímetros como hipótese inicial;
- número de triângulos, componentes/conchas, volume e caixa envolvente;
- normais inconsistentes, bordas abertas, faces degeneradas/duplicadas e sinais de auto-interseção;
- paredes ou detalhes que podem não ser reproduzíveis com o bico selecionado;
- balanços, área de contato e candidatas a orientação;
- imagem renderizada em vistas úteis e evidências para recomendações de suporte.

STL não registra unidade de forma confiável. O sistema não deve redimensionar silenciosamente. Dimensões suspeitas ou intenção ambígua devem gerar aviso e estado de revisão.

### Recomendações de impressão

- Usar somente presets/versionamentos oficiais compatíveis com a máquina, o bico, o material e a placa selecionados.
- Recomendar orientação, posição, altura de camada, paredes, preenchimento, adesão e suportes com justificativa.
- Validar por código cada campo retornado pela API OpenAI contra os perfis e limites conhecidos.
- Mostrar nome exato do campo no Bambu Studio, valor, perfil de origem, motivo e nível de confiança.
- Confirmar o bico físico em cada tarefa; a aplicação não consegue detectar a troca de bico sem integração oficial.
- Usar uma cor/material por peça no escopo inicial. Multicolor e mapeamento AMS Lite ficam fora até configuração confirmada.

### Arquivos de saída e Bambu Studio

- Gerar relatório técnico legível, com alertas, decisões, campos do Studio e estado de validação.
- Entregar o 3MF para download e oferecer abertura no Bambu Studio pelo protocolo oficial do desktop, quando tecnicamente validado.
- Manter fallback para download e abertura manual.
- Mostrar se o arquivo é apenas analisado/configurado ou se foi efetivamente fatiado pelo slicer oficial.
- Só marcar como fatiamento verificado após confirmar máquina, bico, filamento, placa, suportes, Preview e metadados do resultado.

### Reparo de malha

- Nunca substituir o STL original.
- Reparo deve gerar uma cópia e registrar ferramenta, versão, operação, hash e medidas antes/depois.
- Se a correção depender de adivinhar a forma pretendida, bloquear reparo automático e pedir revisão.
- O modelo OpenAI não altera vértices diretamente e não gera G-code.

## Requisitos de segurança e privacidade

- GitHub hospeda código/documentação, não modelos enviados nem dados privados.
- Supabase Storage é privado e exige autenticação e políticas RLS.
- Chaves OpenAI e credenciais do GitHub ficam em segredos de servidor; jamais no navegador ou commits.
- A API OpenAI recebe medidas, imagens renderizadas e trechos técnicos necessários, não o STL bruto.
- O runner do GitHub Actions deve ser efêmero, não imprimir dados sensíveis em logs e não publicar artefatos de modelos.
- Workflows disparados por código de contribuidores externos não podem receber segredos.
- Nenhuma etapa inicia uma impressão física automaticamente.

## Estados sugeridos da tarefa

| Estado | Significado |
|---|---|
| uploaded | Arquivo guardado e registrado |
| queued | Aguardando análise |
| analyzing | Métricas e vistas em processamento |
| needs_review | Escala, malha ou decisão requer confirmação |
| recommendation_ready | Relatório baseado em análise; sem slicer verificado |
| slicing | CLI oficial em execução |
| slicer_verified | Slicer e projeto conferidos com sucesso |
| blocked | Segurança, malha ou configuração impede preparação |
| failed | Erro técnico recuperável ou não recuperável |

## Fora do escopo da primeira versão

- Controle direto ou impressão automática pela rede local ou APIs privadas da Bambu.
- Envio de G-code gerado por IA.
- Garantia de sucesso físico da impressão.
- Detecção automática de troca de bico, placa, filamento ou estado da máquina.
- Impressão multicolorida/AMS até configuração e fluxo serem validados.
- Reparos que mudem a intenção do desenho sem confirmação.

## Critérios de aceite do MVP

1. Usuário autenticado envia STL e consegue ver status/histórico.
2. Arquivo permanece privado e o original não é alterado.
3. Relatório inclui métricas verificáveis, vistas e configurações rastreáveis.
4. Recomendações são validadas contra perfis reais da A1 mini.
5. A interface identifica o bico, Generic PLA e Textured PEI usados no cálculo.
6. O 3MF abre no Bambu Studio ou existe fallback claro de download.
7. O estado nunca diz “fatiado/validado” se o slicer oficial não confirmou o resultado.
8. Usuário mantém a revisão final e a confirmação do envio à impressora.