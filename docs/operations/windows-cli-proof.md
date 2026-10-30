# Prova do CLI do Bambu Studio no Windows

**Estado:** pendente — nenhum Windows com instalação real e nenhum STL Sentinel Busts estão disponíveis nesta execução. Não declarar compatibilidade de CLI, fatiamento ou 3MF verificado antes de concluir esta prova.

## Dados a registrar

- Data e versão do Windows (10 22H2 x64 ou 11 x64): pendente
- Versão/build do Bambu Studio: pendente
- Caminho do executável: pendente
- Comando de diagnóstico executado e código de saída: pendente
- Argumentos de CLI confirmados pela ajuda desta instalação: pendente
- Perfis A1 mini, bico usado, Generic PLA e Textured PEI encontrados: pendente
- Hash do STL de referência (não registrar caminho nem copiar o arquivo): pendente
- Resultado exportado para 3MF e inspeção do arquivo: pendente
- Projeto reaberto no Studio; Preview e perfis conferidos pelo usuário: pendente
- Divergências, falhas e comportamento de timeout: pendente

## Executar diagnóstico

No PC Windows com Bambu Studio instalado, a partir da pasta do aplicativo:

```powershell
python tools/bambu_cli_probe.py --executable "C:\\caminho\\para\\BambuStudio.exe"
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
