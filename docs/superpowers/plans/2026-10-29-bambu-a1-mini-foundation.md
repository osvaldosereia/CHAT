# Plano de execução — Preparador Bambu A1 mini

**Estado:** plano-base; código de produto ainda não iniciado.  
**Repositório:** osvaldosereia/CHAT.  
**Branch:** codex/bambu-a1-mini-foundation-20261029.

## Resultado pretendido

O usuário envia um STL e recebe análise técnica, recomendação rastreável e, quando o fatiador oficial confirmar, um 3MF que abre no Bambu Studio. O usuário confere o Preview e confirma manualmente a impressão. GitHub, Supabase e API OpenAI são as partes programáveis; Bambu Studio/Bambu Cloud continuam sendo as ferramentas oficiais de fatiamento e envio.

## Decisões fechadas

- A1 mini, Windows, bicos 0,4 mm e 0,2 mm instalados fisicamente um de cada vez.
- Generic PLA e placa Textured PEI original como padrão inicial.
- Perfil e recomendação são versionados por variante de bico.
- O STL original permanece imutável; qualquer reparo cria uma cópia auditável.
- Sem chamadas a APIs privadas da Bambu e sem iniciar impressão automaticamente.
- Branch de trabalho isolada. O repositório CHAT é público; nunca comitar dados/arquivos privados.

## Fase 0 — preparar ambientes

1. Registrar versão/build do Bambu Studio quando o usuário estiver no Windows.
2. Selecionar os perfis oficiais para A1 mini, bico físico, Generic PLA e Textured PEI.
3. Escolher entre app Windows local (sem Supabase, sem histórico online compartilhado) e app online. Para a opção online, avaliar primeiro o uso de um projeto Pro existente, sem criar instância nova por padrão.
4. Definir limites de upload, retenção, autenticação e custo OpenAI com base no STL de prova.
5. Definir licença e bibliotecas permitidas para diagnóstico/reparo geométrico.

**Saída:** configuração reproduzível e decisões de custo/licença registradas.

## Fase 1 — prova do fluxo Bambu

Usar o STL Sentinel Busts existente, sem enviar o trabalho à impressora:

1. Abrir/importar o STL no Bambu Studio Windows.
2. Criar projetos separados para bico 0,4 mm e 0,2 mm, mantendo Generic PLA e Textured PEI.
3. Comparar orientação, posição na mesa, suporte, adesão e estimativa de impressão.
4. Fatiar no slicer oficial, exportar 3MF e reabrir cada arquivo para verificar máquina, perfil, suporte e Preview.
5. Testar o CLI na mesma versão e em runner de GitHub Actions. Guardar logs sem STL ou dados pessoais.
6. Testar a abertura por protocolo a partir de uma página HTTPS e o fallback de download.
7. Registrar incompatibilidades e classificar claramente o que foi comprovado.

**Gate:** só marcar slicer_verified se a saída do CLI corresponder ao projeto revisto no Studio. Se a automação headless falhar, o MVP entrega relatório e passos precisos para revisão no Studio enquanto a estratégia de execução é revista.

## Fase 2 — base privada no Supabase

Após confirmação de custo/organização:

1. Antes de criar instância, avaliar se um projeto Supabase Pro existente pode receber um schema e bucket Bambu separados com políticas RLS próprias; usar novo projeto apenas se o custo adicional for aceito.
2. Habilitar Auth com acesso do proprietário.
3. Criar buckets privados para originais, resultados, imagens e 3MF; definir URLs assinadas e retenção.
4. Criar esquema de profile, machine settings, jobs, assets, measurements, recommendations, sources, software versions e job events.
5. Aplicar RLS a todas as tabelas expostas e validar acesso entre usuários.
6. Criar Edge Functions para criar tarefa, receber callbacks, recuperar fontes, chamar OpenAI e entregar URLs temporárias.
7. Configurar segredos de OpenAI e credencial de menor escopo para disparar o workflow.

**Saída:** upload e tarefa com proprietário e estados rastreáveis.

## Fase 3 — worker geométrico

1. Comparar bibliotecas locais para parse STL, análise topológica, espessuras, balanços, reparo conservador e renderização.
2. Fixar ferramenta/versão/licença no repositório.
3. Validar tamanho, formato binário/ASCII, hash, bounds, unidade presumida e contagem de triângulos.
4. Detectar malhas abertas, normais, faces degeneradas/duplicadas, componentes, detalhes pequenos e geometrias ambíguas.
5. Renderizar vistas e mapas de regiões relevantes.
6. Fazer worker idempotente em GitHub Actions e remover dados temporários ao concluir.
7. Persistir métricas e imagens no Storage privado e atualizar os estados da tarefa.

**Gate:** casos ambíguos viram needs_review ou blocked; sem escala/reparo silencioso.

## Fase 4 — especialista OpenAI e conhecimento

1. Ingerir manual A1 mini, presets e documentação oficiais com versão, origem e hash.
2. Indexar trechos selecionados em Supabase pgvector.
3. Enviar à API OpenAI somente métricas, imagens da peça, configuração selecionada e contexto recuperado.
4. Exigir resposta JSON com enumerações e campos permitidos.
5. Validar valores com código contra a versão do perfil Bambu Studio; recusar inventados ou incompatíveis.
6. Gerar relatório com nome exato do campo, valor, caminho no Studio, justificativa, fontes e confiança.

## Fase 5 — projeto 3MF e interface

1. Criar site responsivo com login, cadastro inicial da máquina, upload, progresso, histórico e relatório.
2. Permitir seleção/confirmar bico em cada tarefa; material e placa padrão ficam visíveis.
3. Produzir 3MF via CLI oficial somente após o Gate da Fase 1 passar.
4. Exibir botões Baixar 3MF e Abrir no Bambu Studio; usar URL HTTPS assinada curta.
5. Mostrar tipo de saída: recommendation_only, project_configured, slicer_verified, needs_review, blocked ou failed.
6. Não permitir enviar à impressora a partir do site.

## Fase 6 — validação operacional e lançamento

- Percorrer o STL de prova com os dois bicos sem impressão física.
- Verificar permissões e isolamento entre tarefas/usuários, expiração de URLs, limites de upload e limpeza de runner.
- Comparar relatório, saída OpenAI, perfil efetivo no 3MF e Preview.
- Medir tempo, custo por tarefa e falhas; ajustar retenção e limites.
- Habilitar GitHub Pages e configurar produção somente após a validação.

## Dependências e bloqueios atuais

- A versão do Bambu Studio não impede a documentação; é necessária para a prova do CLI e do 3MF no Windows.
- A rota online exige backend e armazenamento privados; criar projeto Supabase adicional pode cobrar compute mensal. Avaliar um projeto existente ou escolher a rota local antes do provisionamento.
- GitHub Pages é estático, não fornece backend, e não é presumido como hospedagem de produção do app.
- O repositório é público, então código, prompts e documentação serão públicos.
- A ligação direta com o Studio abre o arquivo; não é automação de cliques ou controle da impressora.
- Não incluir arquivos STL/3MF nem segredos no GitHub.