# BambuPrep — guia do protótipo local

> **Estado:** protótipo em desenvolvimento. O código de interface ainda aguarda QA visual em Windows e a compatibilidade com a instalação local do Bambu Studio não foi comprovada. Este guia não declara que um STL foi fatiado, aberto no Studio ou validado para impressão.

## Executar a partir do código

O protótipo foi desenhado para Windows 10 22H2 x64 e Windows 11 x64. Em um ambiente de desenvolvimento com Python 3.11 ou superior:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".[test]"
python -m bambuprep
```

Na primeira execução, selecione o `BambuStudio.exe` instalado. O caminho absoluto escolhido fica em `%LOCALAPPDATA%\BambuPrep\preferences.json`; se o seletor for cancelado, o app tenta reutilizar o caminho salvo quando o executável ainda existir. O catálogo procura os perfis ao lado desse executável.

Em **Configurações locais**, também é possível guardar uma pasta de saída preferida. Ela fica nas preferências locais e não é usada para gerar arquivos enquanto o fatiamento/3MF não estiver habilitado.

A leitura dos perfis instalados serve para oferecer opções locais. Ela não testa nem declara compatibilidade do CLI, do fatiamento ou de um arquivo 3MF com o Bambu Studio.

## Analisar um STL

1. Escolha um arquivo `.stl` local pelo botão ou arraste um único STL existente para a janela. O histórico registra o caminho e o hash; o aplicativo não copia os bytes do STL para o banco.
2. Escolha a variante do bico e confirme fisicamente que esse bico está instalado. O BambuPrep não detecta trocas físicas.
3. Confira o Generic PLA e a placa apresentados pelo catálogo local.
4. Clique em **Analisar localmente**. A janela mostra dimensões interpretadas como milímetros, contagens e avisos. STL não guarda unidade confiável; escala suspeita exige revisão.
5. Revise o relatório e as vistas Frente, Lado, Topo e Riscos. As vistas são renderizadas localmente e mantidas em memória para a janela.

As estimativas de orientação, balanço e contato não garantem resultado físico. O original não é alterado.

## Recomendação OpenAI opcional

Em **Configurações locais**, digite a chave individual. O campo é mascarado; a chave é salva apenas no Windows Credential Locker e nunca no arquivo de preferências, SQLite ou logs. Se o Credential Locker não estiver disponível, a análise local permanece disponível e a recomendação é desativada.

Cada tentativa de recomendação abre uma confirmação nova, com **Não** como padrão. Se você permitir aquele trabalho, a solicitação envia métricas derivadas e as quatro imagens renderizadas; essas vistas podem revelar o formato da peça. O STL bruto, nome/caminho do arquivo e histórico local não são enviados no payload. O uso da API pode ser cobrado separadamente do ChatGPT Plus. Sem consentimento explícito ou chave válida, nenhuma chamada ocorre.

## Histórico e limites atuais

**Apagar histórico local** pede confirmação e remove os registros de trabalhos do SQLite em `%LOCALAPPDATA%\BambuPrep\bambuprep.sqlite3`. A ação não apaga os STL originais nem arquivos escolhidos pelo usuário.

Para preservar o histórico, feche o aplicativo e copie a pasta `%LOCALAPPDATA%\BambuPrep` para um backup local protegido. Ela pode conter caminhos de arquivos e métricas privadas; não a envie ao GitHub. O backup não inclui os STL originais.

Este protótipo ainda não gera projeto 3MF, não chama o slicer, não abre um resultado no Bambu Studio e não envia impressão. A prova do CLI deve ser feita com a instalação real do Windows e o STL Sentinel local antes de implementar ou declarar compatibilidade de fatiamento. O usuário sempre continua responsável por revisar o Preview e iniciar qualquer impressão manualmente.

Para executar a suíte local:

```powershell
python -m pytest -v
```

Os testes de janela Qt são habilitados quando PySide6 está instalado. Em ambientes sem Qt eles são ignorados; isso não conta como validação visual.
