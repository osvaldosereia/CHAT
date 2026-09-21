# Matriz de testes RLS

Esta matriz será executada no projeto Supabase de desenvolvimento antes da migration ser considerada pronta.

| Cenário | Resultado esperado |
|---|---|
| usuário A lê organização A | permitido |
| usuário A lê organização B | negado / 0 linhas |
| usuário A lê cliente da organização A | permitido |
| usuário A lê cliente da organização B | negado / 0 linhas |
| agent cria cliente na própria organização | permitido |
| viewer cria cliente | negado |
| agent tenta trocar organization_id em UPDATE | negado |
| usuário sem membership lê dados | negado |
| anon consulta customers | negado |
| anon consulta conversations | negado |
| anon consulta messages | negado |
| service backend executa operação pública validada | permitido pelo caminho controlado |
| usuário desabilitado mantém JWT antigo | acesso negado via membership.status |
| membro de duas organizações alterna contexto | apenas dados da organização selecionada/permitida |

## Gate
Nenhuma tabela tenant-scoped entra em produção sem:
1. RLS ativa;
2. policy explícita;
3. teste positivo;
4. teste de isolamento negativo;
5. advisors de segurança sem alerta crítico relacionado.
