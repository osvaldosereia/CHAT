# BambuPrep local para Windows — ledger de implementação

## Estado atual — 2026-10-30

- Branch: `codex/bambu-a1-mini-foundation-20261029`
- HEAD lido antes desta rodada: `d0a25f428aa8bf8bf4b5491e114e7cfbb8a227f6` (`docs: align Windows credential store naming`)
- Escopo confirmado: aplicativo local; nenhuma API remota, Supabase, upload de STL/3MF nem impressão automática.
- Primeiro item ainda bloqueado: prova real do Bambu Studio na Tarefa 1, dependente do PC Windows do usuário e do STL de referência. Diagnóstico, código e testes simulados já foram concluídos.
- Histórico/ledger anterior: o arquivo ainda não existia na branch.

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

## Tarefa 2 — trabalho independente realizado nesta rodada

- Implementados os estados do domínio e regras de transição; `slicer_verified` é terminal e somente pode ser alcançado a partir de `project_configured`.
- Implementadas configuração sob `%LOCALAPPDATA%/BambuPrep`, migração inicial SQLite versão 1, repositório com eventos de estado e exclusão do histórico sem apagar STL de origem.
- Implementado adaptador injetável de segredo; a fábrica exige Windows e backend real `WinVaultKeyring`. Não existe fallback em arquivo. O teste usa backend em memória; nenhuma chave real foi usada. Commit de código desta etapa: `262a130f821b6712492ed4980812ea7c6c89068f` (`feat: add local job storage and secure settings`).
- Adicionada dependência de runtime `keyring>=25.5,<27`. Com `keyring 25.7.0` instalada no ambiente Linux, o import `keyring.backends.Windows.WinVaultKeyring` foi confirmado; o Credential Locker real não foi exercitado.
- O teste garante que o banco não contém bytes do STL. Verificação adicional: `rg -n "logging|logger|print\\(" src/bambuprep` não encontrou logger ou saída de log no núcleo; nenhum dado é escrito em logs. Assim, a verificação do banco (sem bytes STL/segredo) e a ausência de logging concluem esta checklist.
- RED de configuração: `cd bambuprep-local && python -m pytest tests/unit/test_config.py -v` falhou na coleta porque `bambuprep.config` ainda não existia; após implementar, os três testes passaram.
- Teste prescrito da Tarefa 2: `cd bambuprep-local && python -m pytest tests/unit/test_job_transitions.py tests/unit/test_local_storage.py tests/unit/test_api_key_store.py -v` — 12 passed.
- Suíte completa: `cd bambuprep-local && python -m pytest -v` — 25 passed.
- Sintaxe: `cd bambuprep-local && python -m compileall -q src tools tests` — exit 0.

## Commits

- Commit de código e documentação: `e0009136d3695beed890e9148e68d0db72a33ab7` (`feat: add Bambu Studio CLI discovery foundation`).
- Commit de código e documentação da Tarefa 2: `262a130f821b6712492ed4980812ea7c6c89068f` (`feat: add local job storage and secure settings`). Atualizações de plano/ledger são commits descendentes de documentação.

## Bloqueios humanos indispensáveis

1. Em PC Windows suportado, executar o diagnóstico contra a instalação real e registrar versão/build, caminho e argumentos/versão efetivamente observados.
2. Disponibilizar no PC o STL Sentinel Busts de referência e criar o pequeno projeto de prova com A1 mini, bico confirmado, Generic PLA e Textured PEI.
3. Reabrir o 3MF no Bambu Studio e conferir Preview e perfis. Até essa confirmação, não declarar CLI compatível, fatiamento/3MF verificado nem `slicer_verified`.
4. Fornecer chave OpenAI somente quando o fluxo de IA estiver implementado; até lá, usar mocks e não fazer chamadas de rede.

## Próxima execução

Avançar para Tarefa 3 (ingestão e análise geométrica com fixtures sintéticas locais), sem depender do STL privado. A prova real da Tarefa 1 continua sem marcação até haver evidência no Windows.
