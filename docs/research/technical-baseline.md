# Pesquisa técnica — linha de base

Data da pesquisa principal: 29–30 de outubro de 2026. Este documento resume as decisões que guiam a primeira prova. Revalidar versões e documentação oficial na implementação.

## A1 mini e presets

- Volume nominal da A1 mini: 180 × 180 × 180 mm.
- A Bambu oferece variantes oficiais A1 mini com bico de 0,4 mm e 0,2 mm.
- Presets de máquina, processo e filamento variam por versão; devem ser fixados à release instalada, não copiados de branch mutable sem identificação.
- Placa escolhida pelo usuário: Textured PEI Plate original. No Studio, placa significa chapa removível de construção.
- Material: Generic PLA até o usuário definir marca/perfil específico.
- Troca física de bico não é dedutível do STL nem confiavelmente detectável pela automação atual; confirmar a variante por tarefa.

Fontes:
- [Perfis oficiais Bambu Studio](https://github.com/bambulab/BambuStudio/tree/master/resources/profiles/BBL)
- [Matriz CLI oficial](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/cli_config.json)
- [Guia rápido oficial da A1 mini](https://cdn1.bambulab.com/documentation/quick-start-f507128172bdf/Quick%20start%20guide%20-%20A1%20mini-EN.pdf)
- [A1 mini e placa Textured PEI incluída](https://bambulab-eu.myshopify.com/products/a1-mini)

## Bambu Studio como fatiador

A documentação do CLI menciona carregar perfis, orientar o modelo, organizar na mesa, fatiar e exportar 3MF. Issues oficiais registram limitações/erros em Windows, headless e passagem de metadados. Isso torna obrigatória uma prova na versão instalada. Até ela passar, a aplicação pode recomendar e explicar, mas não pode declarar o resultado como fatiamento verificado.

Fontes:
- [Command Line Usage](https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage)
- [Docker Run Guide](https://github.com/bambulab/BambuStudio/wiki/Docker-Run-Guide)
- [Releases oficiais](https://github.com/bambulab/BambuStudio/releases)
- [Issue CLI Windows](https://github.com/bambulab/BambuStudio/issues/9802)
- [Issue CLI headless](https://github.com/bambulab/BambuStudio/issues/10402)
- [Issue de metadados CLI](https://github.com/bambulab/BambuStudio/issues/11559)

## Abrir o projeto no Studio local

O fluxo oficial MakerWorld oferece abrir um projeto no Bambu Studio. A pesquisa encontrou o protocolo do desktop Windows bambustudio://open?file=<URL HTTPS codificada> para arquivo remoto 3MF; manipulador pode pedir confirmação de abertura ou domínio. Importação de STL local é suportada pelo Studio, mas o handler remoto é voltado a 3MF. O protocolo não oferece controle remoto para alterar os campos da interface nem clicar em Print.

Fontes:
- [Manual MakerWorld com Open in Bambu Studio](https://csm.bblcdn.com/hub/4668d0ca43994ff3bff4b37f1a65c2e7.pdf)
- [Issue do protocolo remoto e suporte a 3MF](https://github.com/bambulab/BambuStudio/issues/11422)
- [Diferenças de handler Windows/macOS](https://github.com/bambulab/BambuStudio/issues/9543)

## Bambu Cloud e acesso fora de casa

O Studio é o slicer desktop oficial. Bambu Cloud, MakerWorld e Bambu Handy compõem fluxos online separados; não foi identificada uma versão web genérica do Bambu Studio que aceite qualquer STL privado e substitua a aplicação desktop. A A1 mini pode receber envio remoto via conta Bambu/Cloud quando estiver online e vinculada. O PC doméstico não precisa servir de relay apenas para essa rota. LAN-only não oferece o mesmo envio pela nuvem.

A primeira versão deve abrir o projeto no Studio que o usuário está usando e deixar o Studio autenticado executar o fluxo oficial. Não implementar chamadas a APIs privadas/reversas de impressão.

Fontes:
- [Fluxo MakerWorld/Bambu Handy e cloud slicing](https://blog.bambulab.com/makerworld-one-step-printing/)
- [Segurança e acesso ao Bambu Cloud](https://blog.bambulab.com/setting-the-record-straight-on-cloud-access-and-community/)
- [Security White Paper da Bambu Lab](https://cdn1.bambulab.com/trust-center/file/bambulab-security-whitepaper-en.pdf)
- [Autorização de operações críticas no firmware](https://blog.bambulab.com/firmware-update-introducing-new-authorization-control-system-2/)

## GitHub, Supabase e OpenAI

- GitHub Pages é candidato para servir a interface estática; GitHub Actions é candidato para análise assíncrona e potencial execução do CLI. A idoneidade do CLI no runner precisa de prova.
- Edge Functions não devem processar malhas grandes; usam validação, coordenação, links temporários, recuperação de contexto e chamada OpenAI.
- Supabase Storage privado armazena arquivos. Postgres e RLS controlam tarefas e dados. pgvector recupera documentação técnica versionada.
- A API OpenAI não deve receber STL bruto esperando compreensão geométrica. O caminho escolhido extrai métricas e imagens localmente no worker e envia estes derivados em entrada estruturada/visual.
- Recomendação retorna JSON/schema limitado; código valida todos os campos com perfil oficial.

Fontes:
- [Limites de Supabase Edge Functions](https://supabase.com/docs/guides/functions/limits)
- [Uploads retomáveis do Supabase Storage](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- [Segurança do Supabase Storage](https://supabase.com/docs/guides/storage/security/access-control)
- [pgvector no Supabase](https://supabase.com/docs/guides/database/extensions/pgvector)
- [OpenAI: entrada de arquivos](https://developers.openai.com/api/docs/guides/file-inputs)
- [OpenAI: imagens e visão](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI: saídas estruturadas](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Limites de GitHub Actions](https://docs.github.com/en/actions/reference/limits)
- [Runners hospedados pelo GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

## Arquivo de prova

O modelo selecionado é Meshy_AI_Sentinel_Busts_20261029_generate.stl, já recebido. A leitura anterior do binário registrou aproximadamente 90,3 MB, 1,8 milhão de triângulos e dimensões 42,64 × 27,46 × 60 mm. Não incluir o modelo no GitHub. É um bom caso para dimensionar upload e análise de malha densa.

## Premissas que ainda precisam de prova

1. O 3MF preparado abre no Bambu Studio Windows pelo protocolo com URL temporária do Supabase.
2. A versão estável instalada aceita o perfil A1 mini e faz slice/export pelo CLI no ambiente automatizado escolhido.
3. Os metadados exportados correspondem ao bico e ao preset esperado e o Preview é igual ao projeto local.
4. A rota de envio remoto funciona com a conta e configuração de Cloud reais do usuário.
5. Limites de tamanho, timeout e retenção são adequados ao modelo de prova e aos uploads futuros.

Se alguma dessas premissas falhar, registrar o fallback e mostrar o limite na interface; não ocultar a diferença.