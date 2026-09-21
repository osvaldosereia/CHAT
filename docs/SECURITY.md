# Segurança — Chat Commerce OS

## Modelo de acesso

### Equipe / Admin
Usuários internos autenticam via Supabase Auth e acessam dados somente das organizações em que possuem membership ativa.

Papéis iniciais:
- owner
- admin
- manager
- agent
- viewer

A autorização real é sempre validada no banco por RLS; esconder botões no frontend não é segurança.

### Cliente do chat público
O visitante do chat **não terá acesso direto às tabelas comerciais via Data API**.

Fluxo planejado:
1. navegador recebe apenas chave publishable;
2. mensagens públicas passam por um gateway/Edge Function específico;
3. gateway valida sessão pública, organização, rate limits e payload;
4. banco executa a operação necessária;
5. nenhuma secret/service key é exposta ao navegador.

Isso reduz o risco de um visitante consultar mensagens, clientes ou pedidos de outras pessoas.

## Regras obrigatórias
- RLS em toda tabela exposta;
- nenhuma policy genérica `TO authenticated USING (true)`;
- `service_role` / secret keys somente backend;
- authorization baseada em `organization_memberships`;
- `user_metadata` nunca usada para autorização;
- views expostas somente com `security_invoker` ou protegidas;
- funções privilegiadas fora de schemas públicos e com grants mínimos;
- auditoria para ações sensíveis;
- políticas UPDATE sempre com `USING` + `WITH CHECK`;
- testes de isolamento entre organizações antes de produção.

## Realtime
Produção deve usar canais privados. Para inbox/chat interno, tópicos seguem formato previsível, por exemplo:

`org:<organization_id>:conversation:<conversation_id>`

A autorização do canal deve confirmar membership ativa e acesso à organização.

## Dados pessoais
CPF, telefone, endereço e histórico de compra são dados pessoais e devem:
- ter finalidade definida;
- ter acesso mínimo;
- não ser enviados desnecessariamente para modelos de IA;
- ser omitidos de logs técnicos quando não forem necessários.

## IA
O modelo recebe contexto mínimo necessário.
O Customer Context Builder gera um resumo controlado; não envia o histórico bruto inteiro por padrão.

Ações comerciais passam por tools de domínio. A IA não escreve SQL nem recebe secret keys.
