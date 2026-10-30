# Prova do CLI do Bambu Studio no Windows

**Estado:** prova funcional e leitura dos perfis locais pelo probe pendentes. A instalação real observada no Windows é Bambu Studio 2.8.2.61, em `C:\Program Files\Bambu Studio\bambu-studio.exe`. A ajuda direta termina com código 0 e mostra as opções, mas o último JSON compartilhado ainda retorna `version: null`, `cli_available: false` e `capabilities: []`, sem capturar stdout/stderr. A versão atual da branch acrescenta `profile_catalog` ao JSON, mas o usuário ainda precisa executar esse probe atualizado. Não declarar compatibilidade de CLI, fatiamento ou 3MF verificado.

## Dados a registrar

- Data e versão do Windows (10 22H2 x64 ou 11 x64): pendente
- Versão/build do Bambu Studio: 2.8.2.61 (tela Sobre; o cabeçalho da ajuda mostra `BambuStudio-02.08.02.61`; o probe ainda não captura essa saída)
- Caminho do executável: `C:\Program Files\Bambu Studio\bambu-studio.exe` (observado no Explorador e no comando)
- Probe Python atualizado: `version: null`, `cli_available: false`, `capabilities: []`; `--help` reporta código 0, mas a saída capturada é vazia.
- Opções exibidas pela ajuda direta: `--orient`, `--arrange`, `--slice`, `--export-3mf`, `--export-stl`, `--export-stls`, `--load-settings`, `--load-filaments`, `--load_settings` e `--load_filaments`. A presença na ajuda não comprova execução funcional.
- Perfis A1 mini, bico usado, Generic PLA e Textured PEI encontrados pelo probe: pendente. O campo novo `profile_catalog` lista somente IDs allowlisted e valores de bico/opções oficiais; ainda não foi executado no PC.
- Hash do STL de referência (não registrar caminho nem copiar o arquivo): pendente
- Resultado exportado para 3MF e inspeção do arquivo: pendente
- Projeto reaberto no Studio; Preview e perfis conferidos pelo usuário: pendente
- Divergências, falhas e comportamento de timeout: pendente

## Executar diagnóstico

No PowerShell aberto na pasta `tools` do branch atualizado:

```powershell
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


## Estado do probe no branch atual (2026-10-30)
A captura adicional do PowerShell ainda exibe JSON sem `profile_catalog`, portanto foi gerada por uma cópia anterior do probe; não substitui a execução da revisão atual. O código atual consegue ler strings ProductVersion/FileVersion, mas somente testes Win32 simulados foram verificados. Após atualizar a pasta `tools`, confira `profile_catalog` no JSON. Se `version` continuar nula, consulte localmente `(Get-Item $studio).VersionInfo | Format-List ProductVersion,FileVersion` e compartilhe apenas esses campos.


O código atual tenta obter ProductVersion/FileVersion do recurso PE do executável no Windows quando `--version` não retorna texto. Isso só identifica a versão declarada no próprio arquivo; não prova que o comando CLI foi capturado nem habilita fatiamento. O fallback está coberto por um teste de API Win32 simulada, e a primeira execução Windows encontrou dois imports ausentes nos testes; a correção está no commit `9012c556`, aguardando nova suíte. O último JSON fornecido pelo usuário é anterior a essa implementação, então a versão real do probe ainda não foi compartilhada.

## Evidência parcial recebida do PC do usuário (2026-10-30)

- A tela “Sobre Bambu Studio” mostrou a versão **2.8.2.61**. O Explorador e o comando do usuário identificaram o executável em `C:\Program Files\Bambu Studio\bambu-studio.exe`; a versão exata do Windows não foi registrada.
- Uma execução anterior do probe Python no diretório `tools` retornou `version: null`, `cli_available: false`, `capabilities: []` e nenhuma saída capturada a `--help`. Uma execução posterior do branch com o diagnóstico do código de saída informou `exit code 0`, mas manteve `cli_available: false` e capacidades vazias.
- Ao invocar `$studio --help 2>&1 | Select-String -SimpleMatch '--slice','--load-settings','--load-filaments','--export-3mf'`, o usuário recebeu o cabeçalho `BambuStudio-02.08.02.61`, toda a ajuda e `Exit code: 0`. A saída incluiu `--load-settings setting1.json;setting2.json`, `--load-filaments filament1.json;filament2.json`, `--slice option` e `--export-3mf filename.3mf`; a seção de prioridade também menciona formas com sublinhado. O filtro não reduziu a saída, o que sugere escrita direta no console (inferência), compatível com os pipes vazios do probe.
- A captura mais recente do PowerShell mostra a ajuda completa e `Exit code: 0`, com retorno ao prompt. Isso confirma a saída da invocação direta de `--help`, não a saída capturada pelo probe atualizado nem o funcionamento das opções.
- Não foram carregados perfis, executado slice, usado o STL Sentinel, criado/reaberto 3MF ou revisados Preview/configurações. A prova da Tarefa 1 permanece incompleta e seus checkboxes permanecem desmarcados. A imagem recebida não foi adicionada ao repositório.


## Saída de metadados Windows fornecida pelo usuário

`(Get-Item $studio).VersionInfo | Format-List ProductVersion,FileVersion` mostrou `ProductVersion` vazio e `FileVersion = 02.08.02.61`. O probe atualizado tenta ler ambos os recursos PE e tem teste Windows/mocks para FileVersion, aguardando CI no commit `d90416e`. A saída JSON compartilhada, sem `profile_catalog`, ainda não veio do script atualizado. A versão do Windows, os perfis carregados pelo probe e qualquer prova de slice/3MF permanecem pendentes.

