# BambuPrep local para Windows — plano de implementação

> **Para a execução:** seguir a subskill superpowers:executing-plans ou superpowers:subagent-driven-development, tarefa por tarefa. Cada etapa abaixo termina com uma verificação independente. Não iniciar a implementação antes da revisão deste plano.

**Objetivo:** criar um aplicativo desktop local que transforme um STL selecionado em uma análise técnica, recomendações justificadas e um projeto 3MF preparado para revisão no Bambu Studio da A1 mini.

**Arquitetura:** aplicativo Python/PySide6. O núcleo mede e registra a malha localmente; OpenAI recebe somente métricas e imagens renderizadas após consentimento; o Bambu Studio instalado é a autoridade para perfis, fatiamento e exportação do 3MF. O usuário abre/revisa o projeto e continua responsável por iniciar a impressão.

**Tecnologias:** Python, PySide6, Trimesh, NumPy, Matplotlib Agg e fast-simplification para vistas estáticas, SQLite, Windows Credential Locker pelo backend keyring, OpenAI Responses API e CLI oficial do Bambu Studio.

**Especificação:** docs/superpowers/specs/2026-10-30-bambu-local-windows-design.md

## Restrições globais

- Alvo inicial: Windows 10 22H2 x64 e Windows 11 x64. Arquitetura ARM ou versão anterior exige confirmação antes de publicar build.
- V1 exclusivamente local no Windows: sem site online, Supabase, fila remota ou envio de STL à nuvem.
- Equipamento inicial: Bambu Lab A1 mini, bico físico 0,4 mm ou 0,2 mm, Generic PLA e Bambu Textured PEI Plate original.
- O bico deve ser confirmado para cada trabalho; não presumir que o aplicativo detecta uma troca física.
- O STL original é somente leitura. A OpenAI recebe, com consentimento, métricas selecionadas e imagens renderizadas, nunca o STL bruto.
- O Bambu Studio instalado localmente é o fatiador; não usar APIs privadas/reversas da Bambu nem iniciar impressão automaticamente.
- Só marcar slicer_verified depois de um fatiamento local válido, inspeção automatizada do 3MF e revisão/confirmação explícita do usuário no Bambu Studio.
- Guardar configuração, SQLite, logs e temporários em %LOCALAPPDATA%/BambuPrep; resultados ficam no destino escolhido pelo usuário.
- Não armazenar chave OpenAI em arquivo, SQLite, repositório ou build. Usar Windows Credential Locker e explicar que a API é cobrada separadamente da assinatura ChatGPT.
- GitHub guarda código, documentação e builds; GitHub Actions não recebe STL/3MF privados nem chaves de API para processar trabalhos.
- Não alterar geometria para adivinhar a intenção do desenho. Reparos simples só em cópia, com relatório antes/depois; casos ambíguos exigem revisão.
- Revisar licenças e avisos das dependências PySide6 antes de publicar um build distribuível.

## Principais riscos de entrada e verificações planejadas

1. CLI ausente, incompatível ou com saída silenciosamente inválida → Tarefas 1 e 5; testes com subprocesso simulado e prova manual no Windows.
2. STL ASCII/binário vazio, truncado ou com dimensões suspeitas → Tarefa 3; testes para arquivos válidos/inválidos e escala que exige revisão.
3. Malha aberta, múltiplas conchas ou facetas degeneradas → Tarefa 3; testes garantem que o defeito é reportado e não reparado silenciosamente.
4. IA sem consentimento, com resposta fora do schema ou sem API disponível → Tarefa 4; testes de bloqueio, rejeição e continuidade da análise local.
5. CLI retorna sucesso mas o 3MF está ausente, inválido ou diverge dos perfis escolhidos → Tarefa 5; testes impedem estado verificado e cobrem confirmação no Studio.

## Estrutura de arquivos prevista

- src/bambuprep/__main__.py — ponto de entrada do aplicativo.
- src/bambuprep/app.py — composição dos serviços e janela.
- src/bambuprep/domain/models.py — tipos de domínio e estados do trabalho.
- src/bambuprep/domain/transitions.py — transições permitidas entre estados.
- src/bambuprep/config.py — diretórios e preferências locais.
- src/bambuprep/storage/database.py — criação/migração do SQLite.
- src/bambuprep/storage/jobs.py — leitura e gravação do histórico.
- src/bambuprep/security/api_key_store.py — interface e integração com Windows Credential Locker.
- src/bambuprep/mesh/loader.py — leitura segura e hash do STL.
- src/bambuprep/mesh/analyzer.py — medições, diagnósticos e candidatos de orientação.
- src/bambuprep/mesh/repair.py — reparos simples somente em cópia auditada.
- src/bambuprep/mesh/render.py — vistas PNG para interface e análise consentida.
- src/bambuprep/recommendations/schema.py — schema tipado da recomendação.
- src/bambuprep/recommendations/openai_client.py — chamada à Responses API.
- src/bambuprep/recommendations/validator.py — validação contra medições e opções de perfil.
- src/bambuprep/bambu/discovery.py — localização e prova de instalação/versão/CLI.
- src/bambuprep/bambu/profiles.py — leitura e compatibilidade dos perfis instalados.
- src/bambuprep/bambu/slicer.py — comando do CLI, logs e verificação do 3MF.
- src/bambuprep/workflow/service.py — fluxo e transições de cada trabalho.
- src/bambuprep/ui/main_window.py — seleção de STL, progresso, relatório e ações.
- src/bambuprep/ui/settings_dialog.py — Studio, impressora, bico e OpenAI.
- src/bambuprep/ui/review_dialog.py — confirmação de revisão do 3MF no Studio.
- tests/unit/ — testes de domínio, armazenamento, geometria, IA, CLI e fluxo.
- tests/fixtures/ — malhas sintéticas pequenas; nunca guardar o STL pessoal de referência.
- tools/bambu_cli_probe.py — diagnóstico executável no Windows.
- docs/operations/windows-cli-proof.md — instruções e evidências da prova na instalação real.
- .github/workflows/windows-build.yml — build de release sem modelos ou segredos privados.

## Tarefa 1: base executável e prova do Bambu Studio

**Arquivos:**
- Criar: pyproject.toml, src/bambuprep/__init__.py, src/bambuprep/__main__.py
- Criar: src/bambuprep/bambu/discovery.py
- Criar: tools/bambu_cli_probe.py
- Criar: docs/operations/windows-cli-proof.md
- Criar: tests/unit/test_bambu_discovery.py

**Interfaces:**
- Produzir StudioProbe(executable: Path, version: str | None, cli_available: bool, capabilities: frozenset[str], message: str).
- Produzir probe_studio(executable: Path, timeout_seconds: int = 20) -> StudioProbe.
- O diagnóstico deve poder ser executado sem abrir a interface e sem iniciar uma impressão. A sintaxe específica do CLI será obtida da ajuda/versão realmente instalada, não presumida por versão.

- [x] Escrever testes para executável ausente, versão identificável, CLI sem resposta, timeout e texto de ajuda sem as capacidades necessárias.
- [x] Rodar python -m pytest tests/unit/test_bambu_discovery.py -v; os casos inválidos devem falhar de forma controlada e os casos válidos devem descrever as capacidades detectadas.
- [x] Implementar descoberta sem shell intermediário, com caminho explícito selecionado pelo usuário e captura de versão, ajuda, código de saída e timeout.
- [ ] Executar tools/bambu_cli_probe.py em Windows suportado com o Bambu Studio realmente instalado; registrar versão/build, executável, argumentos confirmados e perfis encontrados em docs/operations/windows-cli-proof.md.
- [ ] Criar um projeto pequeno de prova com A1 mini, bico selecionado, Generic PLA e Textured PEI; executar o CLI sem imprimir e reabrir o resultado no Studio. Registrar se o CLI exportou um 3MF íntegro e se Preview/perfis correspondem ao pedido.
- [x] Tratar a prova real do Windows como gate para Tarefa 5. Se falhar, documentar o comportamento e manter o fatiamento em fallback manual; não marcar slicer_verified.

## Tarefa 2: tipos de domínio, configuração e armazenamento local

**Arquivos:**
- Criar: src/bambuprep/domain/models.py
- Criar: src/bambuprep/domain/transitions.py
- Criar: src/bambuprep/config.py
- Criar: src/bambuprep/storage/database.py
- Criar: src/bambuprep/storage/jobs.py
- Criar: src/bambuprep/security/api_key_store.py
- Criar: tests/unit/test_job_transitions.py, tests/unit/test_local_storage.py, tests/unit/test_api_key_store.py

**Interfaces:**
- JobState: uploaded, analyzing, needs_review, recommendation_ready, project_configured, slicer_verified, blocked e failed.
- PrinterSelection(printer_id: str, nozzle_mm: float, filament_id: str, plate_id: str).
- JobRecord(id: str, created_at: datetime, source_path: Path, source_sha256: str, state: JobState, report_json: str | None, output_path: Path | None).
- JobRepository.create_job(source_path: Path, source_sha256: str) -> JobRecord; JobRepository.transition(job_id: str, expected: JobState, target: JobState, detail: str | None = None) -> JobRecord.
- ApiKeyStore.save(key: str) -> None; ApiKeyStore.get() -> str | None; ApiKeyStore.delete() -> None. Implementação Windows falha de forma segura se Credential Locker não estiver disponível; nunca usa arquivo como fallback.

- [x] Escrever testes para transições permitidas/proibidas, persistência após reiniciar a conexão SQLite, limpeza do histórico e isolamento do segredo.
- [x] Rodar python -m pytest tests/unit/test_job_transitions.py tests/unit/test_local_storage.py tests/unit/test_api_key_store.py -v.
- [x] Implementar caminhos padrão sob %LOCALAPPDATA%/BambuPrep, migração versionada de SQLite e repositório de histórico.
- [x] Implementar armazenamento de chave usando Windows Credential Locker por meio de keyring; injetar a interface nos serviços para que testes não precisem de credenciais reais.
- [x] Confirmar que o banco/logs não recebem chave OpenAI nem o conteúdo do STL.

## Tarefa 3: ingestão, análise geométrica e vistas

**Arquivos:**
- Criar: src/bambuprep/mesh/loader.py
- Criar: src/bambuprep/mesh/analyzer.py
- Criar: src/bambuprep/mesh/repair.py
- Criar: src/bambuprep/mesh/render.py
- Criar: tests/unit/test_stl_loader.py, tests/unit/test_mesh_analysis.py, tests/unit/test_mesh_repair.py, tests/unit/test_mesh_render.py
- Criar fixtures sintéticas ASCII/binárias em tests/fixtures/

**Interfaces:**
- MeshDocument(path: Path, sha256: str, file_bytes: int, mesh: trimesh.Trimesh).
- MeshReport(sha256: str, dimensions_mm: tuple[float, float, float], triangle_count: int, component_count: int, volume_mm3: float | None, watertight: bool, degenerate_faces: int, duplicate_faces: int, scale_warning: str | None, overhang_area_ratio: float, contact_area_estimate: float, orientation_candidates: list[OrientationCandidate], warnings: list[str]).
- load_stl(path: Path) -> MeshDocument; analyze_mesh(document: MeshDocument, nozzle_mm: float) -> MeshReport; render_views(document: MeshDocument, report: MeshReport) -> dict[str, bytes]; repair_copy(document: MeshDocument, destination: Path, operation: str) -> RepairAudit.
- STL não possui unidade confiável: interpretar as coordenadas como mm apenas para exibir medições e sinalizar dimensões implausíveis; nunca reescalar sem confirmação.
- As vistas são renderizadas localmente usando Matplotlib Agg. Acima de 50.000 faces, reduzir somente uma cópia visual com Trimesh simplify_quadric_decimation(face_count=50_000), usando fast-simplification; abaixo disso, usar a malha original. Os números do relatório vêm sempre da malha original, e as vistas devem indicar quando foram simplificadas.
- Candidatos de orientação devem incluir a rotação escolhida e os indicadores usados para ordená-la; não alegar que uma heurística garante sucesso físico.

- [x] Escrever testes para STL ASCII e binário equivalentes, STL vazio/truncado, hash e bytes de origem preservados, cubo fechado, cubo aberto, múltiplas conchas, facetas degeneradas e escala suspeita.
- [x] Escrever teste para o reparo produzir arquivo separado e trilha de operação/hash/medidas antes e depois; entrada original nunca muda.
- [x] Escrever teste para renderizar as quatro vistas requeridas em PNG não vazio e associá-las ao relatório correto.
- [x] Rodar python -m pytest tests/unit/test_stl_loader.py tests/unit/test_mesh_analysis.py tests/unit/test_mesh_repair.py tests/unit/test_mesh_render.py -v.
- [x] Implementar leitura com Trimesh, métricas determinísticas, diagnóstico de balanço/contato e candidatos de orientação. Valores que dependam de estimativa devem aparecer identificados como estimativas.
- [x] Se o arquivo exceder limite configurável de tamanho/memória, encerrar a análise com mensagem acionável e preservar o original; não travar a interface.
- [ ] Validar localmente o STL Sentinel Busts fornecido quando ele estiver disponível no Windows. Não copiar esse arquivo para GitHub, fixtures ou logs.

## Tarefa 4: recomendação OpenAI com consentimento e limites estritos

**Arquivos:**
- Criar: src/bambuprep/recommendations/schema.py
- Criar: src/bambuprep/recommendations/openai_client.py
- Criar: src/bambuprep/recommendations/validator.py
- Criar: tests/unit/test_recommendation_schema.py, tests/unit/test_openai_privacy.py, tests/unit/test_recommendation_validation.py

**Interfaces:**
- Recommendation(orientation_id: str, support_enabled: bool, support_option: str | None, adhesion_option: str, confidence: float, rationale: list[str], evidence_refs: list[str]).
- request_recommendation(report: MeshReport, images: dict[str, bytes], selection: PrinterSelection, consent: bool, key_store: ApiKeyStore, client: OpenAIClient, *, profile_options: RecommendationProfileOptions | None = None) -> Recommendation. Sem opções extraídas do catálogo local instalado, o serviço falha fechado.
- OpenAIClient.create_response(*, payload: Mapping[str, object], api_key: str) envia a requisição Responses API; a chave é usada apenas no cabeçalho de autenticação.
- O aplicativo fornece à IA somente candidatos de orientação já medidos e opções extraídas dos perfis instalados. A IA escolhe/justifica opções; não fornece vértices, código executável, G-code ou valores livres de perfil.
- Validar todo campo desconhecido, enum, faixa de confiança, referência de evidência e compatibilidade. Resposta inválida é rejeitada e mantém o relatório local.

- [x] Escrever testes garantindo que sem consentimento não há leitura da chave nem chamada de rede, e que caminho, nome local e bytes do STL nunca aparecem no corpo do payload.
- [x] Escrever testes para chave ausente, falha de rede, JSON/schema inválido, enum desconhecido, orientação não fornecida e perfil incompatível.
- [x] Rodar python -m pytest tests/unit/test_recommendation_schema.py tests/unit/test_openai_privacy.py tests/unit/test_recommendation_validation.py -v.
- [x] Implementar cliente Responses API com saída estruturada estrita, timeout limitado, erros sanitizados como indisponibilidade da recomendação e preservação do relatório local.
- [x] Bloquear cada chamada sem consentimento explícito por trabalho e fornecer texto de consentimento que explica o envio de vistas renderizadas e a cobrança separada da API.
- [ ] Exibir esse texto na interface e exigir confirmação explícita nova para cada trabalho antes de iniciar a chamada.
- [x] Nunca incluir o STL bruto, caminho, nome de arquivo, histórico local ou chave OpenAI no corpo do payload ou em logs; usar a chave apenas no cabeçalho Authorization da OpenAI.

## Tarefa 5: perfis oficiais, fatiamento e projeto 3MF

**Arquivos:**
- Criar: src/bambuprep/bambu/profiles.py
- Criar: src/bambuprep/bambu/slicer.py
- Criar: tests/unit/test_profile_catalog.py, tests/unit/test_slicer_cli.py, tests/unit/test_project_3mf.py
- Modificar: docs/operations/windows-cli-proof.md com a evidência da instalação testada

**Interfaces:**
- ProfileCatalog.load(studio_root: Path) -> ProfileCatalog; compatibilidade deve vir dos perfis instalados do Bambu Studio e incluir A1 mini, bicos 0,4/0,2, Generic PLA e Textured PEI.
- SlicePlan(selection: PrinterSelection, orientation_id: str, support_enabled: bool, support_option: str | None, adhesion_option: str, profile_ids: dict[str, str], cli_arguments: list[str]).
- SliceResult(exit_code: int, output_path: Path | None, verified: bool, diagnostics: list[str], log_path: Path).
- build_slice_plan(selection: PrinterSelection, recommendation: Recommendation, catalog: ProfileCatalog, probe: StudioProbe) -> SlicePlan; slice_project(input_path: Path, plan: SlicePlan, output_path: Path, executable: Path) -> SliceResult.
- Executar o processo com lista de argumentos e shell=False. A sintaxe vem da prova do Studio instalado; não converter valores desconhecidos em opções parecidas.

- [x] Escrever testes com fixtures JSON sintéticas para mapear as duas variantes do A1 mini, Generic PLA, processo padrão, placa e opções allowlisted; cobrir perfil obrigatório ausente/incompatível, caminho fora da pasta e ciclo de herança.
- [x] Implementar `ProfileCatalog.load` como leitor local somente leitura; a verificação automatizada usa apenas fixtures sintéticas e não afirma compatibilidade com uma instalação Windows real.
- [x] Rodar `python -m pytest tests/unit/test_profile_catalog.py -v` — 9 passed.
- [ ] Escrever testes para seleção obrigatória do bico por trabalho, opção incompatível no SlicePlan, argumentos seguros, timeout, saída inválida e falha do CLI.
- [ ] Escrever teste para validar a estrutura ZIP/3MF e metadados detectáveis antes de apresentar o arquivo como projeto configurado.
- [ ] Escrever teste garantindo que nenhuma saída vira slicer_verified sem conclusão válida e confirmação explícita do usuário após abrir/revisar o 3MF no Bambu Studio.
- [ ] Rodar python -m pytest tests/unit/test_profile_catalog.py tests/unit/test_slicer_cli.py tests/unit/test_project_3mf.py -v.
- [ ] Implementar fatiamento usando apenas o CLI e perfis da versão comprovada na Tarefa 1; capturar logs locais sem STL ou chave.
- [ ] Gerar 3MF somente se saída e configuração passarem pela inspeção. Usuário abre o arquivo no Studio e confirma máquina, bico, material, placa, suportes e Preview para concluir slicer_verified.
- [ ] Em CLI indisponível ou falho, não declarar slice pronto. Exibir análise e campos exatos que a pessoa deve conferir manualmente no Bambu Studio. Usar recommendation_ready ou project_configured conforme o que foi efetivamente validado.
- [ ] Executar prova com a versão/build real instalada e o STL de referência, sem imprimir; registrar divergências conhecidas e não publicar a compatibilidade como garantida se a prova falhar.

## Tarefa 6: interface e orquestração do fluxo completo

**Arquivos:**
- Criar: src/bambuprep/workflow/service.py
- Criar: src/bambuprep/ui/main_window.py
- Criar: src/bambuprep/ui/settings_dialog.py
- Criar: src/bambuprep/ui/review_dialog.py
- Modificar: src/bambuprep/app.py
- Criar: tests/unit/test_workflow_service.py
- Criar: docs/user-guide.md

**Interfaces:**
- WorkflowService.create_job(path: Path) -> JobRecord; analyze(job_id: str, selection: PrinterSelection) -> MeshReport; recommend(job_id: str, consent: bool) -> Recommendation | None; slice(job_id: str, output_path: Path) -> SliceResult; confirm_studio_review(job_id: str) -> JobRecord.
- Interface assíncrona para análise/fatiamento: operações longas não podem bloquear a janela; mensagens de erro incluem ação de recuperação e o estado real do trabalho.
- Tela deve mostrar perfil da A1 mini, bico confirmado, Generic PLA, Textured PEI, dimensões, riscos, vistas, recomendações justificadas e status do trabalho.

- [x] Escrever testes de criação/análise/recomendação simulada e dos caminhos blocked, needs_review, recommendation_ready, failed, consentimento ausente, fonte alterada e OpenAI indisponível.
- [ ] Escrever testes de fatiamento, project_configured e confirmação ausente após revisão; dependem das interfaces 3MF gated da Tarefa 5.
- [x] Rodar `python -m pytest tests/unit/test_workflow_service.py -v` — 7 passed.
- [x] Implementar `WorkflowService.create_job/analyze/recommend` para validar e analisar o STL localmente, persistir métricas/seleção sem bytes do arquivo, verificar o hash e chamar o serviço OpenAI somente quando consentimento explícito for passado.
- [ ] Implementar janela de arrastar/selecionar STL, seleção explícita do bico, andamento, relatório e botões para abrir 3MF no Bambu Studio, confirmar revisão, apagar histórico e remover arquivos do aplicativo.
- [ ] Tornar a seleção do bico obrigatória por trabalho. Mostrar placa/material como seleções editáveis e confirmadas, sem alegar leitura automática da impressora.
- [ ] Implementar tela de configurações para Studio, chave OpenAI, consentimento, retenção e diretório de saída.
- [ ] Confirmar manualmente no Windows que operações longas mantêm a janela responsiva e que um usuário consegue concluir o fluxo sem consultar os logs.

## Tarefa 7: build Windows, documentação e release

**Arquivos:**
- Criar: .github/workflows/windows-build.yml
- Criar: docs/operations/release-checklist.md
- Modificar: README.md, pyproject.toml e avisos de licença do pacote conforme necessário

**Interfaces:**
- Build de release x64 compatível com Windows 10 22H2/Windows 11, usando empacotamento PySide6 em modo standalone; o Bambu Studio não será empacotado.
- O instalador/build não inclui STL, 3MF de usuário, chave OpenAI, histórico, logs de execução ou dados do Windows local.

- [ ] Configurar GitHub Actions para instalar dependências bloqueadas, construir pacote standalone e publicar artefatos somente a partir de branch/tag de release autorizada.
- [ ] Rodar build em runner Windows limpo; confirmar ausência de chaves e arquivos de usuário no artefato.
- [ ] Instalar/abrir o pacote em Windows 10 22H2 x64 e Windows 11 x64; verificar primeira configuração, análise local, erro sem API e abertura do 3MF no Studio.
- [ ] Documentar instalação, primeiro uso, cobrança OpenAI separada, dados enviados com consentimento, backup/exclusão local e limitações de suporte.
- [ ] Revisar licenças/avisos de PySide6 e demais dependências antes de publicar; registrar a conclusão em docs/operations/release-checklist.md.

## Critérios de aceite

- O aplicativo abre em Windows suportado e detecta/solicita o caminho do Bambu Studio instalado.
- Abre STL ASCII e binário, preserva origem e apresenta hash, dimensões, triângulos, componentes e diagnósticos.
- Escala, malha ou reparo ambíguo exige revisão; reparo nunca modifica o original.
- A pessoa confirma o bico e a seleção A1 mini/Generic PLA/Textured PEI antes de preparar trabalho.
- Sem consentimento ou chave, a análise local continua e nenhuma chamada OpenAI acontece.
- IA só recomenda entre opções medidas/compatíveis; nenhuma resposta não validada chega ao CLI.
- Só marcar slicer_verified após CLI, inspeção de saída e confirmação da revisão do usuário no Bambu Studio.
- Quando CLI não funcionar, a interface mostra estado não verificado e instruções manuais específicas.
- O aplicativo nunca envia a impressão automaticamente e permite apagar histórico/arquivos locais.
- GitHub recebe somente código/documentação/build, nunca STL/3MF privado ou chave.

## Auto-revisão do plano

- Cobertura: ingestão/análise, reparo auditável, IA consentida, perfis locais, CLI/3MF, estados, UI, histórico, privacidade e build estão atribuídos às Tarefas 1–7.
- Interfaces: Selection, Recommendation, StudioProbe, SlicePlan, SliceResult e JobState são apresentados antes de seus consumidores.
- Gate de integração: a prova real do CLI ocorre antes da implementação do fatiamento e condiciona sua ativação.
- Dados sensíveis: o teste de privacidade e o workflow de build impedem envio de STL, 3MF privado e chave.
- Testes descritos no plano são instruções para a fase de implementação; nenhum teste ou código de produto foi criado nesta etapa.


## Referências técnicas usadas no plano

- [keyring — documentação e backend Windows Credential Locker](https://keyring.readthedocs.io/en/stable/)
- [Matplotlib — seleção de backend não interativo](https://matplotlib.org/stable/api/matplotlib_configuration_api.html)
- [Trimesh — simplificação quadric decimation](https://trimesh.org/trimesh.html)
- [Trimesh — instalação e dependência fast-simplification](https://trimesh.org/install.html)
- [OpenAI — Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
