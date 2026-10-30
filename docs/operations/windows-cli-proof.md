# Prova do CLI do Bambu Studio no Windows

**Estado:** prova funcional e validação do catálogo local ainda pendentes. A instalação real observada no Windows é Bambu Studio 2.8.2.61. O probe executado no commit `ac8396f8` retornou `cli_available: false`, `capabilities: []` e `profile_catalog.error_code: machine_profiles_invalid`. A ajuda direta termina com código 0 e lista opções, mas o texto não é capturado pelo probe; esta evidência não verifica fatiamento nem exportação 3MF. O commit `e3db033` atualiza o carregamento de perfis e a detecção da versão, mas ainda não foi executado no Windows do usuário.

## Dados a registrar

- Data e versão do Windows (10 22H2 x64 ou 11 x64): pendente
- Versão/build do Bambu Studio: 2.8.2.61 (tela Sobre; o cabeçalho da ajuda mostra `BambuStudio-02.08.02.61`; o probe ainda não captura essa saída)
- Caminho do executável: `C:\Program Files\Bambu Studio\bambu-studio.exe` (observado no Explorador e no comando)
- Probe Python do commit `ac8396f8`: `version: 2.8.2.61` via metadado PE, `cli_available: false`, `capabilities: []`, `profile_catalog.error_code: machine_profiles_invalid`; stdout/stderr de `--help` vieram vazios.
- Opções exibidas pela ajuda direta: `--orient`, `--arrange`, `--slice`, `--export-3mf`, `--export-stl`, `--export-stls`, `--load-settings`, `--load-filaments`, `--load_settings` e `--load_filaments`. A presença na ajuda não comprova execução funcional.
- Perfis A1 mini, bicos, Generic PLA e Textured PEI: ainda não validados. A última saída tinha `profile_catalog.available: false`, `printers: []` e `error_code: machine_profiles_invalid`.
- Hash do STL de referência (não registrar caminho nem copiar o arquivo): pendente
- Resultado exportado para 3MF e inspeção do arquivo: pendente
- Projeto reaberto no Studio; Preview e perfis conferidos pelo usuário: pendente
- Divergências, falhas e comportamento de timeout: pendente

## Executar diagnóstico

No PowerShell aberto na pasta `tools` do branch atualizado:

```powershell
Select-String -Path .\bambu_cli_probe.py -SimpleMatch '"error_code": exc.code'
$studio = Join-Path $env:ProgramFiles 'Bambu Studio\bambu-studio.exe'
python .\bambu_cli_probe.py --executable $studio
```

O diagnóstico chama somente `--version` e `--help`, sem `shell=True` e sem iniciar impressão. O JSON também resume apenas IDs allowlisted dos perfis A1 mini encontrados ao lado do executável; não lê configurações pessoais. Salve localmente a saída para revisão e compartilhe apenas o JSON, sem STL ou chave. As capacidades são nomes de opções encontradas no texto de ajuda, não prova de funcionamento.

## Prova funcional manual obrigatória

1. Confirme o executável e a versão/build instalados.
2. Leia a ajuda exibida por essa instalação e registre a sintaxe exata usada. Não copie argumentos de outra versão.
3. Use localmente o STL pequeno de referência fornecido pelo usuário. Não o envie ao GitHub, ao serviço de build ou a outro serviço.
4. Prepare a máquina A1 mini, o bico fisicamente selecionado, Generic PLA e Textured PEI Plate.
5. Execute o comando validado sem imprimir e inspecione a saída 3MF com as verificações automatizadas previstas.
6. Abra o 3MF no Bambu Studio e confira máquina, bico, filamento, placa, suportes e Preview. Registre apenas o resultado e dados não privados.
7. Marque esta prova concluída somente quando as evidências acima forem registradas. Uma execução Linux/mock não substitui esta prova.


## Estado histórico do probe antes do diagnóstico atual (2026-10-30)
A captura adicional do PowerShell ainda exibe JSON sem `profile_catalog`, portanto foi gerada por uma cópia anterior do probe; não substitui a execução da revisão atual. O código atual consegue ler strings ProductVersion/FileVersion, mas somente testes Win32 simulados foram verificados. Após atualizar a pasta `tools`, confira `profile_catalog` no JSON. Se `version` continuar nula, consulte localmente `(Get-Item $studio).VersionInfo | Format-List ProductVersion,FileVersion` e compartilhe apenas esses campos.


O código atual tenta obter ProductVersion/FileVersion do recurso PE do executável no Windows quando `--version` não retorna texto. Isso só identifica a versão declarada no próprio arquivo; não prova que o comando CLI foi capturado nem habilita fatiamento. O fallback está coberto por um teste de API Win32 simulada, e a primeira execução Windows encontrou dois imports ausentes nos testes; a correção está no commit `9012c556`, aguardando nova suíte. O último JSON fornecido pelo usuário é anterior a essa implementação, então a versão real do probe ainda não foi compartilhada.

## Evidência parcial recebida do PC do usuário (2026-10-30)

- A tela “Sobre Bambu Studio” mostrou a versão **2.8.2.61**. O Explorador e o comando do usuário identificaram o executável em `C:\Program Files\Bambu Studio\bambu-studio.exe`; a versão exata do Windows não foi registrada.
- Uma execução anterior do probe Python no diretório `tools` retornou `version: null`, `cli_available: false`, `capabilities: []` e nenhuma saída capturada a `--help`. Uma execução posterior do branch com o diagnóstico do código de saída informou `exit code 0`, mas manteve `cli_available: false` e capacidades vazias.
- Ao invocar `$studio --help 2>&1 | Select-String -SimpleMatch '--slice','--load-settings','--load-filaments','--export-3mf'`, o usuário recebeu o cabeçalho `BambuStudio-02.08.02.61`, toda a ajuda e `Exit code: 0`. A saída incluiu `--load-settings setting1.json;setting2.json`, `--load-filaments filament1.json;filament2.json`, `--slice option` e `--export-3mf filename.3mf`; a seção de prioridade também menciona formas com sublinhado. O filtro não reduziu a saída, o que sugere escrita direta no console (inferência), compatível com os pipes vazios do probe.
- A captura mais recente do PowerShell mostra a ajuda completa e `Exit code: 0`, com retorno ao prompt. Isso confirma a saída da invocação direta de `--help`, não a saída capturada pelo probe atualizado nem o funcionamento das opções.
- Não foram carregados perfis, executado slice, usado o STL Sentinel, criado/reaberto 3MF ou revisados Preview/configurações. A prova da Tarefa 1 permanece incompleta e seus checkboxes permanecem desmarcados. A imagem recebida não foi adicionada ao repositório.


## Saída de metadados Windows fornecida pelo usuário

`(Get-Item $studio).VersionInfo | Format-List ProductVersion,FileVersion` mostrou `ProductVersion` vazio e `FileVersion = 02.08.02.61`. O probe atualizado tenta ler ambos os recursos PE e tem teste Windows/mocks para FileVersion. O workflow Windows `41124225149`, no commit `d90416e`, terminou success com 180 testes e 1 warning esperado. A saída JSON compartilhada, sem `profile_catalog`, ainda não veio do script atualizado. A versão do Windows, os perfis carregados pelo probe e qualquer prova de slice/3MF permanecem pendentes.



## Execução do probe atualizado recebida do usuário (2026-10-30 17:42)

- A captura agora contém `profile_catalog`, confirmando que esta execução já usou uma versão mais recente do script do que as capturas antigas sem esse campo. O JSON reporta `version: 2.8.2.61`; a mensagem indica que ela veio dos metadados do executável Windows.
- O Studio ainda retorna `cli_available: false`, `capabilities: []` e informa que a ajuda saiu com código 0, mas sem texto em stdout/stderr capturados. A saída de ajuda direta do usuário tinha mostrado `--slice`, `--export-3mf`, `--load-settings` e `--load-filaments`. A presença dessas opções não prova que carregamento de perfis, slice ou exportação funcionam.
- `profile_catalog.available` segue `false`, com `printers: []` e a mensagem segura genérica “The installed A1 mini system profile set could not be validated.” O JSON compartilhado não contém um código de causa nem o código de saída final do probe.
- Depois dessa captura, o branch adicionou códigos de diagnóstico allowlisted no catálogo e os inclui no JSON sem caminho, nome bruto de perfil, chave ou outro dado pessoal. Essa revisão ainda não foi executada no Windows.
- A Tarefa 1 continua pendente; nenhum 3MF foi criado/reaberto, nenhum Preview foi conferido e nenhum arquivo foi impresso.



## Captura subsequente do probe — 2026-10-30, 18:05

- A nova captura do PowerShell mostra novamente `version: 2.8.2.61`, `cli_available: false`, `capabilities: []`, `profile_catalog.available: false` e `printers: []`. O JSON não inclui `profile_catalog.error_code`.
- O arquivo `tools/bambu_cli_probe.py` no branch atual já inclui o campo `error_code` allowlisted. Portanto, a imagem parece vir de uma cópia anterior do script (inferência baseada na ausência do campo); ela ainda não identifica a causa do catálogo local.
- A ajuda direta continua mostrando opções de CLI, mas isso não comprova o funcionamento do fatiamento ou a exportação/revisão de 3MF. Não foi informado o Windows instalado, nem foi usado o STL de referência nesta captura.
- Para coletar o diagnóstico da revisão atual, na pasta `tools`, confirme primeiro que `Select-String -Path .\\bambu_cli_probe.py -SimpleMatch '"error_code": exc.code'` encontra o campo; depois execute `python .\\bambu_cli_probe.py --executable $studio`. Compartilhe apenas `profile_catalog.error_code`.


## Diagnóstico atualizado recebido do usuário — 2026-10-30 18:29

- O texto do PowerShell confirmou que a cópia baixada continha o campo `error_code`.
- O executável declarou `FileVersion = 02.08.02.61`; a chamada `--version` foi rejeitada com `Invalid option --version`. A ajuda de `--help` listou opções e terminou com código 0, mas continua sem texto capturado pelo probe. Por isso `cli_available` segue falso e a lista de capacidades vazia.
- O JSON retornou `profile_catalog.error_code: machine_profiles_invalid`. Ele identifica a etapa que falhou, não revela um caminho ou conteúdo de perfil específico.
- Correção em `e3db03371a01c0b17734254c2894a377db394a68`: o catálogo agora lê apenas os perfis de modelo, máquinas necessárias para a A1 mini (0,2/0,4 mm) e Generic PLA; aceita `from` ausente no perfil de modelo da lista de sistema. O probe agora prefere a versão do recurso PE no Windows e evita executar `--version` quando essa informação já está disponível.
- Verificação local sintética após a correção: 32 testes relacionados aprovados e `compileall` sem erros. A captura enviada é anterior a esse commit, então é necessário executar o probe atualizado novamente para confirmar se o catálogo local passou.
- Nenhum STL/3MF, chave, caminho de perfil, arquivo local ou captura foi adicionado ao repositório. Nenhum slice, 3MF ou revisão no Studio foi alegado.


## Probe atualizado com catálogo A1 mini válido — 2026-10-30 18:41

- O usuário executou a cópia do branch arquivada em `298b1956` no PowerShell. O comando de verificação encontrou `"error_code": exc.code` no script, e o JSON resultante incluiu `profile_catalog.available: true`.
- A versão detectada foi `2.8.2.61`; o catálogo local reportou perfil `02.08.00.05`, modelo `Bambu Lab A1 mini`, variantes instaladas de 0,2 mm e 0,4 mm, Generic PLA correspondente, placa Textured PEI Plate, suporte `tree(auto)` e aderência `brim`.
- O comando direto `--help` exibiu no console as opções `--slice`, `--export-3mf`, `--load-settings` e `--load-filaments`. No subprocesso do probe, `--help` terminou com código 0, mas stdout/stderr ficaram vazios; por isso o JSON continua corretamente em `cli_available: false` e `capabilities: []`. O código de saída do próprio script Python não foi informado.
- Esta é a primeira evidência de descoberta bem-sucedida dos perfis instalados. Ela não demonstra execução de slice/export, integridade de 3MF Bambu, reabertura/revisão no Studio ou impressão.
- A versão/build exata do Windows continua pendente; não é possível confirmar se o PC está nos alvos Windows 10 22H2 x64 ou Windows 11 x64. O probe foi executado na instalação Windows real, mas o primeiro item da Tarefa 1 permanece aberto até confirmar alvo suportado e capturar os demais dados.
- A saída foi resumida sem registrar caminhos locais do usuário, arquivo de referência, captura de tela, STL/3MF, segredo ou histórico.
