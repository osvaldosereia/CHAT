# BambuPrep

Protótipo local para analisar arquivos STL e mostrar uma recomendação opcional antes da revisão manual no Bambu Studio. A geração de projeto 3MF e o fatiamento ainda não estão implementados.

Leia o [guia do protótipo local](docs/user-guide.md) para configurar e usar a análise local, entender o consentimento OpenAI e apagar ou proteger o histórico.

O diagnóstico de CLI pode ser executado sem interface ou impressão:

```powershell
python tools/bambu_cli_probe.py --executable "C:\Program Files\Bambu Studio\bambu-studio.exe"
```

Um resultado positivo apenas descreve opções observadas na ajuda local. A compatibilidade de fatiamento só poderá ser declarada após a prova manual documentada em `docs/operations/windows-cli-proof.md`.
