# Prova do CLI do Bambu Studio no Windows

**Estado:** observação parcial no PC Windows do usuário em 2026-10-30; prova funcional pendente. A tela Sobre mostrou Bambu Studio 2.8.2.61, o executável foi identificado em `C:\Program Files\Bambu Studio\bambu-studio.exe` e uma execução direta de `--help` no PowerShell exibiu a ajuda e terminou com código 0. Um probe de uma cópia anterior retornou `cli_available=false`; o probe atualizado com captura sem console ainda precisa ser executado. Não declarar compatibilidade de CLI, fatiamento ou 3MF verificado.

## Dados a registrar

- Data e versão do Windows (10 22H2 x64 ou 11 x64): pendente
- Versão/build do Bambu Studio: 2.8.2.61 (observada na tela Sobre; sem saída de versão capturada pelo probe)
- Caminho do executável: `C:\Program Files\Bambu Studio\bambu-studio.exe` (observado no Explorador e no comando)
- Ajuda direta no PowerShell: `bambu-studio.exe --help`, código de saída 0. Probe do branch atualizado: pendente.
- Opções exibidas pela ajuda direta: `--orient`, `--arrange`, `--slice`, `--export-3mf`, `--export-stl`, `--export-stls`, `--load_settings` e `--load_filaments`. A presença na ajuda não comprova execução funcional.
- Perfis A1 mini, bico usado, Generic PLA e Textured PEI encontrados: pendente
- Hash do STL de referência (não registrar caminho nem copiar o arquivo): pendente
- Resultado exportado para 3MF e inspeção do arquivo: pendente
- Projeto reaberto no Studio; Preview e perfis conferidos pelo usuário: pendente
- Divergências, falhas e comportamento de timeout: pendente

## Executar diagnóstico

No PC Windows com Bambu Studio instalado, a partir da pasta do aplicativo:

```powershell
python tools/bambu_cli_probe.py --executable "C:\caminho\para\BambuStudio.exe"
```

O diagnóstico chama somente `--version` e `--help`, sem `shell=True` e sem iniciar impressão. Salve localmente a saída JSON para revisão; não inclua caminhos de arquivos privados ou o STL no repositório. As capacidades são nomes de opções encontradas no texto de ajuda, não prova de funcionamento.

## Prova funcional manual obrigatória

1. Confirme o executável e a versão/build instalados.
2. Leia a ajuda exibida por essa instalação e registre a sintaxe exata usada. Não copie argumentos de outra versão.
3. Use localmente o STL pequeno de referência fornecido pelo usuário. Não o envie ao GitHub, ao serviço de build ou a outro serviço.
4. Prepare a máquina A1 mini, o bico fisicamente selecionado, Generic PLA e Textured PEI Plate.
5. Execute o comando validado sem imprimir e inspecione a saída 3MF com as verificações automatizadas previstas.
6. Abra o 3MF no Bambu Studio e confira máquina, bico, filamento, placa, suportes e Preview. Registre apenas o resultado e dados não privados.
7. Marque esta prova concluída somente quando as evidências acima forem registradas. Uma execução Linux/mock não substitui esta prova.


## Evidência parcial recebida do PC do usuário (2026-10-30)

- A tela “Sobre Bambu Studio” mostrou a versão **2.8.2.61**. O Explorador e o comando do usuário identificaram o executável em `C:\Program Files\Bambu Studio\bambu-studio.exe`; a versão exata do Windows não foi registrada.
- O usuário executou `python .\bambu_cli_probe.py --executable "$env:ProgramFiles\Bambu Studio\bambu-studio.exe"` na pasta `tools`. O JSON observado foi `version: null`, `cli_available: false`, `capabilities: []` e a mensagem de que o CLI não retornou resposta capturável a `--help`.
- Ao invocar `--help` diretamente pelo PowerShell, a ajuda foi exibida no console. As capturas mostram `--orient`, `--arrange`, `--slice`, `--export-3mf`, `--export-stl` e `--export-stls`; a prioridade de configurações menciona `--load_settings` e `--load_filaments` com sublinhados. Um filtro `Select-String` não filtrou a saída.
- A captura mais recente do PowerShell mostra a ajuda completa e `Exit code: 0`, com retorno ao prompt. Isso confirma a saída da invocação direta de `--help`, não a saída capturada pelo probe atualizado nem o funcionamento das opções.
- Não foram carregados perfis, executado slice, usado o STL Sentinel, criado/reaberto 3MF ou revisados Preview/configurações. A prova da Tarefa 1 permanece incompleta e seus checkboxes permanecem desmarcados. A imagem recebida não foi adicionada ao repositório.
