# Release checklist — rascunho de licenças e avisos

**Estado:** aberto. Este inventário é uma leitura inicial de metadados do ambiente travado, não uma conclusão jurídica nem autorização para distribuir. Nenhum release está autorizado nesta etapa.

## Inventário preliminar do ambiente de build

A coleta foi feita em 30/10/2026 no ambiente Linux x86_64 criado com `uv run --locked --extra build`. As expressões abaixo vêm dos metadados das distribuições instaladas. A primeira compilação standalone após a correção do nome foi concluída em runner GitHub Actions Windows Server 2025 (run 41036004359, commit 690ab902), com varredura por extensões de dados locais. Uma execução posterior (run 41046396800, commit 106465fd2fb91c10fd201c0e59c59b7e2bae750f) concluiu a auditoria standalone: o log contém inventário de 922 arquivos relativos e 209.267.185 bytes, incluindo `BambuPrep.exe` com 63.209.984 bytes e SHA-256 `772154dce5d9c5239de1bd5da41c5132ba56e02fd781080927a79c779070b777`. O scanner percorreu os arquivos do bundle, rejeitou as extensões cobertas de STL/3MF/histórico/credenciais e procurou tokens com formato OpenAI `sk-`; sucesso indica que nenhum item coberto foi encontrado. Nenhum artifact transferível foi anexado. O inventário não contém `*.dist-info/METADATA`, portanto não mapeia módulos binários/plugins/fontes incluídos para suas licenças e não é um SBOM. A build do commit de código atual 4054ee9 ainda está em andamento (run 41054439734); este relatório não substitui a inspeção do bundle dessa revisão. A revisão efetiva de componentes/licenças continua aberta.

| Distribuição travada | Versão observada | Metadado de licença observado | Próxima verificação |
|---|---:|---|---|
| PySide6, PySide6_Addons, PySide6_Essentials, PySide6_Pdf, PySide6_WebEngine e shiboken6 | 6.12.0 (Pdf/WebEngine 6.12.0.140) | LGPL-3.0-only OR GPL-2.0-only OR GPL-3.0-only | Inventariar módulos Qt e plugins efetivamente incluídos; separar os componentes sob GPL e terceiros; incluir os textos/avisos e cumprir as condições da licença escolhida. |
| trimesh | 4.12.2 | MIT | Incluir aviso e licença se presente no bundle. |
| NumPy | 2.5.4 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | Conferir avisos das partes distribuídas e respectivos textos. |
| Matplotlib | 3.11.2 | PSF License | Incluir o texto de licença e avisos de dados/fontes efetivamente distribuídos. |
| fast_simplification | 0.2.0 | MIT | Incluir aviso e licença se presente no bundle. |
| keyring | 25.7.0 | MIT | Incluir aviso e licença se presente no bundle. |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause | Verificar bibliotecas nativas e avisos incluídos. |
| Pillow | 13.0.0 | MIT-CMU | Verificar bibliotecas e componentes opcionais incluídos. |
| Nuitka (dependência de build) | 4.3.1 | GNU Affero General Public License v3 | Confirmar que o compilador e seus arquivos não são redistribuídos no pacote final; avaliar separadamente se forem. |
| Outras dependências travadas | ver uv.lock | incluem BSD-3-Clause, MIT, Apache-2.0, Apache/BSD e dual BSD/Apache | Gerar inventário completo do bundle final e anexar todos os textos/avisos exigidos. |

O projeto declara atualmente `Proprietary - personal project` nos metadados. Essa declaração não é uma licença de distribuição final; a licença do próprio BambuPrep precisa ser decidida antes de publicar qualquer pacote ou código com termos diferentes.

## Gates antes de qualquer distribuição

- [ ] Construir o pacote Windows standalone e listar todos os arquivos, DLLs, plugins Qt, fontes e dados incluídos.
- [ ] Gerar SBOM/inventário de licenças a partir do bundle efetivo e relacioná-lo ao uv.lock.
- [ ] Conferir os termos do Qt para os componentes efetivamente incluídos. Qt for Python oferece Community Edition sob LGPLv3/GPLv3 e uma edição comercial; componentes específicos e bibliotecas de terceiros podem ter termos próprios.
- [ ] Decidir e registrar a licença do BambuPrep e o modelo de distribuição.
- [ ] Incluir NOTICE/LICENSe texts e informações necessárias para que o destinatário identifique/reconstrua componentes licenciados quando aplicável.
- [ ] Verificar que Nuitka e ferramentas de build não foram copiadas ao bundle runtime; se forem, revisar suas condições de distribuição antes de prosseguir.
- [ ] Fazer revisão final das obrigações dos componentes selecionados e registrar responsável/data em um checklist aprovado.
- [ ] Não publicar pacote/release até todos os gates acima estarem concluídos e a aprovação de release ser dada separadamente.

## Fontes

- Metadados de versão/licença do ambiente instalado e versões travadas em `uv.lock` (coleta local registrada no ledger).
- Qt for Python — licenças e uso comercial: https://doc.qt.io/qtforpython-6/commercial/index.html e https://doc.qt.io/qtforpython-6/
- Nuitka — documentação do compilador: https://nuitka.net/user-documentation/user-manual.html
