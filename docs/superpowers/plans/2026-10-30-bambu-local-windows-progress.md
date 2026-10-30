# BambuPrep local para Windows — ledger de implementação

## Estado atual — 2026-10-30

- Branch: `codex/bambu-a1-mini-foundation-20261029`
- HEAD anterior registrado no ledger: `3402943aa961ad258c03ca9006ade0a224f03954`; na rodada anterior, `ea19bfbea3c60d7e3fad3afcc92a9764867a5135`.
- HEAD remoto confirmado antes desta atualização do ledger: `0b5ee53beca11b1d5974a9f074abbbf8b214ab25` (`feat: add local key settings and history cleanup controls`); commits de código anteriores da UI: `727811553b7c89b79c736a14d25d9a3a5614f513` e `85e8488f521b4691e5ecaf8494afe034db206371`.
- Escopo confirmado: aplicativo local; nenhuma API remota, Supabase, upload de STL/3MF nem impressão automática.
- Primeiro item incompleto no plano: prova real do Bambu Studio na Tarefa 1, dependente do PC Windows do usuário e do STL de referência. O diagnóstico e os testes simulados existem, mas não há evidência de instalação Windows real.
- O ledger acompanha tarefas, comandos, resultados, decisões e bloqueios desta implementação.

## Concluído nesta rodada

- Criado `StudioProbe` e `probe_studio(Path, timeout_seconds=20)`.
- Descoberta usa caminho explícito, executa `--version` e `--help` com lista de argumentos, `shell=False`, captura saídas/código de retorno e timeout. A ajuda é interpretada apenas para listar opções observadas; isso não declara compatibilidade funcional.
- Criado script de diagnóstico que funciona diretamente do checkout e retorna JSON.
- Criado `pyproject.toml`, ponto de entrada provisório, testes unitários e modelo de relatório para a prova manual.
- No plano, Tarefa 1 tem quatro itens concluídos: testes, comando prescrito, implementação do diagnóstico e regra do gate; os dois itens da prova real permanecem desmarcados.

## Evidência de comandos executados

Ambiente da rodada: Linux, Python 3.12.14; não é Windows e não possui Bambu Studio instalado.

- `python -m pip install pytest` — concluído; pytest 9.2.0 instalado no ambiente desta rodada.
- RED discovery: `PYTHONPATH=bambuprep-local/src python -m pytest bambuprep-local/tests/unit/test_bambu_discovery.py -v` — falhou na coleta porque `bambuprep.bambu.discovery` ainda não existia.
- RED CLI: `cd bambuprep-local && python -m pytest tests/unit/test_cli_probe.py -v` — falhou porque o script executado diretamente não encontrava o pacote `bambuprep`.
- GREEN Tarefa 1: `cd bambuprep-local && python -m pytest tests/unit/test_bambu_discovery.py -v` — 7 passed.
- GREEN suíte local: `cd bambuprep-local && python -m pytest -v` — 8 passed.
- Sintaxe: `cd bambuprep-local && python -m compileall -q src tools tests` — exit 0.
- CLI sem executável: `python tools/bambu_cli_probe.py --executable /definitely/not/installed/BambuStudio.exe` — JSON correto, `cli_available=false`, exit 2.

## Tarefa 2 — concluída na rodada anterior

- Implementados os estados do domínio e regras de transição; `slicer_verified` é terminal e somente pode ser alcançado a partir de `project_configured`.
- Implementadas configuração sob `%LOCALAPPDATA%/BambuPrep`, migração inicial SQLite versão 1, repositório com eventos de estado e exclusão do histórico sem apagar STL de origem.
- Implementado adaptador injetável de segredo; a fábrica exige Windows e backend real `WinVaultKeyring`. Não existe fallback em arquivo. O teste usa backend em memória; nenhuma chave real foi usada. Commit de código desta etapa: `262a130f821b6712492ed4980812ea7c6c89068f` (`feat: add local job storage and secure settings`).
- Adicionada dependência de runtime `keyring>=25.5,<27`. Com `keyring 25.7.0` instalada no ambiente Linux, o import `keyring.backends.Windows.WinVaultKeyring` foi confirmado; o Credential Locker real não foi exercitado.
- O teste garante que o banco não contém bytes do STL. Verificação adicional: `rg -n "logging|logger|print\\(" src/bambuprep` não encontrou logger ou saída de log no núcleo; nenhum dado é escrito em logs. Assim, a verificação do banco (sem bytes STL/segredo) e a ausência de logging concluem esta checklist.
- RED de configuração: `cd bambuprep-local && python -m pytest tests/unit/test_config.py -v` falhou na coleta porque `bambuprep.config` ainda não existia; após implementar, os três testes passaram.
- Teste prescrito da Tarefa 2: `cd bambuprep-local && python -m pytest tests/unit/test_job_transitions.py tests/unit/test_local_storage.py tests/unit/test_api_key_store.py -v` — 12 passed.
- Suíte completa: `cd bambuprep-local && python -m pytest -v` — 25 passed.
- Sintaxe: `cd bambuprep-local && python -m compileall -q src tools tests` — exit 0.

## Tarefa 3 — implementação independente desta rodada

- Implementada ingestão somente leitura de STL ASCII/binário, SHA-256, limites configuráveis de bytes/faces, rejeição de arquivos vazios/truncados, validação finita e preservação dos bytes originais.
- Criada análise com dimensões, triângulos, conchas, volume somente para volume orientado válido, watertightness, faces degeneradas/duplicadas, escala suspeita, alertas de winding e estimativas de sobrehang/contato.
- Orientações candidatas registram rotação e os indicadores usados na ordenação. São heurísticas e não prometem sucesso físico.
- Reparos `fix_normals` e `fill_holes` são aplicados a uma cópia e retornam hash, dimensões, triângulos, operação e versão do Trimesh. O destino exclusivo nunca sobrescreve entrada ou arquivo criado em uma corrida concorrente.
- Vistas front/side/top/risk são PNG com Matplotlib Agg. Acima de 50.000 faces a renderização tenta simplificar somente uma cópia visual usando fast-simplification; medições continuam na malha original.
- Os 12 fixtures são pequenos dados sintéticos; incluem STL binário e ASCII. Nenhum STL privado do usuário foi enviado ao GitHub.
- Ruling: limitar por padrão a análise a 500.000 faces e 100 MiB — mantém a ingestão previsível em máquinas desktop; se o STL de referência exceder o limite, a chamada deve falhar com instrução para elevar o limite ou preparar a referência localmente.
- Ruling: volume só é apresentado quando `Trimesh.is_volume` confirma malha fechada e winding consistente — evita apresentar volume incorreto em casca orientada inconsistentemente; o custo é deixar alguns volumes desconhecidos como revisão.
- RED principal: os quatro módulos ainda não existiam (`ModuleNotFoundError: bambuprep.mesh`). RED adicional confirmou que uma malha fechada com winding inconsistente recebia volume indevido; teste passou após condicionar volume a `is_volume`.
- RED de reparo revelou que a rotina de erro podia apagar o arquivo de destino criado entre o pré-check e `open("xb")`; corrigido para remover somente arquivo criado pela própria operação.
- RED de limite revelou confiança em `Path.stat()` potencialmente obsoleto; loader agora lê por descritor em blocos limitados e confere tamanho antes/depois.
- RED de escala zero e coordenadas extremas levou a alertas combinados de escala e precisão dinâmica de merge; limites numéricos fora da faixa segura falham com mensagem acionável.
- QA visual do PNG sintético mostrou sobreposição entre rodapé e eixo; margem do gráfico ajustada e coberta por teste de layout.
- Dependências executadas no Linux: Trimesh 4.12.2, NumPy 2.3.5, Matplotlib 3.10.8, NetworkX 3.7 e fast-simplification 0.2.0. NetworkX foi incluído porque `trimesh.repair.fill_holes` exige essa dependência opcional.
- Comandos: `python -m pip install pytest` e `python -m pip install 'trimesh>=4.6,<5' 'fast-simplification>=0.1.12,<1' 'keyring>=25.5,<27'` e `python -m pip install 'networkx>=3,<4' 'keyring>=25.5,<27'` — concluídos.
- Fixtures: `python bambuprep-local/tests/fixtures/make_fixtures.py` — concluído.
- Testes prescritos: `cd bambuprep-local && python -m pytest tests/unit/test_stl_loader.py tests/unit/test_mesh_analysis.py tests/unit/test_mesh_repair.py tests/unit/test_mesh_render.py -v` — 24 passed.
- Suíte completa: `cd bambuprep-local && python -m pytest -v` — 49 passed.
- Sintaxe: `cd bambuprep-local && python -m compileall -q src tools tests` — exit 0.
- Simplificação real local: Trimesh 4.12.2 reduziu uma esfera sintética de 5.120 para 500 faces; a malha original permaneceu byte/geometricamente inalterada.
- Limitações: não foram calculadas espessuras de paredes nem interseções próprias de forma exaustiva. O STL Sentinel, Bambu Studio e Windows do usuário não estão disponíveis; nenhuma prova real de referência ou fatiamento foi feita.

## Tarefa 4 — recomendações OpenAI limitadas e consentidas

- Criado `Recommendation` e `RecommendationProfileOptions`. O schema JSON estrito limita orientações às candidatas medidas, opções de suporte/aderência aos identificadores do catálogo instalado e referências a métricas/vistas efetivamente fornecidas.
- Criado transporte síncrono Responses API com timeout, limites de 4 MiB por PNG, 12 MiB total e 1 MiB por resposta, `store=false`, schema estruturado, sem retries e sem logs do corpo/segredo.
- A chamada exige `consent is True` antes de acessar o armazenamento de chave. Sem consentimento, perfil instalado, quatro imagens PNG, chave ou resposta válida, não chama a API ou falha de forma fechada sem descartar o relatório geométrico local.
- O corpo da requisição inclui somente campos de configuração selecionados, métricas derivadas allowlisted, opções instaladas, referências de evidência e vistas PNG base64. Não inclui hash diretamente, caminho, nome do arquivo, bytes do STL, histórico ou chave. A chave entra apenas no cabeçalho HTTP Authorization e não é registrada.
- Texto de consentimento em português informa que as quatro vistas podem revelar o formato da peça e que o uso da API tem cobrança separada do ChatGPT Plus. A confirmação na interface por trabalho continua pendente para a Tarefa 6.
- Validação local rejeita campos extras, orientação não medida, enum/perfil incompatível, suporte contraditório, confiança fora de 0–1, justificativas inválidas e referências de evidência ausentes.
- Nenhuma chamada real à OpenAI foi executada; testes usam cliente fake e `urlopen` mockado. Nenhuma chave foi usada.

### Decisões registradas

- Ruling: a assinatura recebe `profile_options` como argumento keyword-only opcional e falha se ausente — o schema precisa enumerar escolhas originadas do catálogo local; custo se estiver errado: o chamador deve obter e encaminhar opções do Bambu Studio antes de pedir recomendação.
- Ruling: a chave API fica somente no cabeçalho Authorization, nunca no corpo JSON, logs ou GitHub — uma chamada autenticada precisa usar a chave; custo se estiver errado: o segredo ainda é transmitido ao serviço para autenticação, portanto a chave deve ser individual e revogável.
- Ruling: modelo padrão `gpt-6-luna`, configurável no cliente — a documentação oficial atual o descreve como modelo de baixo custo para tarefas focadas e lista Responses, entrada de imagem e Structured Outputs; custo se qualidade/capacidade ou disponibilidade mudar: atualizar o modelo configurado antes de habilitar chamadas.

### Comandos e resultados verificados

Ambiente: Linux, Python 3.12.14, pytest 9.2.0; sem Windows, Studio, chave ou endpoint de rede usado.

- `python -m pip install 'pytest>=8,<10'` — exit 0.
- Primeira execução prescrita, antes de instalar dependências do projeto: coleta não iniciou porque Trimesh não estava instalado (exit 2); resolvido instalando o projeto em modo editável.
- `python -m pip install -e '.[test]'` — exit 0; dependências existentes do projeto e extras de teste instalados.
- RED da Tarefa 4: comando prescrito falhou na coleta porque `bambuprep.recommendations` ainda não existia (exit 2).
- `python -m pytest tests/unit/test_recommendation_schema.py tests/unit/test_openai_privacy.py tests/unit/test_recommendation_validation.py -v` — 26 passed.
- `python -m pytest -v` — 75 passed.
- `python -m compileall -q src tools tests` — exit 0.
- Cobertura de transporte: teste mockado verificou URL Responses, cabeçalho de autenticação, JSON compacto e timeout; não houve conexão de rede.

Commit de código: `5804f78b456af1f69ed99f4dd799039360de5697` (`feat: add consented OpenAI recommendations`).

## Tarefa 5 — catálogo local de perfis (parte independente)

- Implementado `ProfileCatalog.load(studio_root)` em `src/bambuprep/bambu/profiles.py`. O leitor abre apenas `resources/profiles/BBL.json` e os arquivos JSON locais declarados nele; não executa o Studio nem acessa rede.
- Mapeia o modelo A1 mini, exige variantes 0,2 mm e 0,4 mm, Generic PLA compatível por variante, perfil de processo padrão compatível com o mesmo bico e `default_bed_type`. Exporta somente IDs/opções do catálogo local por `RecommendationProfileOptions`.
- Resolve `inherits` dos processos para derivar `support_type` e opções normalizadas de adesão. Rejeita arquivo ausente, inconsistência de tipo/nome, limites excessivos, caminhos relativos que escapem da pasta (incluindo symlinks), versão inválida e ciclos/pais ausentes na herança.
- Testes usam fixtures JSON sintéticas pequenas; cobrem o mapeamento de ambos os bicos, Generic PLA, placa, perfil padrão, opções exportadas, defaults incompatíveis, dados necessários ausentes, traversal, symlink e ciclo de herança. Não foi lida uma instalação Bambu Studio do usuário.
- Fontes públicas oficiais usadas apenas para orientar o formato: [manifesto BBL](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL.json), [modelo A1 mini](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/machine/Bambu%20Lab%20A1%20mini.json), [perfil de processo comum](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/process/fdm_process_common.json). Isso não substitui a prova local Windows exigida pela Tarefa 1.
- Nenhum STL/3MF privado, chave ou histórico foi incluído. Nenhuma chamada OpenAI foi feita.

### Comandos e resultados desta parte

Ambiente Linux, Python 3.12.14, pytest 9.2.0; sem Bambu Studio/Windows do usuário.

- RED: `python -m pytest tests/unit/test_profile_catalog.py -v` — coleta falhou como esperado porque `bambuprep.bambu.profiles` ainda não existia (exit 2).
- GREEN: `python -m pytest tests/unit/test_profile_catalog.py -v` — 9 passed.
- Suíte: `python -m pytest -v` — 84 passed.
- Sintaxe: `python -m compileall -q src tools tests` — exit 0.

### Tentativa de habilitar testes Qt

- `python -c "import PySide6; print(PySide6.__version__)"` — exit 1; PySide6 não está instalado neste ambiente.
- `python -m pip install 'PySide6>=6.8,<7'` — tentativa interrompida após timeouts de conexão com `pypi.org`/`files.pythonhosted.org`; o pacote não foi instalado. Nenhuma interface/teste Qt foi mantido ou declarado verificado.
- A confirmação visual por trabalho permanece pendente para a Tarefa 6; a barreira de serviço `consent is True` e os testes sem consentimento da Tarefa 4 seguem ativos.

Commit de código: `b5d4e50e0905961ac4b4f9f36006f7a69a10a6dd` (`feat: read installed A1 mini profile catalog`).

## Tarefa 6 — serviço de fluxo local (parte verificada)

- Implementado `WorkflowService.create_job/analyze/recommend`. O serviço valida o STL na criação, verifica que o arquivo mantém o hash registrado, confirma bico/material/placa contra os perfis locais e mede a malha sem rede.
- A análise grava em SQLite somente JSON de métricas, seleção e recomendação validada; grava relatório e transição de estado atomicamente. Bytes do STL e imagens não são persistidos no banco. Mudança da fonte bloqueia o trabalho; falha técnica local marca `failed`; falha de recomendação mantém o relatório e `needs_review`.
- `recommend(job_id, consent)` retorna sem ler a chave quando consentimento não for exatamente `True`. Com consentimento, regenera imagens localmente e chama o adaptador injetável; recomendação validada move o estado para `recommendation_ready`.
- Implementado `WorkflowTaskRunner` com um worker por padrão, fila limitada e `Future` para a UI observar sem esperar sincronamente. O runner não mexe em widgets; uma futura camada Qt deve aplicar atualizações na thread principal.
- Testes de recomendação usam somente chave/client fake. Nenhuma chamada OpenAI real ocorreu. A interface modal PySide6 por trabalho não está pronta, portanto a barreira booleana ainda não está conectada a uma confirmação visual; não habilitar chamada real pela UI.
- Não foram implementados `slice`, `project_configured`, revisão do 3MF, `confirm_studio_review` ou integração CLI; o gate da Tarefa 1 continua fechado.

### Comandos e resultados desta parte

Ambiente Linux, Python 3.12.14, pytest 9.2.0; nenhuma chamada de rede de produto.

- RED: `python -m pytest tests/unit/test_workflow_service.py -v` — coleta falhou como esperado porque `bambuprep.workflow` ainda não existia (exit 2).
- GREEN: `python -m pytest tests/unit/test_workflow_service.py -v` — 7 passed.
- Suíte após serviço: `python -m pytest -v` — 91 passed.
- RED runner: `python -m pytest tests/unit/test_workflow_runner.py -v` — coleta falhou como esperado porque `bambuprep.workflow.runner` ainda não existia (exit 2).
- GREEN runner: `python -m pytest tests/unit/test_workflow_runner.py -v` — 3 passed.
- Suíte atual: `python -m pytest -v` — 94 passed.
- Sintaxe: `python -m compileall -q src tools tests` — exit 0.

Commits de código: `2018baad38202eb90de80367d1701940a2137a35` (`feat: orchestrate local analysis and consented recommendations`) e `c4f32a210492ba8241fb5d0bdaa4f4ec1ec49688` (`feat: run workflow actions in bounded workers`).

## Rodada 2026-10-30 — estrutura genérica 3MF

- O primeiro item incompleto continua sendo a prova real da Tarefa 1 no Windows. Não há nesta execução instalação/caminho/versão do Bambu Studio no PC do usuário nem STL Sentinel disponível; o gate de CLI e fatiamento permanece fechado.
- Adicionado `src/bambuprep/bambu/project_3mf.py`: inspetor local, somente leitura e com limites para pacote ZIP/OPC, partes duplicadas/inseguras, tamanhos, CRC, tipos de conteúdo, relação-raiz interna para o modelo, XML core, unidades, objetos/build, vértices/triângulos, referências de componentes e ciclos.
- Retorna nomes de partes sob `Metadata/`; não interpreta valores de metadados proprietários Bambu e não declara projeto configurado, compatibilidade do Studio, fatiamento ou `slicer_verified`. Não extrai nem altera o arquivo.
- Testes usam pacotes ZIP construídos em memória/temporários: estrutura e metadado detectável, Content Type padrão, malha de um triângulo, relação ausente/externa, índice fora da faixa, path traversal, nome duplicado e DTD/entity. Nenhum 3MF do usuário ou arquivo produzido pelo Studio foi usado.
- Decisão: aceitar uma malha estruturalmente válida com um triângulo; número mínimo de faces não faz parte desta inspeção genérica de estrutura. Relação de modelo externa é rejeitada. A validação do projeto/fatiamento continua separada e exige a prova da Tarefa 1.
- Fonte de formato consultada: repositório da especificação Core 3MF, https://github.com/3MFConsortium/spec_core. O formato ZIP/OPC/XML usado em fixtures não é prova de compatibilidade Bambu.

### Evidência real de comandos

Ambiente Linux, Python 3.12.14, pytest 9.2.0; nenhum Bambu Studio ou dado privado do usuário disponível.

- RED após corrigir os fixtures: `python -m pytest tests/unit/test_project_3mf.py -v` — 2 failed, 6 passed: expôs rejeição indevida da malha de um triângulo e aceitação de relação externa.
- GREEN: `python -m pytest tests/unit/test_project_3mf.py -v` — 8 passed; 1 aviso esperado do `zipfile` ao construir fixture com nome duplicado.
- Suíte completa: `python -m pytest -v` — 102 passed; 1 aviso do mesmo fixture.
- Sintaxe: `python -m compileall -q src tools tests` — exit 0.
- Commit de código: `670324be82bd3820b921261ae1fe71511355b5df` (`feat: inspect local 3MF package structure`).

## Continuação 2026-10-30 — interface parcial e barreira de consentimento

- O primeiro gate incompleto segue sendo a prova real da Tarefa 1 em Windows. Esta rodada não teve instalação/build/path reais do Bambu Studio, STL Sentinel, chave API nem confirmação do usuário sobre o bico físico.
- Criados `src/bambuprep/ui/main_window.py`, `ui/consent.py` e `app.py`; o entry point agora inicia a composição Windows. A janela recebe dependências locais, seleciona STL, apresenta variantes A1 mini/bico, Generic PLA e placa do catálogo, exige checkbox novo de confirmação física por trabalho e submete análise/recomendação no worker existente. Um QTimer consulta o Future e aplica resultados na thread Qt.
- Cada tentativa de recomendação mostra modal com o texto de privacidade/cobrança e “Não” como padrão. O helper só executa a ação quando a resposta é o objeto booleano literal `True`; o teste verifica recusa, valores ambíguos e novo prompt em toda tentativa.
- Não há fatiamento, botão de imprimir ou exibição de 3MF. A recomendação mostra explicitamente que não configura/fatia/inicia impressão. Ainda faltam prévia das quatro vistas na janela, tela de configurações para salvar chave no Credential Locker, histórico/exclusão pela UI, integração visual com Qt validada e testes Qt/Windows reais.
- `pyproject.toml` passou a declarar PySide6 como dependência de runtime e o comando `bambuprep`. Se o Credential Locker estiver indisponível, o app cria somente um adaptador que retorna ausência de chave; não grava segredo em arquivo e mantém análise local.
- Nenhuma chamada OpenAI foi realizada. A API só é alcançada pelo serviço se o usuário confirmar o modal daquele trabalho e houver chave local.

### Comandos e evidência

Ambiente Linux, Python 3.12.14, pytest 9.2.0. PySide6 não instalado; execução/QA visual Qt não verificada.

- RED da barreira: `python -m pytest tests/unit/test_ui_consent.py -v` — exit 2 na coleta porque `bambuprep.ui` ainda não existia.
- GREEN focado: `python -m pytest tests/unit/test_ui_consent.py -v` — 3 passed.
- Suíte completa após os ajustes: `python -m pytest -v` — 105 passed; 1 aviso esperado da fixture ZIP duplicada em `test_project_3mf.py`.
- Sintaxe: `python -m compileall -q src tools tests` — exit 0.
- `python -c "import PySide6; print(PySide6.__version__)"` — exit 1: `ModuleNotFoundError`; UI real não pôde ser importada/aberta.
- `python -m bambuprep` em Linux — exit 1 com “desktop interface requires Windows”, como esperado.
- Instalação PySide6 havia sido tentada antes e ficou parada por timeouts de PyPI; não houve retry nesta parte. Nenhuma fonte alternativa de runtime foi encontrada nesta execução.
- Commit parcial de código: `727811553b7c89b79c736a14d25d9a3a5614f513`. O helper de consentimento foi testado sem rede; o teste não comprova o comportamento de QMessageBox em Windows.

### Complemento — prévia das quatro vistas locais

- A janela agora tem abas para relatório, frente, lado, topo e riscos. Após a análise, um worker relê o STL local, compara o SHA-256 com o trabalho e renderiza as quatro vistas; a camada Qt só cria pixmaps/aplica widgets na thread principal.
- As imagens ficam em memória para apresentação e não são gravadas em histórico ou arquivos. A chamada OpenAI, se autorizada, ainda regenera suas vistas no serviço e usa a allowlist já testada.
- Fonte Qt oficial consultada para `QPixmap.loadFromData`, `QScrollArea.setWidget` e `QTimer`: https://doc.qt.io/qtforpython-6/PySide6/QtGui/QPixmap.html, https://doc.qt.io/qtforpython-6/PySide6/QtWidgets/QScrollArea.html, https://doc.qt.io/qtforpython-6/PySide6/QtCore/QTimer.html.
- Commit de código: `85e8488f521b4691e5ecaf8494afe034db206371` (`feat: display local mesh views in analysis window`). Ainda não foi possível importar/abrir a janela Qt porque PySide6 não está instalado; a implementação e a sequência worker/UI não têm QA visual real.

### Revalidação após os últimos ajustes

- `python -m pytest -v` — 105 passed; 1 aviso esperado da fixture de nome ZIP duplicado.
- `python -m compileall -q src tools tests` — exit 0.
- `git diff --check` — não executável neste espelho de workspace: não há diretório `.git` (exit 129); os commits/ref da branch foram verificados via GitHub API.
- Não houve execução real da UI, chamada de rede OpenAI ou prova Bambu Studio.

### Complemento — configurações seguras e limpeza do histórico

- Adicionado `SettingsDialog`: entrada da chave mascarada, salva somente no adaptador Credential Locker; o valor não é exibido depois de salvar. Quando o backend está indisponível, a UI desabilita os controles e a análise local continua, sem fallback em arquivo.
- Adicionado `WorkflowService.delete_history` e botão com confirmação explícita. Remove registros SQLite e limpa o trabalho atual da janela; informa que STL original e arquivos do usuário permanecem no disco.
- Teste de serviço verifica que um trabalho pode ser removido do histórico sem apagar/modificar o STL. Não há exclusão de arquivos de saída pela UI porque ainda não existe fluxo que produza esses arquivos.
- O import do pixmap foi alinhado à classe Qt oficial `PySide6.QtGui.QPixmap`; a API `loadFromData` foi conferida na documentação oficial citada acima.
- Commit de código: `0b5ee53beca11b1d5974a9f074abbbf8b214ab25` (`feat: add local key settings and history cleanup controls`).

### Evidência de testes desta extensão

- RED: `python -m pytest tests/unit/test_workflow_service.py -k delete_history -v` — falhou com AttributeError porque o método de serviço ainda não existia.
- GREEN focal: mesmo comando — 1 passed.
- `python -m pytest tests/unit/test_workflow_service.py tests/unit/test_ui_consent.py -v` — 11 passed.
- Suíte completa atual: `python -m pytest -v` — 106 passed; 1 aviso esperado do fixture ZIP com nome duplicado.
- `python -m compileall -q src tools tests` — exit 0.
- O módulo PySide6 continua ausente. Não foi possível importar, instanciar ou testar visualmente `QDialog/QMainWindow`; esses controles não estão marcados como verificados no plano. Nenhuma chamada OpenAI foi feita.

## Próxima execução

Continuar a Tarefa 6: persistir/editar o caminho do Studio localmente, cobrir o comportamento Qt e validar a janela/consentimento no Windows; adicionar exclusão de arquivos apenas quando houver arquivos do app com política explícita. A tela da chave e a remoção SQLite estão codificadas, mas toda a UI segue sem QA Qt porque PySide6 não está instalado. Depois continuar Tarefa 7 sem publicar. CLI, metadados Bambu e fatiamento permanecem bloqueados pela prova Windows real da Tarefa 1.

## Commits

- Tarefa 1: `e0009136d3695beed890e9148e68d0db72a33ab7` (`feat: add Bambu Studio CLI discovery foundation`).
- Tarefa 2: `262a130f821b6712492ed4980812ea7c6c89068f` (`feat: add local job storage and secure settings`).
- Tarefa 3: `4b3abcb630aaad079b057c93b6461828eee9cb3a` (`feat: add local STL analysis and repair`).
- Tarefa 4 código: `5804f78b456af1f69ed99f4dd799039360de5697` (`feat: add consented OpenAI recommendations`).
- Tarefa 5 catálogo sintético: `b5d4e50e0905961ac4b4f9f36006f7a69a10a6dd` (`feat: read installed A1 mini profile catalog`).
- Registro Tarefa 5: `e615dab40774cf9cada5ee3952725fa93441c565` (`docs: record local profile catalog verification`).
- Tarefa 6 serviço local: `2018baad38202eb90de80367d1701940a2137a35` (`feat: orchestrate local analysis and consented recommendations`).
- Tarefa 6 worker: `c4f32a210492ba8241fb5d0bdaa4f4ec1ec49688` (`feat: run workflow actions in bounded workers`).
- Inspetor 3MF genérico: `670324be82bd3820b921261ae1fe71511355b5df` (`feat: inspect local 3MF package structure`); registro: `6932a2bac3aba81b67f84615dcd63b8960ae32f3` (`docs: record generic 3MF inspection evidence`).
- UI parcial e consentimento: `727811553b7c89b79c736a14d25d9a3a5614f513` (`feat: add consent-gated local analysis window`); vistas locais: `85e8488f521b4691e5ecaf8494afe034db206371` (`feat: display local mesh views in analysis window`); registro parcial anterior: `0d93a835e4c4cd63752d3b10d8dc4106332dad7b` (`docs: record consent-gated UI progress and test evidence`).
- Controles locais de chave/histórico: `0b5ee53beca11b1d5974a9f074abbbf8b214ab25` (`feat: add local key settings and history cleanup controls`).
- Atualizações posteriores do plano/ledger seguem os commits de implementação.

## Bloqueios humanos indispensáveis

1. Em PC Windows suportado, executar o diagnóstico contra a instalação real e registrar versão/build, caminho e argumentos/versão efetivamente observados.
2. Disponibilizar no PC o STL Sentinel Busts de referência e criar o pequeno projeto de prova com A1 mini, bico confirmado, Generic PLA e Textured PEI.
3. Reabrir o 3MF no Bambu Studio e conferir Preview e perfis. Até essa confirmação, não declarar CLI compatível, fatiamento/3MF verificado nem `slicer_verified`.
4. Depois que a tela de configurações estiver pronta, cadastrar localmente uma chave OpenAI no Credential Locker e consentir separadamente por trabalho; até haver chave e consentimento explícito, manter mocks e não fazer chamadas reais.


