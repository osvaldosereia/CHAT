# Release checklist — rascunho de licenças e avisos

**Estado:** aberto. Este inventário é uma leitura inicial de metadados do ambiente travado, não uma conclusão jurídica nem autorização para distribuir. Nenhum release está autorizado nesta etapa.

## Inventário preliminar do ambiente de build

A coleta foi feita em 30/10/2026 no ambiente Linux x86_64 criado com `uv run --locked --extra build`. As expressões abaixo vêm dos metadados das distribuições instaladas. A build standalone do commit 4054ee9cafc2541181d66f137f96a6c5ba997875 concluiu success no runner GitHub Actions Windows Server 2025 (run 41054439734). O log contém inventário relativo de 922 arquivos e 209.397.745 bytes; `BambuPrep.exe` tem 63.340.544 bytes e SHA-256 `370eb9778049650ab50af14fe2a52863a908f21156a71ce815fcb8866b47f691`. O scanner percorreu os arquivos do bundle, rejeitou extensões cobertas de STL/3MF/histórico/credenciais e procurou tokens com formato OpenAI `sk-`; sucesso indica que nenhum item coberto foi encontrado. Nenhum artifact transferível foi anexado. O inventário do bundle não contém `*.dist-info/METADATA` nem estabelece por si só o mapa de licenças. Atualização verificada em 30/10/2026: o build standalone Windows run 41087845821 (commit 7c8471e51337d3e52756d6144f12ad2ab77e4926) gerou o resumo do XML de compilação para 28 distribuições; todas correspondem ao uv.lock, há metadado de licença não vazio para todas e quatro textos foram truncados somente no resumo compacto. O pacote incluiu THIRD_PARTY_NOTICES.rst. A auditoria inventariou 923 arquivos e 209.508.517 bytes (BambuPrep.exe: 63.346.688 bytes; SHA-256 347b743b7423a9bb40aeb6ad61fd5aa3d426309ca05835b7eeb2bd6085a70349); o job concluiu success, não anexou artifact e não acusou arquivo com sufixo coberto de dados locais nem token de chave. Isso é evidência de inventário técnico do build, não de revisão jurídica, de um SBOM SPDX/CycloneDX formal ou de instalação manual; a revisão efetiva de licenças permanece aberta.

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

- [x] Construir o pacote Windows standalone e listar todos os arquivos, DLLs, plugins Qt, fontes e dados incluídos. Run 41054439734, commit 4054ee9: inventário completo relativo de 922 arquivos e hashes no log do job; nenhum artifact foi anexado.
- [x] Gerar inventário de distribuições/versões e metadados de licença do relatório de compilação do bundle efetivo e relacioná-lo ao uv.lock. Run 41087845821, commit 7c8471e: 28 distribuições, todas no lock, 0 metadados de licença ausentes e 4 textos truncados apenas no resumo compacto; THIRD_PARTY_NOTICES.rst presente no bundle. O resultado é inventário técnico, não revisão jurídica nem SBOM SPDX/CycloneDX formal.
- [ ] Conferir os termos do Qt para os componentes efetivamente incluídos. Qt for Python oferece Community Edition sob LGPLv3/GPLv3 e uma edição comercial; componentes específicos e bibliotecas de terceiros podem ter termos próprios.
- [ ] Decidir e registrar a licença do BambuPrep e o modelo de distribuição.
- [ ] Incluir NOTICE/LICENSe texts e informações necessárias para que o destinatário identifique/reconstrua componentes licenciados quando aplicável.
- [ ] Verificar que Nuitka e ferramentas de build não foram copiadas ao bundle runtime; se forem, revisar suas condições de distribuição antes de prosseguir.
- [ ] Fazer revisão final das obrigações dos componentes selecionados e registrar responsável/data em um checklist aprovado.
- [ ] Não publicar pacote/release até todos os gates acima estarem concluídos e a aprovação de release ser dada separadamente.

## Evidência técnica de licenças — 2026-10-30

- A documentação oficial do Qt for Python informa que a edição comunitária é distribuída sob LGPLv3/GPLv3, com opção comercial; a página de licenças lista código de terceiros e recomenda reconhecer os componentes usados. Metadados resumidos de pacote não substituem a revisão dos módulos/plugins efetivamente incluídos e dos avisos completos gerados.
- A documentação oficial do Nuitka identifica AGPLv3 e uma exceção para os binários criados. O projeto continua sem decisão de licença de distribuição própria; essa nota não conclui compatibilidade jurídica dos demais componentes.
- A auditoria do bundle está sendo ampliada para recusar diretórios/arquivos de ferramentas de build/teste (Nuitka, SCons, pyside6-deploy, pip, setuptools, wheel, pytest e uv) no runtime. Implementação em `de359224`; os workflows Windows dessa revisão ainda precisam concluir antes de registrar evidência.
- Resultado desta revisão documental: gates de distribuição, decisão de licença própria, inspeção dos avisos completos e aprovação final permanecem abertos. Nenhuma publicação ou release foi iniciada.

## Fontes

- Metadados de versão/licença do ambiente instalado e versões travadas em `uv.lock` (coleta local registrada no ledger).
- Qt for Python — licenças e uso comercial: https://doc.qt.io/qtforpython-6/commercial/index.html, https://doc.qt.io/qtforpython-6/licenses.html e https://doc.qt.io/qtforpython-6/
- Nuitka — licenças e documentação do compilador: https://nuitka.net/doc/download.html e https://nuitka.net/user-documentation/user-manual.html
