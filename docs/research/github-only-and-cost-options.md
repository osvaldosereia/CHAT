# GitHub-only e custos — opções para o projeto

Pesquisa de produto e custos em 30 de outubro de 2026. Preços, limites e termos mudam; revalidar antes do lançamento.

## Resposta curta

**Só GitHub pode guardar o código e executar parte do processamento, mas não atende sozinho ao produto online desejado.** Para não ter Supabase, transforme a experiência em um app Windows local. Para enviar STL de qualquer lugar a um site privado com histórico, é necessário algum backend e armazenamento privado. GitHub Pages não é banco nem backend e o token da OpenAI não pode ficar no JavaScript do navegador.

## Opções

| Opção | Supabase | Uso de qualquer lugar | Arquivos privados/histórico | Avaliação |
|---|---:|---|---|---|
| App local Windows + Bambu Studio + OpenAI | Não | Instalar o app e o Studio em cada computador usado | Mantidos no próprio computador | Melhor rota para eliminar uma nova cobrança mensal |
| App online + projeto Supabase Pro existente | Não cria projeto novo | Sim | Sim, com Storage privado e RLS | Melhor equilíbrio se acesso remoto e histórico forem prioridade |
| Site GitHub Pages + Actions + arquivos no GitHub/LFS | Não | Parcial, com limitações | Não é um backend/storage de aplicação apropriado | Não recomendado como produto real |

## O que GitHub Pro cobre

- GitHub Pages serve HTML/CSS/JavaScript estáticos; não executa backend. A documentação diz que Pages está disponível em repositórios privados no Pro, mas o site publicado continua público.
- GitHub Actions consegue executar tarefas. Para repositório público, runners padrão hospedados são gratuitos; em repo privado, a conta Pro tem uso incluído e cobranças podem surgir após a franquia.
- O uso incluído documentado para Pro é US$ 18/mês de computação do Actions e 1 GB de armazenamento de Actions. Isso é quota de execução/artifacts, não armazenamento permanente para os STL enviados pelos usuários.
- Git LFS no Pro inclui 10 GiB de armazenamento e 10 GiB de banda de download. Uploads repetidos contam o arquivo inteiro por versão; excedentes podem ser cobrados se não houver budget de bloqueio.
- GitHub impõe limite de 100 MiB para um objeto comum no repositório. O STL de prova tem cerca de 90,3 MB, abaixo desse teto, mas colocá-lo no histórico do Git ou em LFS transformaria cada modelo/versão em dado do repositório e consumiria quota/banda.
- Um workflow manual recebe inputs declarados e pode ser acionado pela UI/API; o GitHub CLI também aceita um arquivo como valor de input. Isso não equivale a uma tela web segura de upload, fila, autorização e histórico privado.

Fontes GitHub:
- [GitHub Pages: hospedagem estática e planos](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Limites e termos de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Termos para recursos adicionais, seção Pages](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features)
- [Actions: cobrança e uso](https://docs.github.com/en/actions/concepts/billing-and-usage)
- [Uso incluído no GitHub Pro](https://docs.github.com/en/billing/reference/product-usage-included)
- [Cobrança do Git LFS](https://docs.github.com/en/billing/concepts/product-billing/git-lfs)
- [Limites de tamanho de arquivos](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)
- [Acionamento manual de workflows e inputs de arquivo via CLI](https://docs.github.com/pt/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

## Sem Supabase: aplicativo local

A versão local pode manter o fluxo de análise sem criar banco ou site online:

1. App Windows recebe o STL do disco.
2. Ferramentas locais calculam geometria e criam vistas.
3. App chama OpenAI com métricas/imagens, mantendo a chave fora do navegador.
4. Bambu Studio/CLI instalado prepara ou verifica o projeto, após a prova técnica.
5. Relatório e arquivos de saída são gravados em pastas locais.

GitHub pode armazenar o código e distribuir releases. Os únicos custos variáveis relevantes passam a ser OpenAI API e eventual uso de GitHub Actions, se for usado processamento na nuvem. Essa opção não oferece upload remoto para uma instância única nem sincroniza o histórico entre dispositivos. Instalar o app em outro computador mantém o processamento local naquele computador.

## Para continuar online sem criar outra instância Supabase

A conta do usuário tem uma organização Supabase Pro com projetos de outros sistemas. O caminho de menor custo fixo é **não criar projeto agora** e avaliar, por leitura, qual projeto tem recursos/risco adequados para receber tabelas em schema separado, bucket privado e políticas RLS exclusivas.

Isso não equivale a isolamento por projeto: o banco, recursos de compute, funções, quotas de armazenamento e egress ficam na mesma instância/organização. Antes de qualquer mudança deve-se inspecionar schema, funções, uso de Storage e políticas existentes, e escolher um projeto de baixo risco. O isolamento adicional exige disciplina de migrations, RLS e nomes de bucket. Se não houver um projeto seguro para compartilhar, usar o app local ou então aceitar um projeto dedicado.

A página oficial do Supabase informa atualmente que o Pro começa em US$ 25/mês, inclui créditos de compute para um projeto Micro e projetos adicionais começam em cerca de US$ 10/mês. Custo real depende dos créditos já consumidos e do uso. A organização também soma quotas de armazenamento e tráfego entre projetos.

O Free não é um atalho robusto para o arquivo de prova: a página atual lista upload máximo de 50 MB e 1 GB de Storage; o Sentinel de prova tem cerca de 90,3 MB. Projetos Free também podem ser pausados após uma semana de baixa atividade. Esses limites não impedem um protótipo menor, mas não cobrem esse modelo sem compressão/segmentação e sem aceitar pausas.

Fontes Supabase:
- [Preços e limites por plano](https://supabase.com/pricing)
- [Cobrança e compute por projeto](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Perguntas de cobrança e custo de projetos adicionais](https://supabase.com/docs/guides/platform/billing-faq)
- [Pausa automática de projetos Free](https://supabase.com/docs/guides/platform/free-project-pausing)

## Recomendação para este projeto

- **Se a prioridade for zero mensalidade nova:** construir primeiro um app Windows local, usar Bambu Studio instalado e manter STL/3MF/histórico no PC. Supabase fica fora.
- **Se a prioridade for usar pelo navegador de qualquer lugar:** não criar projeto Supabase novo ainda. Primeiro fazer inspeção somente de leitura dos projetos Pro existentes e das quotas; caso haja um projeto seguro, adicionar um módulo isolado nele e monitorar uso.
- **Não colocar STL no GitHub.** O repositório CHAT é público e os limites do Git/LFS fazem dele um lugar inadequado para uploads privados e temporários.

A escolha final de produto depende de qual requisito tem prioridade: uso online com histórico centralizado ou zero novo custo mensal com execução local.