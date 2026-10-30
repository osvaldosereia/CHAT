# Preparador inteligente para Bambu Lab A1 mini

Aplicação para receber um STL, analisar a peça com ferramentas geométricas e conhecimento versionado da Bambu Lab, recomendar a preparação e entregar um projeto que possa ser aberto no Bambu Studio. O usuário confere o resultado no slicer oficial e confirma o envio à impressora.

**Estado:** fundação e decisões do projeto; a aplicação ainda não foi implementada.  
**Branch de trabalho:** codex/bambu-a1-mini-foundation-20261029.

## Experiência desejada

1. Enviar um STL pelo navegador.
2. Receber análise da malha, vistas da peça, orientação, suportes e ajustes recomendados.
3. Baixar um 3MF e, no Windows, abrir esse projeto no Bambu Studio instalado.
4. Conferir o Preview no Bambu Studio e decidir se envia à A1 mini.

A meta é reduzir o trabalho a enviar o STL e revisar o resultado. A preparação precisa distinguir claramente entre uma recomendação da IA, um projeto configurado e um arquivo realmente fatiado e verificado pelo Bambu Studio. Não vamos afirmar que um arquivo está fatiado ou pronto para imprimir sem essa validação.

## Componentes previstos

- **GitHub:** código e documentação; GitHub Pages para a interface e GitHub Actions para tarefas de análise que excedam os limites de uma função serverless.
- **Supabase:** autenticação, arquivos privados, banco de dados, histórico, recuperação de documentação técnica e funções de coordenação.
- **API OpenAI:** interpretar imagens e métricas derivadas do STL e retornar recomendações estruturadas que o código valida.
- **Bambu Studio oficial:** abrir, fatiar ou verificar o projeto e enviar à impressora pelo fluxo oficial da Bambu.

O sistema não usará APIs privadas/reversas da Bambu. O envio à impressora continua confirmado pelo usuário no Bambu Studio. Arquivos STL, 3MF, chaves e dados de conta não serão commitados no GitHub.

## Máquina e preferências confirmadas

| Item | Configuração |
|---|---|
| Impressora | Bambu Lab A1 mini |
| Computador | Windows; versão do Studio será registrada após a instalação |
| Bicos disponíveis | 0,4 mm e 0,2 mm, trocados fisicamente |
| Material inicial | Generic PLA |
| Placa | Bambu Textured PEI Plate original |
| Prioridade | Preservar a forma, qualidade/detalhe e evitar suportes quando seguro |
| Modelo de prova | STL Sentinel Busts já enviado anteriormente; o arquivo original fica intacto |

Como a aplicação não detecta a troca física do bico, cada tarefa precisa indicar ou confirmar qual bico está instalado.

## Documentos

- [Requisitos e limites](docs/requirements.md)
- [Arquitetura e fluxo de dados](docs/architecture.md)
- [Pesquisa técnica e fontes](docs/research/technical-baseline.md)
- [Plano de execução](docs/superpowers/plans/2026-10-29-bambu-a1-mini-foundation.md)

## Próximas decisões e marcos

1. Conferir no Windows a versão oficial do Bambu Studio e provar a abertura de um 3MF local.
2. Validar orientação, suporte, fatiamento e exportação para os perfis da A1 mini com 0,4 mm e 0,2 mm.
3. Confirmar se o CLI oficial funciona com confiabilidade no ambiente automatizado. Até isso ocorrer, nenhum resultado será classificado como fatiamento verificado.
4. Criar um projeto Supabase separado para esta aplicação após confirmar a organização e o custo aplicável.
5. Implementar upload privado, análise geométrica, recomendações e interface de relatório.

## Aviso sobre visibilidade

Este repositório é público. O código e esta documentação ficam visíveis publicamente. Não adicionar STL, arquivos de clientes, segredos, tokens ou dados privados a este repositório.