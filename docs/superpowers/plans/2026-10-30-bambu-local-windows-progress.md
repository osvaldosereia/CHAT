# BambuPrep local para Windows — ledger de implementação

## Estado atual — 2026-10-30

- Branch: `codex/bambu-a1-mini-foundation-20261029`
- HEAD registrado no ledger nas rodadas anteriores: `0a16670e83223892d1ace74790c790385f81a37c`.
- HEAD do branch antes desta atualização: `a0029435505302cfe5dbb0099bab90b65b076476`; implementação de build em `690ab902ff4d476c91858e9eed2d4fc571d1cf12`, interface Qt em `bd475e953334d54d9cb52ac6eaa94f4d3e585e1b` e checklist preliminar em `842ea830756974af09aa37ed6b384a7017a90bff`.
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

### Complemento — preferência local do Studio

- `LocalPreferencesStore` armazena em `%LOCALAPPDATA%/BambuPrep/preferences.json` somente o caminho absoluto do executável escolhido. JSON é limitado a 16 KiB, gravado por substituição atômica e rejeita symlink, caminhos relativos e campos extras (inclusive qualquer campo de chave).
- No próximo início, o seletor parte do caminho salvo; cancelar pode reutilizar o caminho salvo se o executável ainda existir. A pasta de perfis é lida ao lado do executável. Isso não consulta o CLI nem declara que a instalação seja compatível.
- Testes sintéticos verificam caminho persistido, ausência de campo de chave e rejeição de configuração com campo secreto/desconhecido.
- Commit: `0a16670e83223892d1ace74790c790385f81a37c` (`feat: remember the local Bambu Studio executable path`).

### Evidência desta extensão

- RED: `python -m pytest tests/unit/test_config.py -v` — coleta falhou porque `LocalPreferencesStore` ainda não existia.
- GREEN: mesmo comando — 5 passed.
- `python -m pytest tests/unit/test_config.py tests/unit/test_workflow_service.py tests/unit/test_ui_consent.py -v` — 16 passed.
- Suíte completa: `python -m pytest -v` — 108 passed; 1 aviso da fixture de nome ZIP duplicado.
- `python -m compileall -q src tools tests` — exit 0.
- Não houve chamada OpenAI, acesso a instalação Bambu real ou teste de interface Qt. PySide6 segue ausente neste ambiente.

## Próxima execução

A primeira etapa incompleta continua sendo a prova T1 em PC Windows com instalação real do Bambu Studio e o STL Sentinel. O fluxo Qt exige confirmação do bico/material/placa e tem testes offscreen locais, mas QA manual Windows continua pendente. A integração CLI/fatiamento/3MF permanece bloqueada por T1.

A build standalone após output-filename ainda não tem resultado Windows confirmado: os runs 41032000203, 41032383180 e 41032896496 falharam ao verificar o nome antigo; 41033836229 e 41034211145 seguiam in_progress com configuração anterior. O status do commit 690ab902ff4d476c91858e9eed2d4fc571d1cf12 retornou statuses=[], então o dry-run Linux é a única evidência da correção de nome até aqui. Nenhum pacote ou artefato foi publicado. A revisão final de licenças aguarda inspeção do bundle efetivo e decisão de distribuição.
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
- Controles locais de chave/histórico: `0b5ee53beca11b1d5974a9f074abbbf8b214ab25` (`feat: add local key settings and history cleanup controls`); ajuste de composição para injetar o key store: `054036846342503f70df47df4b4ed62d37b6733a` (`fix: pass secure key store to settings dialog`).
- Preferência local do Studio: `0a16670e83223892d1ace74790c790385f81a37c` (`feat: remember the local Bambu Studio executable path`).
- Atualizações posteriores do plano/ledger seguem os commits de implementação.

## Bloqueios humanos indispensáveis

1. Em PC Windows suportado, executar o diagnóstico contra a instalação real e registrar versão/build, caminho e argumentos/versão efetivamente observados.
2. Disponibilizar no PC o STL Sentinel Busts de referência e criar o pequeno projeto de prova com A1 mini, bico confirmado, Generic PLA e Textured PEI.
3. Reabrir o 3MF no Bambu Studio e conferir Preview e perfis. Até essa confirmação, não declarar CLI compatível, fatiamento/3MF verificado nem `slicer_verified`.
4. Validação real da OpenAI só se o usuário desejar: cadastrar chave individual no Credential Locker, definir orçamento/limite e consentir explicitamente por trabalho; até isso, manter mocks e não fazer chamadas reais.




## Continuação 2026-10-30 — preferência local de pasta de saída (Tarefa 6)

- O primeiro item incompleto do plano continua sendo a prova real da Tarefa 1; não há instalação/path/build do Bambu Studio real nem STL Sentinel nesta execução. A mudança abaixo não usa nem declara compatibilidade do Studio.
- LocalPreferences agora contém output_directory opcional. LocalPreferencesStore persiste apenas o caminho absoluto, preserva o caminho do executável do Studio, continua aceitando JSON anterior com apenas studio_executable e rejeita campos desconhecidos, caminhos relativos e campos de segredo.
- A tela de configurações permite escolher pasta local existente e exibe o caminho salvo. O texto informa que o fatiamento/3MF continua desabilitado e que a pasta não é usada enquanto a integração real estiver pendente. Nenhum arquivo é criado nela.
- O guia do usuário explica a preferência. Não foi chamada a OpenAI, não se usou STL/3MF privado e não houve escrita de chave, histórico ou imagem.
- Ruling: guardar a pasta preferida sem habilitar gravação — permite configurar uma escolha local agora sem inferir sintaxe/saída do Studio; a interface informa que a preferência está inativa até a prova T1 — custo se errado: a preferência pode parecer útil antes de produzir arquivos, e precisa permanecer explicitamente rotulada como inativa.

### TDD e comandos executados

Ambiente Linux x86_64, Python 3.12; Qt offscreen instalado pelo uv com dependências travadas.

- RED das preferências: python -m pytest tests/unit/test_config.py -q — 2 failed, 5 passed, como esperado: save_output_directory ainda não existia.
- GREEN das preferências: mesmo comando — 7 passed.
- RED da UI: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_qt_ui.py::test_settings_dialog_saves_output_directory_without_claiming_slicing_is_enabled -q — 1 failed, como esperado: o botão ainda não existia.
- GREEN focado da UI: mesmo comando — 1 passed.
- Qt: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_qt_ui.py -q — 8 passed.
- Suíte completa com PySide6: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q — 122 passed, 1 warning em 2.98s. O único aviso é o fixture sintético de nome duplicado ZIP em test_project_3mf.py; não há skips.
- Sintaxe: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests — exit 0.
- CI Windows anterior à extensão: run 41034211146 em 16efc3f, sucesso: 119 passed, 1 warning em 15.58s. Essa execução não inclui o seletor de pasta novo.
- Builds observados continuam pendentes: 41034211145, 41033836229, 41032896496, 41032383180, 41032000203; passo MSVC/standalone em execução, logs finais ainda não disponíveis e sem artefatos registrados para 41034211145.

### Commits desta extensão

- 90c190e88371d4a68e620182836f90ee7b99d9fa — test: cover local output directory preference (RED antes da implementação).
- c85ff097f7b8eb253cd8f1ed5175ba87557c4269 — feat: persist local output directory preference.
- b6c5320f8afc93d21edffb0c53c7653fbb972561 — test: cover local output directory settings (teste de UI RED).
- 1934aa161cb0d4ca6ce04a2b992f6d1e9ebfc64c — feat: select a local output directory.
- 5bcfcd0920a8171e402d1f57271d234fc609ec28 — docs: explain local output directory preference.
- ec364093989aee5e739270b35352d755adf314ec — docs: record verified BambuPrep UI and settings progress.


## Continuação 2026-10-30 — confirmação por trabalho do perfil (Tarefa 6)

- Adicionado checkbox com os IDs locais exatos do Generic PLA e da Textured PEI selecionados para o perfil. O usuário deve confirmar tanto bico físico quanto material/placa antes da análise; a lógica de _analyze também verifica ambas as confirmações, mesmo se o handler for chamado sem usar o botão.
- Ambas as confirmações são resetadas ao selecionar outro STL ou mudar o perfil. As listas vêm do catálogo aprovado; esta V1 segue com Generic PLA e Textured PEI da opção instalada, sem ler estado da impressora.
- Atualizado o guia de uso. A verificação não é QA manual de Windows, nem valida compatibilidade do Studio.
- TDD: a primeira falha mostrou ausência do controle material_plate_confirm; após adicionar a UI, uma segunda falha mostrou que _analyze ainda submetia a operação sem a confirmação de material/placa. A guarda do método resolveu a regressão.
- Comando RED: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_qt_ui.py::test_nozzle_and_material_plate_confirmation_reset_after_job_or_profile_change -q — 1 failed porque material_plate_confirm ainda não existia.
- RED da guarda: mesmo teste — 1 failed porque _submit foi chamado sem a confirmação dos perfis.
- GREEN: mesmo teste — 1 passed.
- Qt após mudança: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_qt_ui.py -q — 8 passed.
- Suíte completa: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q — 122 passed, 1 warning do fixture sintético ZIP duplicado; nenhum skip.
- Sintaxe: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests — exit 0.
- Commits: f8ed1b25a694673d5c8b1799624c84b530833f1a (teste), bd475e953334d54d9cb52ac6eaa94f4d3e585e1b (interface), 65255284e3db58d7def5f8ba4d4fdd41f970b974 (guia), 081378b1d999bd3b4f63a971fe59d322af9a8719 (plano).

## Continuação 2026-10-30 — nome do executável standalone (Tarefa 7)

- O run Windows 41032383180 concluiu a compilação Nuitka: gerou src/bambuprep/deployment/desktop_entry.dist/desktop_entry.exe e o deploy informou a pasta dist/BambuPrep.dist. O job falhou depois porque a verificação procurava dist/BambuPrep.dist/BambuPrep.exe. O run 41032000203 mostrou a mesma causa.
- Root cause: pysidedeploy.spec aponta para desktop_entry.py; em standalone, o título BambuPrep nomeia a pasta .dist, mas o Nuitka usava o nome do módulo de entrada para o executável. Documentação consultada: Qt for Python deploy tool https://doc.qt.io/qtforpython-6/deployment/deployment-pyside6-deploy.html e Nuitka User Manual https://nuitka.net/user-documentation/user-manual.html.
- Correção: extra_args inclui --output-filename=BambuPrep.exe, preservando o título/pasta e alinhando com o caminho esperado pela verificação.
- RED: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_deployment_config.py::test_deployment_spec_selects_standalone_entrypoint_and_noninteractive_downloads -q — 1 failed: faltava --output-filename.
- GREEN: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_deployment_config.py -q — 4 passed.
- Dry-run: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-build-env uv run --locked --extra build pyside6-deploy -c pysidedeploy.spec --force --mode standalone --dry-run — exit 0; comando gerado inclui --output-filename=BambuPrep.exe e executável de entrada desktop_entry.py. Isso é apenas dry-run Linux, sem compilação Windows após a correção.
- Suíte final da extensão: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q — 122 passed, 1 warning.
- Sintaxe: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests — exit 0.
- Commits: acd47cfafcd77fcefa2ed55ea52558b43d67641d (teste), 690ab902ff4d476c91858e9eed2d4fc571d1cf12 (configuração), be57eb4958dd1da3fdde641a9d0e6142fbf96857 (plano).



## Continuação 2026-10-30 — inventário inicial de licenças

- Criado docs/operations/release-checklist.md com metadados preliminares do ambiente build travado, separação de Nuitka (build-only) e gates para inspecionar bundle, componentes Qt, avisos e licenças antes de qualquer distribuição. A tarefa de revisão final continua aberta.
- Comando de coleta executado: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-build-env uv run --locked --extra build python - (script de importlib.metadata.distributions que imprime Name, Version, License-Expression, License e classifiers de licença).
- Resultado representativo observado: PySide6/Essentials/Addons/shiboken6 6.12.0 indicam LGPL-3.0-only OR GPL-2.0-only OR GPL-3.0-only; Nuitka 4.3.1 declara GNU AGPLv3; trimesh e fast_simplification MIT; NumPy 2.5.4 combina BSD-3-Clause/0BSD/MIT/Zlib/CC0; Matplotlib 3.11.2 registra PSF License. O ambiente também contém dependências transitivas listadas no lock.
- Limite: metadados de wheels não mostram quais módulos/DLLs/plugins/fontes entram no bundle final nem substituem revisão das licenças e avisos efetivamente distribuídos. Nenhuma conclusão de conformidade foi feita, nenhuma publicação foi executada.
- Commits: 842ea830756974af09aa37ed6b384a7017a90bff (checklist), a0029435505302cfe5dbb0099bab90b65b076476 (subtarefa do plano).


### Rechecagem dos builds Windows — após a correção de nome

- O run 41036004359, commit 690ab902ff4d476c91858e9eed2d4fc571d1cf12, concluiu com sucesso em GitHub Actions sobre Windows Server 2025, Python 3.12 e Nuitka 4.3.1. O log registra `Nuitka: Successfully created .../desktop_entry.dist/BambuPrep.exe`, `[DEPLOY] Executed file created in .../dist/BambuPrep.dist` e a mensagem final `Standalone bundle exists and contains no STL, 3MF, database, or log files.` A etapa percorreu .stl, .3mf, .sqlite, .sqlite3, .db e .log no diretório de saída e não encontrou arquivos. Nenhum artefato foi anexado ao run; o conteúdo não foi examinado para chave OpenAI/API secrets nem licenças.
- Isso comprova somente a compilação standalone do commit 690ab no runner Windows Server 2025. Não comprova instalação/abertura em Windows 10/11 de usuário, compatibilidade com Bambu Studio ou revisão de 3MF.
- O run 41039402618 para o commit a73449870c9e7b36cd8eb2fab14ec35e43ab9594 (testes Windows/Qt) concluiu success. No momento deste registro, seu build 41039402633 continuava in_progress.
- O run 41039634785 para o commit c2ee0338f2183b596ead7f86cc8f3f796a8946b6 concluiu success: log confirma 124 passed, 1 warning em 13.10s. O build 41039634894 desse commit continuava in_progress às 10:18 UTC.
- Os builds anteriores 41032000203, 41032383180, 41032896496, 41033836229 e 41034211145 usaram configuração anterior à correção e não comprovam o nome corrigido.

## Continuação 2026-10-30 — estado de erro e progresso visível da Tarefa 6

- A primeira etapa incompleta do plano segue sendo a prova da Tarefa 1 em um PC Windows suportado com Bambu Studio instalado e o STL Sentinel local.
- `WorkflowService.get_job` expõe o registro SQLite mais recente. Em falha de worker, a janela atualiza o estado persistido e mostra a exceção, o estado (por exemplo `blocked`) e uma ação de recuperação; se a leitura falhar, informa que mostra apenas o último estado conhecido. Trabalhos `blocked`/`failed` não oferecem botão de análise que o serviço recusaria.
- A janela exibe barra indeterminada acessível enquanto a tarefa local roda e a oculta quando termina. Não estima uma porcentagem que o serviço não fornece.
- TDD da mensagem de erro: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_qt_ui.py::test_error_dialog_reports_persisted_state_and_recovery_action -q` — RED: 1 failed porque a janela ainda mantinha `uploaded` enquanto o banco já registrava `blocked`; GREEN: 1 passed.
- TDD da barra: mesmo padrão de ambiente, alvo `tests/unit/test_qt_ui.py::test_window_shows_indeterminate_progress_only_while_work_is_running -q` — RED: 1 failed por ausência do controle; GREEN: 1 passed.
- Suíte local final após as duas alterações: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q` — 124 passed, 1 warning de fixture sintética com entrada ZIP duplicada em 7.15s. `... python -m compileall -q src tools tests` — exit 0. Verificação de whitespace — `trailing whitespace: []`.
- CI Windows/Qt para o commit c2ee0338f2183b596ead7f86cc8f3f796a8946b6 — run 41039634785 success, 124 passed, 1 warning em 13.10s.
- Commits de código: a73449870c9e7b36cd8eb2fab14ec35e43ab9594 (estado de erro), c2ee0338f2183b596ead7f86cc8f3f796a8946b6 (indicador de progresso).

### Pendências humanas consolidadas

1. Em Windows 10 22H2 x64 ou Windows 11 x64 com Bambu Studio realmente instalado, executar `tools/bambu_cli_probe.py` e registrar versão/build, caminho e comandos/argumentos confirmados.
2. Disponibilizar somente no PC Windows o STL Sentinel Busts de referência; criar projeto pequeno com A1 mini, bico fisicamente confirmado, Generic PLA e Textured PEI; fatiar sem imprimir, reabrir no Studio e conferir Preview/perfis. Isso mantém T1/T3/T5 bloqueadas até evidência e revisão.
3. Fazer QA manual da janela e, quando houver bundle disponível, instalar/abrir a aplicação em Windows 10 e Windows 11. O build de Actions não foi anexado como artifact; o usuário não precisa compartilhar STL/3MF no GitHub.
4. Se quiser validar a API real, configurar a chave individual no Credential Locker, definir limite/orçamento e dar consentimento explícito por trabalho. Até isso ocorrer, os testes permanecem em mocks e não há chamadas reais.

- Sem confirmação no Studio não afirmar compatibilidade CLI, fatiamento/3MF verificado, revisão do projeto ou impressão física validada. Sem inspecionar o bundle efetivo, a lista de licenças/avisos e a licença final do BambuPrep continuam pendentes.


## Continuação 2026-10-30 — auditoria do bundle standalone (Tarefa 7)

- Criado `bambuprep.bundle_audit` e o comando `tools/audit_standalone_bundle.py`. O relatório contém só o nome da pasta do bundle, paths relativos, tamanhos e SHA-256; não imprime caminhos absolutos. A auditoria exige `BambuPrep.exe` não vazio, bloqueia extensões de STL/3MF/histórico/chaves locais e detecta token com formato OpenAI `sk-` no conteúdo, sem revelar filename nem token quando falha.
- O workflow Windows agora invoca essa auditoria depois do build. O inventário será exibido somente nos logs do job; o workflow continua sem upload de artifact, sem secrets e sem publicação.
- TDD RED: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_bundle_audit.py -q` — exit 2 na coleta: `bambuprep.bundle_audit` ainda não existia.
- GREEN focal: mesmo comando após implementação — 10 passed em 0.12s. Os testes cobrem saída relativa/hashes, executável ausente/vazio, STL/3MF/SQLite-WAL/PEM/.env, token sintético em binário e fronteira de chunks, e CLI subprocesso sem caminho absoluto.
- Suíte final: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q` — 134 passed, 1 warning de ZIP duplicado sintético em 2.86s.
- `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests` — exit 0. Auditoria de whitespace local — `trailing whitespace: []`.
- Commit de código: `106465fd2fb91c10fd201c0e59c59b7e2bae750f`.
- CI para esse commit está pendente na captura: Windows standalone run 41046396800 e Windows tests run 41046396825, ambos `in_progress`. O build anterior do commit `c2ee0338` passou (run 41039634894), criou `BambuPrep.exe` no caminho esperado e o workflow relatou ausência de STL/3MF/database/log; nenhum artifact foi anexado (`artifacts: []`). A auditoria nova ainda não foi exercitada em Windows.
- Não foram usados STL/3MF privados nem chave real, e nenhuma chamada OpenAI foi feita. A primeira pendência do plano permanece a prova real da Tarefa 1; não há instalação Windows do usuário, versão real do Studio, nem STL Sentinel local.


### Atualização CI após commit 106465fd (2026-10-30)

- Windows unit/Qt run 41046396825 no commit 106465fd2fb91c10fd201c0e59c59b7e2bae750f concluiu success; log final: 134 passed, 1 warning em 24.55s.
- Windows standalone build run 41046396800 do mesmo commit ainda estava in_progress às 11:14 UTC; a nova auditoria de bundle ainda não tem resultado Windows observado.


## Continuação 2026-10-30 — gate de revisão do 3MF e auditoria Windows

- A primeira etapa incompleta continua sendo a prova real da Tarefa 1: nenhuma instalação Windows de usuário com Bambu Studio nem o STL Sentinel estão disponíveis neste ambiente Linux. O runner Windows Server 2025 do GitHub Actions não comprova CLI do Studio, fatiamento, 3MF Bambu ou revisão manual.
- A auditoria standalone do run 41046396800 (commit 106465fd2fb91c10fd201c0e59c59b7e2bae750f) concluiu success em Windows Server 2025. O log registra `BambuPrep.exe` no bundle `BambuPrep.dist` (63.209.984 bytes; SHA-256 772154dce5d9c5239de1bd5da41c5132ba56e02fd781080927a79c779070b777), inventário relativo de 922 arquivos e 209.267.185 bytes totais. A auditoria bloqueia extensões de dados locais/credenciais e tokens com formato OpenAI `sk-`; o sucesso indica que nenhum item coberto foi encontrado. Nenhum artifact foi anexado. Isso não é uma inspeção de licença nem instalação em Windows 10/11 do usuário.
- TDD da guarda de revisão: primeiro RED focal terminou com exit 2 na coleta, pois `StudioReviewConfirmation` ainda não existia. Após a implementação, os testes focais de transição/armazenamento passaram (17 passed); novas asserções de ausência de 3MF e integridade foram incluídas antes da suíte final.
- A camada de domínio e o repositório agora exigem confirmação por trabalho para chegar a `slicer_verified`: 3MF local existente, extensão .3mf, pacote estrutural genérico válido, hash do arquivo igual ao revisado, setup de impressora/bico/material/placa correspondente à seleção analisada e confirmações explícitas de abertura no Studio, máquina, bico, filamento, placa, suportes e Preview. Hash/configuração divergente ou arquivo inválido deixam o estado inalterado. Os testes usam somente um 3MF sintético e versão/confirmações fictícias; a UI ainda não possui fluxo de saída/revisão e esta guarda não habilita nem prova a integração real com Bambu Studio.
- Verificação local final, após as últimas alterações: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q` — 143 passed, 1 aviso esperado da fixture sintética ZIP duplicada, em 4.93s. `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests` — exit 0. Checagem Python de trailing whitespace — `trailing whitespace: []`.
- Commit de código/testes: 4054ee9cafc2541181d66f137f96a6c5ba997875. Windows unit/Qt run 41054439811 concluiu success em Windows Server 2025, Python 3.12.10: 143 passed, 1 warning, em 15.78s. Windows standalone build run 41054439734 ainda estava in_progress às 12:20:22 UTC; a auditoria atual do bundle aguarda esse job.
- Não houve chamada OpenAI, chave real, uso de STL/3MF do usuário, impressão, artifact upload, merge, release ou publicação. A checklist de licenças e a validação real continuam pendentes.


## Atualização de build Windows — commit 4054ee9 (2026-10-30)

- Windows standalone run 41054439734 concluiu success às 12:45:55 UTC em Windows Server 2025. O log confirma a criação de `src/bambuprep/deployment/desktop_entry.dist/BambuPrep.exe` e a cópia para `dist/BambuPrep.dist`; a auditoria também passou.
- Inventário do bundle: 922 arquivos, 209.397.745 bytes; `BambuPrep.exe` tem 63.340.544 bytes, SHA-256 `370eb9778049650ab50af14fe2a52863a908f21156a71ce815fcb8866b47f691`. O resumo não contém caminho absoluto; nenhum artifact foi anexado.
- A suíte Windows run 41054439811 concluiu success: 143 passed, 1 warning, 15.78s. Local: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q` — 143 passed, 1 warning; `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests` — exit 0; whitespace: `trailing whitespace: []`.
- T7 build e auditoria de arquivos/segredos estão verificados para o commit 4054ee9. O mapa de licenças do conteúdo compilado e a licença/NOTICE do projeto continuam abertos. T1 continua a primeira pendência geral, dependente da instalação real do Bambu Studio e do STL Sentinel no Windows do usuário.
- Nenhuma chamada OpenAI, chave real, arquivo privado, impressão, publicação ou artifact upload.

## Continuação 2026-10-30 — inventário de licenças no build (Tarefa 7, CI pendente)

- A primeira etapa incompleta do plano continua sendo T1, linha 83: executar tools/bambu_cli_probe.py em um Windows suportado com Bambu Studio realmente instalado. Este ambiente não fornece a instalação do usuário, versão/build, nem o STL Sentinel local; T1/T3 e a integração de T5 continuam bloqueadas. Nenhuma compatibilidade ou revisão de 3MF foi afirmada.
- A Tarefa 7 ganhou um inventário de distribuições do Nuitka: pysidedeploy.spec solicita o XML de compilação e o template estável LicenseReport; tools/summarize_nuitka_report.py valida os relatórios, compara nome/versão com uv.lock e imprime somente resumo compacto. Metadados longos de licença são limitados a 240 caracteres no log e recebem license_truncated: true; o texto integral não é enviado ao log. Os relatórios completos ficam em build-reports/, ignorado pelo Git.
- O workflow Windows copia o LicenseReport completo para dist/BambuPrep.dist/THIRD_PARTY_NOTICES.rst e depois audita o bundle. As regras .gitignore existentes foram preservadas; foi acrescentada somente a exclusão da pasta build-reports/.
- Referência: manual oficial do Nuitka descreve LicenseReport como distribuições usadas na compilação com textos de licença. Isso não demonstra, sozinho, todas as licenças de DLLs/plugins/dados nativos e não é uma SBOM completa nem revisão jurídica: https://nuitka.net/user-documentation/user-manual.html
- TDD observado: primeiro o teste para relatório longo falhou com KeyError: license_truncated; após a implementação, UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_nuitka_license_report.py tests/unit/test_deployment_config.py -q — 10 passed. O teste de cópia do aviso falhou antes da mudança do workflow por ausência da instrução; após adicionar a cópia e ajustar o teste para a variável $notices real, UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_deployment_config.py -q — 4 passed.
- Verificação local final: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q — 149 passed, 1 aviso da fixture ZIP duplicada sintética, em 2.78s. UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests — exit 0. Checagem Python de whitespace — trailing whitespace: [].
- Dry-run: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-build-env uv run --locked --extra build pyside6-deploy -c pysidedeploy.spec --force --mode standalone --dry-run — exit 0; comando gerado inclui --report=build-reports/bambuprep-compilation-report.xml e --report-template=LicenseReport:build-reports/bambuprep-license-report.rst. Os avisos de configuração PySide6 sem seção qt e sem project file já eram emitidos pelo ambiente e o dry-run não compilou o app.
- Windows CI: run 41062054043 (commit 1fb295f75ddabc19a7399bb1ad69c9657cfc83cd) passou; build 41062054060 ainda estava em andamento. Run 41062268843 (commit b4e6bf7adc274c64fc73e938b6610c50267da6d6) passou em Windows Server 2025/Python 3.12.10: 149 passed, 1 aviso, 15.67s. Build 41062268771 continuava em andamento no passo MSVC/Nuitka; não declarar o relatório nem o arquivo de avisos validados até o job terminar e seus logs serem examinados.
- Commits desta extensão: 1fb295f75ddabc19a7399bb1ad69c9657cfc83cd (resumo lock-checked e relatório limitado); b4e6bf7adc274c64fc73e938b6610c50267da6d6 (cópia de THIRD_PARTY_NOTICES.rst no bundle e teste de workflow).
- Sem chamada OpenAI, chave real, STL/3MF do usuário, upload de artifact, publicação, release, merge ou impressão. Os checkboxes do plano e da checklist legal permanecem como estavam: T1 sem evidência real e revisão integral de licenças ainda pendente.

## Continuação 2026-10-30 — instruções de conferência manual na interface

- Acrescentei ao relatório local uma seção de preparação manual do Bambu Studio: IDs selecionados de máquina, bico, processo local padrão, filamento e placa. Sem recomendação consentida, suportes/aderência são mostrados como decisões a conferir; com recomendação validada, os valores sugeridos também aparecem. O texto pede revisão de máquina/bico/material/placa/suportes/Preview e informa que não há 3MF gerado nem fatiamento verificado.
- A seção usa somente o catálogo local e não chama o CLI, não altera o STL e não inicia impressão. Testes utilizam perfil/recomendação sintéticos; não comprovam compatibilidade de presets nem equivalência com uma instalação Bambu Studio.
- TDD RED: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_qt_ui.py::test_report_shows_manual_studio_values_and_keeps_slicing_unverified -q — 1 failed como esperado, porque _refresh_report_view ainda não existia. GREEN focal — mesmo comando: 1 passed. Suite Qt — UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_qt_ui.py -q — 11 passed.
- Verificação local após a alteração: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q — 150 passed, 1 aviso da fixture ZIP duplicada sintética, em 3.28s; UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests — exit 0; whitespace: trailing whitespace: [].
- Commit: badd007adf0a3b36608d0758fe4cc115eac3c001. Windows unit/Qt run 41063454867 e standalone build run 41063451363 estavam em andamento; verificar ambos antes de atualizar caixas do plano.
- T5, item de fallback (linha 186), permanece aberto: a interface agora mostra a checklist após análise, mas ainda não existe execução do CLI para rotear uma falha real até esse caminho, nem implementação de fatiamento/liberação de projeto. O estado permanece aquele persistido pelo fluxo validado; não foi marcado project_configured/slicer_verified.
- Não houve chamada OpenAI, chave real, STL/3MF privado, build artifact, publicação, release, merge ou impressão.

### Windows verification of manual review guidance (2026-10-30)

- Windows unit/Qt run 41063454867, commit badd007adf0a3b36608d0758fe4cc115eac3c001, concluded success on Windows Server 2025 / Python 3.12.10: 150 passed, 1 expected synthetic duplicate-ZIP warning, 13.78s. This includes the manual Studio checklist UI test; it does not exercise or prove CLI slicing, generated 3MF, or real profile compatibility.
- At this update, standalone build runs 41062054060 (commit 1fb295f), 41062268771 (commit b4e6bf7, including THIRD_PARTY_NOTICES.rst), and 41063451363 (commit badd007) were still in the MSVC/Nuitka step. Their report parsing and bundle contents remain unverified until successful completion and log review.


## Continuação 2026-10-30 — correção de encoding do relatório Nuitka

- Primeira etapa pendente do plano: T1, executar `tools/bambu_cli_probe.py` em Windows suportado com Bambu Studio realmente instalado. Nenhuma instalação/versão/build do Studio ou STL Sentinel foi disponibilizada a este ambiente; T1/T2 e prova real do slicer seguem bloqueadas. Não foi alterado nenhum checkbox do plano.
- Diagnóstico dos builds 41062054060, 41062268771 e 41063451363: o Nuitka 4.3.1 criou o executável e escreveu os dois relatórios, mas o resumo falhou em `A Nuitka report file could not be read.`; a auditoria subsequente não executou. Revisão da implementação oficial indica que `Reports.py` escreve o XML explicitamente em UTF-8, enquanto `LicenseReport` chama `putTextFileContents` sem encoding, e `FileOperations.py` encaminha o encoding nulo a `io.open`, que no Windows usa a codificação local. Links de código da versão examinada: https://github.com/Nuitka/Nuitka/blob/4.3.1/nuitka/reports/Reports.py e https://github.com/Nuitka/Nuitka/blob/4.3.1/nuitka/utils/FileOperations.py . A causa explica o erro, mas aguarda confirmação no próximo build Windows após a correção.
- TDD da leitura CP1252: o teste sintético com texto não ASCII falhou com o leitor antigo; após ler `LicenseReport` usando `locale.getpreferredencoding(False)` e manter XML/`uv.lock` em UTF-8, o conjunto focal passou (7 testes). Mensagens de erro continuam sem revelar caminhos locais.
- TDD do workflow: o teste de filtro de caminhos falhou porque `tools/**` não acionava o workflow; após incluir o padrão, o conjunto focal passou (4 testes). Isso garante que futuras mudanças no resumidor acionem o build Windows.
- Verificação local executada neste registro: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q` — 151 passed, 1 aviso esperado de ZIP duplicado sintético, em 7.37s. `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests` — exit 0.
- CI Windows para o commit 8b3916bc7d7f252765f29cde393c2e058a3e711a (correção do encoding): run 41069604648 passou, 151 testes, 1 aviso esperado, Python 3.12.10. Para o HEAD 88cf03276e7681ff8d854cce7932d28ceb2ced10: Windows/Qt run 41069734704 passou, 151 testes, 1 aviso em 17.59s. O standalone build 41069735042 estava `in_progress` no passo MSVC/Nuitka às 14:14 UTC; artefatos listados: nenhum. Não declarar ainda o parsing real ou a cópia de `THIRD_PARTY_NOTICES.rst` verificados no bundle.
- Commits: 8b3916bc7d7f252765f29cde393c2e058a3e711a (`fix: read Nuitka license report with platform encoding`); 88cf03276e7681ff8d854cce7932d28ceb2ced10 (`ci: build on tooling changes`).
- Sem chamada OpenAI, chave real, arquivo privado, upload de artifact, merge, release, publicação ou impressão.


## Continuação 2026-10-30 — resumo de licenças a partir do XML Nuitka

- A primeira etapa incompleta do plano permanece T1, linha 83: executar `tools/bambu_cli_probe.py` numa instalação Windows suportada com Bambu Studio real. Nenhuma instalação/versão/build do Studio ou STL Sentinel está disponível neste ambiente. Não há prova de compatibilidade, fatiamento ou 3MF revisado; checkboxes do plano permanecem inalterados.
- Diagnóstico do build Windows run 41069735042 (commit 88cf03276e7681ff8d854cce7932d28ceb2ced10): Nuitka criou `BambuPrep.exe` e escreveu ambos os relatórios; o resumo terminou com `Nuitka license report has an unsupported or incomplete format.` antes da auditoria de bundle. O XML enumera distribuições com nome/versão. No Nuitka 4.3.1, `getDistributionLicense` devolve `distribution.metadata["License"]` sem normalizar quebras de linha, e `LicenseReport.rst.j2` o interpola diretamente em `under license "...".`; o parser local aceitava somente uma linha. Uma leitura dos metadados instalados pelo lock confirmou campos License multilinha para matplotlib (64.419 caracteres), cycler, kiwisolver e trimesh; o log desse build confirma dados de matplotlib e trimesh incluídos. O run não revelou o conteúdo do relatório, então a confirmação final do reparo aguarda o próximo build Windows.
- Correção: o resumo não tenta mais analisar texto RST livre. Ele tira nomes/versões do elemento `distributions` do XML de compilação e obtém License/classifier do metadado da distribuição instalada correspondente; limita o texto do log a 240 caracteres e continua comparando todas as distribuições compiladas com `uv.lock`. O RST integral continua obrigatório no build e é copiado a `THIRD_PARTY_NOTICES.rst`; seu conteúdo não é impresso no log. A saída dos erros não inclui caminhos locais.
- TDD observado: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_nuitka_license_report.py -q` — RED: 5 failed (o resumo não aceitava o novo contrato; o caso de CLI também reproduziu a rejeição RST). Após a implementação, o mesmo comando — GREEN: 5 passed. A fixture de regressão escreve metadados .dist-info reais com licença multilinha.
- Verificação local: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q` — 149 passed, 1 aviso da fixture ZIP duplicada sintética, em 9.90s. `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests` — exit 0. A contagem da suíte mudou porque os testes do parser RST foram substituídos por casos da origem estável XML/metadata; a suíte permaneceu verde.
- Commit de código/testes: 5df08bfe70f7de031ff7d309effb2efbe527787f (`fix: inventory Nuitka licenses from installed metadata`). Runs disparados para esse commit: Windows standalone build 41078547742 e Windows unit/Qt 41078547798, ambos `in_progress` na consulta atual. O build anterior falhou e nenhum artifact foi criado/anexado.
- Sem chamada OpenAI, chave real, STL/3MF privado, upload de artifact, merge, release, publicação ou impressão.


### CI Windows — código 5df08bf (2026-10-30)

- Windows unit/Qt run 41078547798 concluiu success em Windows Server 2025 / Python 3.12.10: 149 passed, 1 aviso esperado de fixture ZIP duplicada, 15.31s.
- Windows standalone build run 41078547742 segue `in_progress` no passo MSVC/Nuitka na consulta das 15:13 UTC. A validação do XML/report no Windows e a auditoria do bundle ainda aguardam o job. Nenhum artifact foi anexado.
- O run de teste não valida Bambu Studio, CLI, slicing ou 3MF real. T1 permanece a primeira etapa incompleta; nenhuma caixa do plano foi alterada.


### Continuação — inventário e deduplicação (2026-10-30)

- O inventário sintético do ambiente `uv sync --locked --extra build` mostrou duas entradas metadata para o pacote editável BambuPrep. Um teste de regressão confirmou que o parser inicialmente rejeitava entradas XML repetidas com o mesmo nome/versão (RED: 1 failed). Após deduplicar pares normalizados idênticos, o conjunto focal `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_nuitka_license_report.py -q` passou: 6 passed.
- Verificação adicional executada: gerando XML sintético com as distribuições instaladas únicas e comparando com o lock, o resumo reportou `distribution_count=33`, `all_distributions_locked=True` e 4 licenças truncadas; somente nomes/contagens foram exibidos.
- Suíte local depois da deduplicação: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q` — 150 passed, 1 aviso esperado da fixture ZIP duplicada sintética, 4.65s. `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests` — exit 0.
- Commit adicional: dce437f17d796424b29fb738a29c6c70fb83f5ad (`fix: deduplicate Nuitka distribution inventory entries`). HEAD verificado em dce437f.
- Windows standalone build 41078547742 para o código 5df08bf permanecia `in_progress`; os workflows novos de 41079092993 (build) e 41079092872 (unit/Qt), para dce437f, estavam `queued` na consulta atual. Nenhum artifact foi anexado. Nenhuma caixa do plano ou checklist legal foi alterada; o build Windows real do resumidor continua pendente.
- A prova T1 do Bambu Studio permanece bloqueada pela ausência da instalação Windows do usuário e do STL Sentinel. Sem alegação de compatibilidade CLI/fatiamento/3MF. Sem chamada OpenAI, arquivos privados, impressão, release ou publicação.


### CI Windows — deduplicação do inventário (2026-10-30)

- Windows unit/Qt run 41079092872 para dce437f17d796424b29fb738a29c6c70fb83f5ad concluiu success em Windows Server 2025 / Python 3.12.10: 150 passed, 1 aviso esperado da fixture ZIP duplicada sintética, 16.13s.
- O build standalone 41079092993 desse commit permanece `in_progress`; o run 41078547742 para 5df08bf também continua em andamento. A validação real dos relatórios Nuitka e da auditoria do bundle ainda não foi observada. Sem alteração de checkboxes.


## Continuação 2026-10-30 — completude dos metadados de licença

- A primeira etapa do plano ainda incompleta continua sendo a prova real T1 em Windows com Bambu Studio instalado. Esta execução não tem instalação/build/caminho reais do Studio nem o STL Sentinel; não há validação de CLI, fatiamento, 3MF Bambu ou impressão. Os checkboxes do plano permanecem inalterados.
- O build anterior 41079092993 concluiu no Windows, e seu log exibiu 28 distribuições compiladas, todas correspondentes ao `uv.lock`, 4 textos truncados e 11 entradas sem texto de licença disponível nos campos então lidos. A auditoria gerou inventário relativo de 923 arquivos (209.508.517 bytes), incluiu `THIRD_PARTY_NOTICES.rst` e `BambuPrep.exe` (63.346.688 bytes, SHA-256 `3bf2403b5f8476611101d60791eaf3b4c682792eb3bfba9f49e8a486dc99731a`); nenhum STL/3MF de usuário, histórico, credencial ou artifact transferível apareceu no inventário. O sucesso do job é evidência do build e da auditoria automatizada neste runner, não da instalação manual do pacote ou da revisão jurídica.
- Extensão TDD no resumidor: agora prioriza `License-Expression` de Core Metadata 2.4 e mantém `License`/classifier como fallbacks; adiciona `license_metadata_complete` e `license_metadata_missing_count`, sem confundir ausência de expressão/licença com divergência de versão no lock. O log Windows do build anterior não prova este código novo; foi disparado novo runner.
- TDD observado: teste novo para `License-Expression` e teste novo para contagem explícita de licenças ausentes. RED: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_nuitka_license_report.py -q` — 2 failed, 6 passed; ambas as falhas foram ausência dos campos/expressão. GREEN: mesmo comando — 8 passed.
- Verificação local: suíte completa `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q` — 152 passed, 1 aviso esperado da fixture ZIP duplicada, 7.96s. `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests` — exit 0.
- Checagem sintética no ambiente de build: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-build-env uv run --locked --extra build python - <<'PY' ...` gerou XML apenas das distribuições instaladas e resumiu 33 distribuições; `all_distributions_locked=true`, `license_metadata_complete=true`, `license_metadata_missing_count=0`. Essa entrada é sintética, não o relatório final de uma distribuição Windows.
- Commit de código/testes: `7c8471e51337d3e52756d6144f12ad2ab77e4926` (`fix: report missing license metadata in Nuitka inventory`). Windows/Qt run 41087845847 concluiu success em Windows Server 2025 / Python 3.12.10: 152 passed, 1 aviso esperado, 14.30s. Standalone run 41087845821 ainda está in_progress na etapa MSVC/Nuitka após sincronizar dependências travadas; a confirmação Windows do novo resumo/auditoria está pendente.
- Nenhum checkbox da Tarefa 7 foi marcado com base no run anterior: os metadados de licença estavam incompletos e a revisão de licença continua aberta. Nenhum artifact foi publicado/anexado; não houve chamada OpenAI, chave real, arquivo privado, merge, release, publicação ou impressão.


## Continuação 2026-10-30 — erros de descompressão no inspetor 3MF

- HEAD antes deste registro: `18d4243dfb07d063be3ce2e87a75f575c1c32a14`, branch `codex/bambu-a1-mini-foundation-20261029`.
- Primeiro item incompleto do plano segue a Tarefa 1, linha 83: executar `tools/bambu_cli_probe.py` num Windows suportado com Bambu Studio realmente instalado e registrar versão/build, CLI e perfis. Esta execução não tem acesso a essa instalação nem ao STL Sentinel local. A prova de projeto/reabertura no Studio da linha 84, a validação do STL Sentinel na linha 136, a Tarefa 5 gated, e revisão/instalação manual da UI continuam bloqueadas por essa evidência humana. Nenhum checkbox do plano foi alterado; não se declara compatibilidade de CLI, fatiamento, 3MF Bambu ou impressão.
- Revisão do parser genérico de 3MF encontrou uma falha reproduzível: quando um membro ZIP DEFLATE alheio às partes essenciais tem bytes comprimidos corrompidos, `ZipExtFile.read` levanta `zlib.error`, que escapava de `inspect_3mf` em vez de se transformar no erro do domínio. Um fixture sintético, sem dados do usuário, reproduziu `error: Error -3 while decompressing data: invalid block type`.
- TDD RED: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_project_3mf.py::test_inspector_reports_corrupt_deflate_stream_as_project_error -q` — 1 failed conforme esperado; a exceção observada foi `zlib.error`.
- Correção: o inspetor agora captura `zlib.error` no mesmo limite de sanitização que os erros ZIP existentes e levanta `Project3MFError` com tipo de erro, sem exibir conteúdo do arquivo. Foi acrescentado teste que corrompe o primeiro byte DEFLATE de um membro sintético; a estrutura genérica ZIP/3MF continua sem afirmar suporte a metadados ou perfis Bambu.
- GREEN focal: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_project_3mf.py -q` — 9 passed, 1 aviso esperado da fixture de nomes ZIP duplicados.
- Suíte completa após a correção: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q` — 161 passed, 1 aviso esperado da fixture ZIP duplicada, 5.31s. Antes da mudança, a suíte era 160 passed, 1 aviso, 8.82s.
- Sintaxe: `UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests` — exit 0.
- Commit: `18d4243dfb07d063be3ce2e87a75f575c1c32a14` (`fix: normalize corrupted 3MF compression errors`), descendente direto de `01bc2c1890d384fc2e95d1317f69c3c1071b3c8d`; update da ref confirmado com expected SHA. O commit contém apenas o tratamento de `zlib.error` e o teste sintético.
- Evidência Windows anterior do código-base: run de testes 41096415629 no commit 1176f9b concluiu sucesso em Windows Server 2025 / Python 3.12.10, 154 passed e 1 aviso em 14.85s; run 41096762375 no commit 01bc2c concluiu sucesso, 160 passed e 1 aviso em 17.10s. Estes testes não exercitam a nova regressão, nem validam o Bambu Studio.
- Builds standalone anteriores 41096415796 (1176f9b) e 41096762309 (01bc2c) estavam `in_progress` no passo MSVC/Nuitka na consulta desta rodada; o artefato do 41096762309 foi consultado e retornou nenhum. Para o novo commit 18d424, workflows 41097747546 (testes Windows) e 41097747966 (build standalone) estavam `in_progress` na consulta às 17:19:13 UTC. Não declarar o build/auditoria do commit novo até verificar ambos; nenhum artefato foi anexado ou publicado.
- Decisão registrada: a compilação interna pode terminar com sucesso e ainda reportar metadados de licença incompletos; o JSON exibe `license_metadata_complete`/contagem separadamente, enquanto checklist legal continua impedindo distribuição. Isso mantém build e inventário técnico testáveis sem convertê-los em aprovação jurídica. Custo se a decisão estiver errada: sucesso do CI poderia ser interpretado como liberação; mitigação atual é checklist aberto e nenhuma publicação/release autorizada.
- A atualização da checklist de licenças no commit `6e21edc6b7627414586491b4eac0999e4dcf6757` registra o build/inventário técnico 41087845821 do código 7c8471e, com 28 distribuições, todas correspondentes ao lock, metadados preenchidos e 4 textos truncados apenas no resumo; isso não é SBOM SPDX/CycloneDX, revisão legal ou instalação manual. A revisão de licença e modelo de distribuição continua aberta.
- Não houve chamada real à OpenAI, uso de chave, inclusão de STL/3MF ou histórico privado, upload de artefato, release, publicação, merge ou impressão.


### Verificação Windows do erro DEFLATE (2026-10-30)

- O workflow 41097747546 para commit 18d4243 concluiu success em Windows Server 2025 / Python 3.12.10: 161 passed, 1 aviso esperado, 13.48s. O teste novo de arquivo sintético corrompido está incluído; isso valida o tratamento Python no runner e não o Bambu Studio.
- Na consulta às 17:20:50 UTC, build standalone 41097747966 para 18d4243, 41096415796 para 1176f9b e 41096762309 para 01bc2c continuavam `in_progress` no passo MSVC/Nuitka. Runs consultados retornaram `artifacts=[]`; aguardar e revisar o log de auditoria antes de encerrar verificações de build.
- Ref branch confirmada após os commits: `2a7b672264c4b588a11d8a73944a4c0bab96811d`. Nenhum checkbox do plano mudou nesta atualização.


## Continuação 2026-10-30 — distinguir Windows cliente de Server

- HEAD de código: ffc6d634bf327452c91908bceca9f1eee73d0082, na branch autorizada. A inspeção do platform_support.py revelou que o build 26100 do Windows Server 2025 podia ser classificado como Windows 11 suportado, embora o alvo da especificação seja Windows 10 22H2/Windows 11 cliente.
- Teste RED inicial de UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest tests/unit/test_platform_support.py -q: 2 falhas esperadas; uma API de assess_windows_target ainda não tinha product_type, e a detecção runtime classificava o product_type 3 como Windows 11. A primeira forma do mock também exigiu ajuste porque Linux não possui sys.getwindowsversion; o teste foi corrigido para injetar um objeto de plataforma Windows.
- Implementação: assess_windows_target recebe product_type; apenas product_type 1 (workstation) pode casar com Windows 10/11 suportado. Server/domain controller mostra um rótulo de servidor e permanece fora do alvo. detect_windows_target encaminha o product_type retornado por sys.getwindowsversion, com fallback defensivo para 1 caso a propriedade não exista.
- GREEN focal: o mesmo comando de teste — 8 passed.
- Suíte após as duas correções desta continuação: UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m pytest -q — 163 passed, 1 aviso esperado da fixture ZIP duplicada, 6.11s. UV_PROJECT_ENVIRONMENT=/tmp/bambuprep-qt-env uv run --locked --extra test python -m compileall -q src tools tests — exit 0.
- Commit: ffc6d634bf327452c91908bceca9f1eee73d0082 (fix: exclude Windows Server from supported targets), update-ref confirmado usando expected SHA 354cd488b76b1048e6e1c1a470deed280b28d27b.
- Runs Windows criados para esse commit: 41098415689 (testes) e 41098415681 (build standalone), ambos in_progress na consulta de 17:23:38 UTC. O build standalone não está pronto; nenhum 3MF/Bambu Studio é testado nesse workflow.
- Permanecem inalterados os checkboxes do plano. A primeira etapa ainda incompleta é a prova real T1 com instalação Windows e Bambu Studio do usuário; Windows Server não é um substituto para o Windows cliente-alvo nem para a instalação Studio.
- Nenhuma chamada OpenAI, chave, arquivo privado, artifact, release, publicação, merge ou impressão foi usada nesta alteração.


### CI Windows — detecção do product type do Windows (2026-10-30)

- Workflow de testes 41098415689 para commit ffc6d63 concluiu success em Windows Server 2025 / Python 3.12.10: 163 passed, 1 aviso esperado da fixture ZIP duplicada, 17.68s. Isso valida a lógica e os testes no runner Windows, inclusive a simulação de product_type 3; não comprova o app em um Windows cliente/instalação do usuário.
- Build standalone 41098415681 para ffc6d63 continuava in_progress no passo MSVC/Nuitka na consulta de 17:24:28 UTC. Os builds 41097747966 (18d4243), 41096415796 (1176f9b) e 41096762309 (01bc2c) também permaneciam em andamento nas últimas consultas. Nenhum artefato foi anexado.
- O HEAD atual na branch antes desta atualização do ledger era 6d32418fe9cb0144b06b1183b75d451899f23bca. Nenhum checkbox do plano mudou.


## Revisão final de trabalho técnico disponível sem o Windows do usuário — 2026-10-30 18:12 UTC

- HEAD antes do fechamento desta execução: a8a171b77d653a1462e0effc5db2f2de57272204. Comparação GitHub entre 01bc2c1890d384fc2e95d1317f69c3c1071b3c8d e esse HEAD: branch ahead_by=6, behind_by=0; arquivos alterados no intervalo: este ledger, src/bambuprep/bambu/project_3mf.py, src/bambuprep/platform_support.py e os dois testes correspondentes. O plano e a especificação não foram modificados; nenhum checkbox foi marcado.
- Revalidação final: a primeira etapa incompleta continua sendo T1 linha 83 (executar bambu_cli_probe.py com Bambu Studio real em Windows suportado). A ausência do PC/Studio e do STL Sentinel impede o probe, o projeto de prova de T1 e a validação local do Sentinel. T5/fatiamento/3MF Bambu e ações de revisão da interface dependem dessa prova. Não foram declaradas compatibilidade, revisão de arquivo no Studio ou impressão validada.
- Builds standalone GitHub Actions concluídos com success em runners Windows Server 2025; a auditoria dos quatro bundles passou e nenhum artifact foi anexado. Em todos: 28 distribuições, todas no uv.lock, metadata completa (0 ausentes), 4 valores longos truncados apenas no resumo compacto, THIRD_PARTY_NOTICES.rst incluído e zero nomes no inventário com sufixos .stl/.3mf/.sqlite/.sqlite3/.db/.log. Isso verifica o build/auditoria no runner; não é instalação manual nem prova do Bambu Studio.
  - Run 41096415796, commit 1176f9b: 923 arquivos, 209.508.517 bytes; BambuPrep.exe 63.346.688 bytes, SHA-256 41829b20fa577ee33c02a05ab686971aeab4ef2bdb5dadd0b5fb947a1886d4ee.
  - Run 41096762309, commit 01bc2c1: 923 arquivos, 209.524.931 bytes; BambuPrep.exe 63.363.072 bytes, SHA-256 ad7c43e20cc3b17829d5ae64e3dbfec063b9cf289f31632b2d1b59d8884fe7c5.
  - Run 41097747966, commit 18d4243: 923 arquivos, 209.524.931 bytes; BambuPrep.exe 63.363.072 bytes, SHA-256 d86789451494bd2690becde48d225eef68f65f5297cf2c6e960e9e9e4cbda541.
  - Run 41098415681, commit ffc6d63: 923 arquivos, 209.525.955 bytes; BambuPrep.exe 63.364.096 bytes, SHA-256 623b60d3e4b05c7baad91869ee1c7cfb32ef1d37983c9418608d214ec9d10961.
- Runs Windows de teste: 41096415629 (1176f9b) 154 passed/1 aviso; 41096762375 (01bc2c1) 160 passed/1 aviso; 41097747546 (18d4243) 161 passed/1 aviso; 41098415689 (ffc6d63) 163 passed/1 aviso. Todos em Windows Server 2025/Python 3.12.10. Testes automatizados e build não comprovam Windows 10/11 cliente, Bambu Studio real, compatibilidade de presets, fatiamento ou impressão.
- Estado de publicação: workflow atual compila e audita, não anexa artefatos. Nenhum release/publicação foi feito. Checklist de licenças permanece aberto para revisão jurídica e decisão humana de licença/modelo de distribuição. A conclusão de metadados técnicos no build não é aprovação legal nem SBOM formal.
- Pendências humanas consolidadas:
  1. Usar um PC Windows 10 22H2 x64 ou Windows 11 x64 com Bambu Studio instalado. Registrar a versão/build reais, escolher o executável local e executar tools/bambu_cli_probe.py; compartilhar apenas a evidência textual necessária de CLI e perfis.
  2. Disponibilizar o Sentinel STL somente nesse PC local e executar a prova sem imprimir. Abrir o resultado no Studio e confirmar A1 mini, bico físico escolhido, Generic PLA, Bambu Textured PEI, suportes/aderência e Preview. Não copiar o STL ou o 3MF privado para GitHub.
  3. No Windows cliente, executar a verificação manual de instalação/primeiro uso, análise local, responsividade da janela e caminho sem API. Após a Tarefa 5 ser desbloqueada, testar abertura/revisão de 3MF e remoção dos arquivos produzidos localmente em Windows 10 e Windows 11.
  4. Uma chamada real à OpenAI só pode ser validada se o usuário fornecer a própria chave localmente e der consentimento explícito para aquele trabalho; sem isso ficam os mocks e nenhuma chamada real.
  5. Antes de qualquer distribuição futura, decidir licença/modelo do BambuPrep e concluir revisão humana das obrigações e avisos das dependências. A instrução atual proíbe release/publicação.
- Não se exige uma impressão física para a prova de integração e nenhuma impressão foi executada ou validada. Depois desta revisão não resta implementação segura independente da evidência/hardware/decisões humanas acima; a recorrência será encerrada.


### Encerramento da recorrência

- A automação BambuPrep com jawbone_id 6ae425e42b808191bdaf4f892611b197 foi desativada após a revisão final; automations_update confirmou sucesso e automations_peek confirmou is_enabled=false às 2026-10-30 18:13:48 UTC.
- Não há código independente seguro pendente sem as ações humanas listadas acima. A recorrência horária foi encerrada. Para retomá-la, o usuário precisa solicitar nova execução depois de fornecer a evidência local do Windows/Bambu Studio ou outros itens aplicáveis.


## Retomada manual pelo usuário — evidência da CLI e ajuste do detector (2026-10-30)

- Branch autorizada: `codex/bambu-a1-mini-foundation-20261029`; HEAD antes desta retomada: `7d31235d9d9ae7e9a6862cc154f46eec81b5a577`. Primeira etapa incompleta continua sendo a prova real da Tarefa 1; nenhum checkbox do plano mudou.
- Evidência visual fornecida pelo usuário: a tela Sobre mostrou Bambu Studio 2.8.2.61 e a instalação está em `C:\\Program Files\\Bambu Studio\\bambu-studio.exe`. A versão exata do Windows não foi registrada.
- O usuário executou o probe em `tools`; o JSON retornou `version: null`, `cli_available: false`, `capabilities: []` e `Bambu Studio CLI returned no response to --help.` Na chamada direta a `--help`, a ajuda apareceu no PowerShell, mas não foi capturada pelo pipe de `Select-String`; a imagem mais recente não mostra retorno ao prompt nem código de saída.
- A ajuda da instalação mostra `--orient`, `--arrange`, `--slice`, `--export-3mf`, `--export-stl`, `--export-stls` e a linha de prioridade de presets com `--load_settings` e `--load_filaments`. Isso é observação da ajuda, não valida fatiamento nem configura perfis.
- Causa confirmada para um defeito independente do detector: os padrões antigos aceitavam somente hífen nos nomes de carregamento; a instalação observada usa sublinhado. TDD em cópia isolada, Python 3.12.14: `PYTHONPATH=/tmp/bambu-discovery-repro/src python -m unittest discover -s /tmp/bambu-discovery-repro/tests -v` — RED: 1 falha esperada, faltavam `machine_profiles` e `filament_profiles`; após aceitar hífen ou sublinhado, o mesmo comando — GREEN: 1 passou.
- Atualização de código/teste/documentação: `src/bambuprep/bambu/discovery.py` reconhece `--load_settings`/`--load_filaments` e variantes com hífen; `tests/unit/test_bambu_discovery.py` ganhou regressão usando o texto observado; `docs/operations/windows-cli-proof.md` registra a evidência parcial sem imagem e mantém o gate aberto.
- Commit: `4ed85c92e74107af5fef60db6b863f37ed98bbb7` (`fix: recognize underscore Bambu CLI profile options`), filho de `7d31235d9d9ae7e9a6862cc154f46eec81b5a577`. A ref branch foi atualizada com expected SHA e sem force.
- Não havia checkout local nem pytest instalado neste ambiente; por isso, o teste focal de repositório e suíte completa aguardam o workflow Windows 41114493466, atualmente queued. O teste isolado RED/GREEN não substitui essa suíte.
- Ruling: aceitar os dois separadores nos nomes observados — a ajuda real desta instalação usa sublinhados e versões anteriores podem usar hífens; custo se estiver errado: detecção de opção pode ficar incompleta, porém a lista de capacidades continua informativa e não desbloqueia slice/3MF.
- Bloqueio permanece: o processo do Studio não devolveu saída capturável ao probe; sem versão capturada, resposta de status confiável e perfis lidos, a Tarefa 1 funcional e a Tarefa 5 continuam incompletas. Ainda não houve STL de referência, fatiamento, exportação/reabertura 3MF, revisão de Preview, chamada OpenAI ou impressão.


### CI Windows do ajuste de opções (2026-10-30)

- Workflow 41114493466 para `4ed85c92e74107af5fef60db6b863f37ed98bbb7` concluiu `success` em `windows-latest`; Python 3.12.10. Comando configurado no workflow: `uv run --locked --extra test python -m pytest -v` — **164 passed, 1 aviso esperado** da fixture ZIP com nome duplicado, em 14.28s.
- A regressão `test_detects_profile_options_when_installed_help_uses_underscores` está incluída e passou. Este CI confirma o comportamento do parser, sem Bambu Studio instalado e sem validar o slice/3MF.
- O HEAD no momento do registro é `de91661f435cd280ce6599d8cc6c7a324170281c`; o commit de código `4ed85c9` permanece filho de `7d31235`. Não houve alteração de checkbox no plano.


### Mensagem para ajuda não capturada (2026-10-30)

- A evidência do usuário mostrou que o comando direto --help imprimiu opções na janela do PowerShell, enquanto o probe recebeu stdout/stderr vazios. O diagnóstico anterior dizia apenas “no response”, sem esclarecer que a saída pode não ter sido capturada.
- TDD isolado, Python 3.12.14: teste verificou cli_available=false e mensagem contendo captured e console. RED: falhou porque a mensagem antiga não mencionava captura; após a alteração no texto, o mesmo teste passou.
- Código agora informa que não houve resposta em stdout/stderr capturados e que a ajuda pode ter sido escrita diretamente no console. A disponibilidade permanece false; nenhuma opção é inferida de saída que o processo não entregou ao probe.
- Commit: 323145212c108fe316b98b155fcb99132c921544 (fix: clarify uncaptured Bambu Studio help output), filho de 4d6dbe0f6752db8f6213f851b268a75a1474be5c. Regressão acrescentada a tests/unit/test_bambu_discovery.py.
- Runs do novo commit: testes Windows 41114864648 e build standalone 41114864699 estavam in_progress na consulta; resultados pendentes para a próxima atualização deste ledger.
- O ajuste melhora o diagnóstico, mas não faz o probe capturar a ajuda; a Tarefa 1 continua incompleta e nenhum checkbox foi atualizado.


### CI Windows da mensagem de captura (2026-10-30)

- Workflow 41114864648 para commit 323145212c108fe316b98b155fcb99132c921544 concluiu success em windows-latest/Python 3.12.10. Comando: uv run --locked --extra test python -m pytest -v — 164 passed, 1 aviso esperado da fixture ZIP duplicada, 25.08s.
- O teste existente de resposta vazia agora exige uma mensagem que mencione stdout/stderr capturados e a possibilidade de saída direta ao console. A suíte passou; o probe continua false quando não há dados capturáveis.
- O build standalone 41114864699 para o mesmo commit ainda estava in_progress na consulta. Ele não testa o Bambu Studio instalado nem a prova de fatiamento.
- Não houve mudança no plano/checklists. A primeira etapa incompleta continua T1 (prova local); nenhum STL/3MF privado, chave, chamada OpenAI ou impressão foi usado.


### Hipótese de captura via pipes sem console próprio (2026-10-30)

- Hipótese para testar no Windows real: o executável pode estar escrevendo na consola herdada; iniciar com CREATE_NO_WINDOW talvez mantenha stdout/stderr redirecionados para o probe. É uma tentativa de captura, não confirmação de suporte CLI.
- TDD em cópia isolada, Python 3.12.14: regressão simulou CREATE_NO_WINDOW=0x08000000 e exigiu que ambos os subprocessos (--version e --help) recebessem creationflags. RED: falhou com [None, None]. GREEN: após passar a flag com getattr(..., 0), três testes unittest isolados passaram (opções com underscore, diagnóstico de captura vazia e flag Windows).
- Commit: c9b7f084c553f7b91ee59edf8dc78998c354f5b7 (fix: capture Bambu CLI without console allocation), filho de a8b3a37ef90eb676151eb2f32d9b7dcf6449ba7f. Adicionado teste cross-platform com constante simulada; em Windows o valor real vem de subprocess.CREATE_NO_WINDOW, em outras plataformas usa 0.
- Runs do novo commit: testes Windows 41115260639 e build standalone 41115260192 estavam queued na consulta. A prova real depende de executar o branch atualizado contra o Bambu Studio 2.8.2.61 do usuário.
- A detecção permanece segura: saída vazia continua em cli_available=false. Nenhum checkbox de prova real foi marcado; slice, perfis carregados, 3MF, revisão e impressão continuam não verificados.


### CI Windows do teste de captura do console (2026-10-30)

- Workflow 41115260639 para c9b7f084c553f7b91ee59edf8dc78998c354f5b7 concluiu success em windows-latest/Python 3.12.10. Comando: uv run --locked --extra test python -m pytest -v — 165 passed, 1 aviso esperado de nome ZIP duplicado, 17.99s.
- A regressão confirma que o probe passa a constante CREATE_NO_WINDOW nas chamadas --version e --help quando disponível. Isso valida somente a construção do subprocesso no runner Windows; o CLI real 2.8.2.61 ainda precisa ser exercitado pelo usuário.
- Build standalone 41115260192 permanecia in_progress; nenhum artefato foi anexado/publicado. Nenhum checkbox do plano foi marcado.


### Evidência adicional do Bambu Studio 2.8.2.61 (2026-10-30)

- A nova captura enviada pelo usuário mostra a ajuda completa no PowerShell, retorno ao prompt e `Exit code: 0`. A ajuda direta exibe `--orient`, `--arrange`, `--slice`, `--export-3mf`, `--export-stl`, `--export-stls`, `--load_settings` e `--load_filaments`.
- Isso comprova que a invocação direta de `--help` terminou com sucesso nesta instalação; não comprova que o probe Python capturou stdout/stderr nem que qualquer operação de slice/export funciona. A mudança `CREATE_NO_WINDOW` ainda precisa ser testada no Studio 2.8.2.61.
- Evidência registrada em `docs/operations/windows-cli-proof.md`, commit `94022d047ac3bd25e0f1896dbbc41d74e20ff676`. A captura não foi versionada. O plano não foi marcado: Tarefa 1 ainda exige executar o probe do branch atualizado e ler perfis; projeto/3MF e revisão continuam não realizados.
- Verificação de código existente: workflow Windows 41115260639, commit `c9b7f084c553f7b91ee59edf8dc78998c354f5b7`, `uv run --locked --extra test python -m pytest -v` — success, 165 passed e um aviso esperado da fixture ZIP duplicada (Windows Server runner, Python 3.12.10). É CI de testes, não prova do Bambu Studio.
- Workflow de build standalone 41115260192 permanecia `in_progress` na consulta desta rodada. Não há checkout Git no ambiente desta sessão; por isso nenhum comando de teste foi executado localmente nesta rodada. Nenhum arquivo privado, STL/3MF, chave ou captura foi enviado ao GitHub.
- Próxima ação indispensável do usuário: baixar o ZIP atualizado do branch, abrir `tools` no PowerShell e executar `python .\bambu_cli_probe.py --executable "$env:ProgramFiles\Bambu Studio\bambu-studio.exe"`; compartilhar apenas o JSON. A prova de integração permanece aberta.

### Diagnóstico do código de saída no probe do CLI (2026-10-30)

- Ajuste independente: quando `--help` não produz texto capturado, a mensagem agora inclui o código de saída observado pelo subprocesso, mantendo `cli_available=false` e a advertência de que pode ter escrito no console. Foi acrescentado um assert ao teste `test_empty_cli_response_is_not_reported_as_available`.
- TDD isolado com cópia do `discovery.py` da branch e stub de executável: RED — `python -c "import sys; sys.path.insert(0, '/tmp'); import test_bambu_diag; test_bambu_diag.test_empty_help_diagnostic_includes_exit_status()"` falhou na asserção `exit code 0`, pois a mensagem anterior omitia o código; GREEN — após o ajuste, o mesmo comando terminou com exit 0. O runtime tinha Python 3.12, mas não tinha `pytest`; essa verificação isolada não substitui a suíte do projeto.
- Commit de código/teste: `0976450cb09e0700c62e742079fbb81110fcbfa2` (`fix: report Bambu CLI help exit status`), filho do commit de ledger `e3d6cdbd112475b57cd320e06e40ca059972a0ca`. O CI do commit iniciou: testes Windows 41118059732 e build standalone 41118059752 estavam `in_progress` na consulta.
- O build standalone 41114864699 para o commit `323145212c108fe316b98b155fcb99132c921544` concluiu `success`; o build 41115260192 do commit `c9b7f084c553f7b91ee59edf8dc78998c354f5b7` ainda constava `in_progress`. Nenhum artefato foi anexado.
- Nenhum checkbox foi alterado. A primeira tarefa incompleta segue a execução do probe atualizado no Windows real; não houve slice, STL Sentinel, perfil carregado, 3MF reaberto, revisão no Studio, chamada OpenAI ou impressão nesta rodada.