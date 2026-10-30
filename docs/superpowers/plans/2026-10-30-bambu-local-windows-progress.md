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
