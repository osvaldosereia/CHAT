# Caneca Fácil MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o MVP Caneca Fácil: atendimento pelo WhatsApp, briefing multimodal inteligente, geração de arte horizontal, mockup por IA mostrando os dois lados da caneca, revisão/aprovação e Admin mínimo.

**Architecture:** Monorepo TypeScript com `apps/admin` (React/Vite), `apps/api` (Node HTTP API/orquestrador) e `packages/core` (domínio compartilhado). Um novo projeto Supabase será a persistência exclusiva do Caneca Fácil; WhatsApp Cloud API e OpenAI serão acessados somente pelo backend.

**Tech Stack:** Node.js 24 LTS, npm workspaces, TypeScript, React, Vite, Vitest, Supabase JS, WhatsApp Cloud API e OpenAI API.

**Spec:** `docs/superpowers/specs/2026-09-15-caneca-facil-mvp-design.md`

## Global Constraints

- Projeto novo e isolado de todos os dados, tabelas, credenciais e automações da Dona Antônia.
- Repositório: `osvaldosereia/CHAT`; legado preservado em `archive-dona-antonia`.
- `main` representa apenas Caneca Fácil depois da Etapa 0.
- Novo projeto Supabase exclusivo do Caneca Fácil.
- WhatsApp oficial da Meta integrado diretamente; sem Make/PapoAI no caminho principal.
- Cliente envia texto, áudio e até 3 imagens.
- Arte mestre horizontal nunca é enviada diretamente ao cliente no MVP.
- Proporção, dimensões, margem e resolução da arte são configuráveis pelo Admin.
- Mockup é gerado por IA em uma única imagem, emocional/comercial, mostrando os dois lados da caneca.
- Uma única tentativa automática adicional de correção por geração; depois disso, `needs_review`.
- Buckets privados; `service_role` nunca no frontend; RLS em todas as tabelas expostas.
- Toda feature/comportamento novo usa TDD: teste falha antes, implementação mínima, teste passa.

---

### Task 1: Fundação do monorepo e CI

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/admin/package.json`
- Create: `apps/admin/index.html`
- Create: `apps/admin/src/main.tsx`
- Create: `apps/admin/src/App.tsx`
- Create: `apps/admin/src/App.test.tsx`
- Create: `apps/admin/vite.config.ts`
- Create: `apps/api/package.json`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/app.test.ts`
- Create: `apps/api/src/server.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/src/index.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Produces: workspace npm com scripts `test`, `build` e `typecheck` na raiz.
- Produces: `createApiApp()` retornando handler HTTP testável.

- [ ] **Step 1: Criar teste RED do Admin**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('identifica o painel como Caneca Fácil', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /caneca fácil/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Criar teste RED da API**

```ts
import { describe, expect, it } from 'vitest';
import { createApiApp } from './app';

describe('healthcheck', () => {
  it('retorna ok', async () => {
    const response = await createApiApp().request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', service: 'caneca-facil-api' });
  });
});
```

- [ ] **Step 3: Rodar CI/testes e confirmar RED**

Run: `npm ci && npm test`
Expected: FAIL porque `App`/`createApiApp` ainda não existem.

- [ ] **Step 4: Implementar o mínimo para GREEN**

`App.tsx` deve renderizar título `Caneca Fácil`; `createApiApp()` deve expor `/health` com JSON `{ status: 'ok', service: 'caneca-facil-api' }`.

- [ ] **Step 5: Rodar verificação completa**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: initialize Caneca Fácil monorepo"
```

---

### Task 2: Domínio e máquina de estados

**Files:**
- Create: `packages/core/src/project-status.ts`
- Create: `packages/core/src/project-status.test.ts`
- Create: `packages/core/src/briefing.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `ProjectStatus`, `canTransition(from, to)` e `assertTransition(from, to)`.
- Produces: tipos `Briefing`, `BriefingRequirementLevel` e `CreationMode`.

- [ ] **Step 1: Escrever teste RED para transições válidas e inválidas**

```ts
expect(canTransition('new', 'collecting_references')).toBe(true);
expect(canTransition('approved', 'generating_art')).toBe(false);
expect(() => assertTransition('approved', 'generating_art')).toThrow(/invalid project transition/i);
```

- [ ] **Step 2: Rodar o teste e confirmar RED**

Run: `npm test -- project-status.test.ts`
Expected: FAIL por funções ausentes.

- [ ] **Step 3: Implementar estados mínimos**

Estados: `new`, `collecting_references`, `building_briefing`, `waiting_customer`, `ready_to_generate`, `generating_art`, `validating_art`, `generating_mockup`, `waiting_approval`, `change_requested`, `needs_review`, `approved`, `failed`.

- [ ] **Step 4: Rodar testes e confirmar GREEN**

Run: `npm test -- project-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat: add mug project state machine"
```

---

### Task 3: Supabase schema, Auth e Storage

**Files:**
- Create: `supabase/migrations/0001_caneca_facil_mvp.sql`
- Create: `packages/core/src/database.types.ts` (gerado após migration)
- Create: `apps/api/src/lib/supabase.ts`
- Create: `apps/admin/src/lib/supabase.ts`
- Create: `apps/api/src/lib/supabase.test.ts`

**Interfaces:**
- Produces tabelas: `customers`, `conversations`, `messages`, `mug_templates`, `mug_projects`, `project_media`, `audio_transcriptions`, `briefings`, `art_versions`, `mockup_versions`, `review_events`.
- Produces buckets privados: `customer-uploads`, `artwork-master`, `mockups`.
- Backend consome `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; Admin consome `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`.

- [ ] **Step 1: Escrever teste RED do carregamento seguro de configuração**

```ts
expect(() => createServerSupabaseClient({ url: '', serviceRoleKey: '' })).toThrow(/supabase configuration/i);
```

- [ ] **Step 2: Rodar teste RED**

Run: `npm test -- supabase.test.ts`
Expected: FAIL por função ausente.

- [ ] **Step 3: Aplicar migration no novo projeto Supabase**

A migration cria PKs UUID, FKs, timestamps, constraints de status, `whatsapp_message_id` único quando não nulo, RLS em todas as tabelas `public`, políticas apenas para administrador autenticado quando necessário e nenhum acesso público aos buckets.

- [ ] **Step 4: Gerar tipos TypeScript do banco e criar clientes**

`createServerSupabaseClient()` usa somente segredo server-side. O cliente web usa apenas chave publicável.

- [ ] **Step 5: Verificar banco**

Executar consulta de leitura do `mug_templates`, upload de arquivo de teste via backend e advisors de segurança/performance.
Expected: template inicial presente, buckets privados, nenhum alerta crítico novo de RLS.

- [ ] **Step 6: Rodar testes e commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add supabase packages/core apps/api apps/admin
git commit -m "feat: add Caneca Fácil Supabase foundation"
```

---

### Task 4: Admin MVP — login, projetos e detalhe

**Files:**
- Create: `apps/admin/src/auth/AuthGate.tsx`
- Create: `apps/admin/src/pages/LoginPage.tsx`
- Create: `apps/admin/src/pages/ProjectsPage.tsx`
- Create: `apps/admin/src/pages/ProjectDetailPage.tsx`
- Create: `apps/admin/src/pages/TemplateSettingsPage.tsx`
- Create: `apps/admin/src/services/projects.ts`
- Create: `apps/admin/src/pages/ProjectsPage.test.tsx`
- Modify: `apps/admin/src/App.tsx`

**Interfaces:**
- Consumes: Supabase Auth e tipos gerados.
- Produces: lista de projetos e detalhe reconstruindo cliente → mensagens → mídia → briefing → arte → mockup → revisão.

- [ ] **Step 1: Escrever teste RED da lista de projetos**

O teste injeta dois projetos e exige nome do cliente, status e última atividade na tela.

- [ ] **Step 2: Confirmar RED**

Run: `npm test -- ProjectsPage.test.tsx`
Expected: FAIL porque página/serviço ainda não existem.

- [ ] **Step 3: Implementar UI mínima e rotas protegidas**

Sem dashboard avançado. Quatro telas: login, lista, detalhe, configuração do gabarito.

- [ ] **Step 4: Rodar testes/build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin
git commit -m "feat: add Caneca Fácil admin MVP"
```

---

### Task 5: WhatsApp webhook e ingestão idempotente

**Files:**
- Create: `apps/api/src/whatsapp/webhook.ts`
- Create: `apps/api/src/whatsapp/webhook.test.ts`
- Create: `apps/api/src/whatsapp/client.ts`
- Create: `apps/api/src/whatsapp/normalize-event.ts`
- Create: `apps/api/src/whatsapp/normalize-event.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes env: `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`.
- Produces: `NormalizedInboundMessage` com `messageId`, `phone`, `type`, `text`, `mediaId`, `timestamp`.

- [ ] **Step 1: Teste RED de verificação do webhook**

GET `/webhooks/whatsapp` com token correto retorna `hub.challenge`; token incorreto retorna 403.

- [ ] **Step 2: Teste RED de idempotência**

Processar duas vezes o mesmo `whatsapp_message_id` resulta em uma única `messages` persistida e nenhuma geração duplicada.

- [ ] **Step 3: Confirmar RED e implementar mínimo**

Run: `npm test -- whatsapp`
Expected antes: FAIL; depois: PASS.

- [ ] **Step 4: Testar envio de texto em ambiente Meta de teste**

Expected: mensagem recebida no número permitido e registro outbound persistido.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add direct WhatsApp webhook"
```

---

### Task 6: Mídia, áudio e briefing multimodal

**Files:**
- Create: `apps/api/src/media/store-media.ts`
- Create: `apps/api/src/media/store-media.test.ts`
- Create: `apps/api/src/ai/transcribe.ts`
- Create: `apps/api/src/ai/briefing.ts`
- Create: `apps/api/src/ai/briefing.test.ts`
- Create: `apps/api/src/projects/orchestrator.ts`
- Create: `apps/api/src/projects/orchestrator.test.ts`

**Interfaces:**
- Produces: `extractBriefing(context): Promise<BriefingDecision>`.
- `BriefingDecision` contém `briefing`, `missingInformation`, `confidenceScore`, `readyToGenerate`, `nextQuestion`.

- [ ] **Step 1: Teste RED: não repetir pergunta já respondida**

Contexto já contém `mandatoryText`; decisão não pode pedir novamente o texto.

- [ ] **Step 2: Teste RED: briefing claro segue para geração**

Pedido completo com foto, ocasião, texto e estilo retorna `readyToGenerate: true`.

- [ ] **Step 3: Confirmar RED**

Run: `npm test -- briefing.test.ts orchestrator.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar armazenamento de mídia, transcrição e decisão estruturada**

Máximo de 3 imagens de referência na fase inicial; arquivos originais sempre preservados.

- [ ] **Step 5: Confirmar GREEN**

Run: `npm test -- briefing.test.ts orchestrator.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api packages/core
git commit -m "feat: add multimodal briefing engine"
```

---

### Task 7: Arte mestre, validação e mockup por IA

**Files:**
- Create: `apps/api/src/ai/artwork.ts`
- Create: `apps/api/src/ai/artwork.test.ts`
- Create: `apps/api/src/ai/validate-artwork.ts`
- Create: `apps/api/src/ai/validate-artwork.test.ts`
- Create: `apps/api/src/ai/mockup.ts`
- Create: `apps/api/src/ai/mockup.test.ts`
- Create: `apps/api/src/jobs/generate-project-assets.ts`
- Create: `apps/api/src/jobs/generate-project-assets.test.ts`

**Interfaces:**
- `generateArtwork({ briefing, template, references, parentArt? })` → arte mestre.
- `validateArtwork(...)` → `{ valid, reasons }`.
- `generateMockup({ artwork, template })` → uma imagem com duas vistas da caneca.

- [ ] **Step 1: Teste RED: geração usa gabarito configurado**

Alterar `aspectRatio`/resolução do template altera parâmetros enviados ao gerador; nenhuma proporção `2.3:1` pode estar hardcoded.

- [ ] **Step 2: Teste RED: uma só autocorreção**

Validação falha duas vezes: exatamente duas gerações no total e estado final `needs_review`.

- [ ] **Step 3: Teste RED: mockup vincula versão da arte**

`mockup_versions.art_version_id` corresponde à versão validada, e prompt exige uma imagem única mostrando os dois lados.

- [ ] **Step 4: Confirmar RED, implementar e confirmar GREEN**

Run: `npm test -- artwork validate-artwork mockup generate-project-assets`
Expected: RED antes; PASS depois.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: generate artwork and AI mockups"
```

---

### Task 8: Revisão, alteração e aprovação

**Files:**
- Create: `apps/api/src/review/interpret-review.ts`
- Create: `apps/api/src/review/interpret-review.test.ts`
- Create: `apps/api/src/review/apply-review.ts`
- Create: `apps/api/src/review/apply-review.test.ts`
- Modify: `apps/api/src/projects/orchestrator.ts`

**Interfaces:**
- `interpretReview(message)` → `approved | change_requested` + instruções normalizadas.
- `applyReview()` registra `review_events`, preserva versões e atualiza o estado.

- [ ] **Step 1: Teste RED de aprovação**

Mensagem “ficou perfeita, pode fazer” resulta em `approved` e não cria nova arte.

- [ ] **Step 2: Teste RED de alteração localizada**

“Diminua as flores, o resto está perfeito” cria instrução para reduzir flores e preservar foto/texto/composição restante.

- [ ] **Step 3: Confirmar RED, implementar e confirmar GREEN**

Run: `npm test -- review`
Expected: RED antes; PASS depois.

- [ ] **Step 4: Commit**

```bash
git add apps/api
git commit -m "feat: add customer review cycle"
```

---

### Task 9: Teste integrado e homologação

**Files:**
- Create: `apps/api/src/e2e/caneca-facil-flow.test.ts`
- Create: `docs/HOMOLOGACAO.md`
- Modify: `README.md`

**Interfaces:**
- Exercita o fluxo `WhatsApp event → projeto → briefing → arte → validação → mockup → review` com adapters fake para Meta/OpenAI e banco de teste.

- [ ] **Step 1: Escrever E2E RED do caminho feliz**

Cliente com 1 foto + áudio completa briefing, gera arte/mockup, recebe mockup e aprova.

- [ ] **Step 2: Escrever cenários RED adicionais**

3 imagens + texto; criação do zero; alteração após mockup; evento duplicado; falha persistente de arte; áudio inválido; mensagem fora de ordem.

- [ ] **Step 3: Rodar e corrigir somente falhas reais do fluxo**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS sem warnings/erros.

- [ ] **Step 4: Homologação real**

Executar um atendimento controlado pelo WhatsApp de teste e verificar no Admin a cadeia completa `mensagem → referência → briefing → arte → mockup → aprovação`.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: validate Caneca Fácil MVP end to end"
```

---

## Completion Gate

Antes de declarar MVP pronto:

1. Rodar `npm test`.
2. Rodar `npm run typecheck`.
3. Rodar `npm run build`.
4. Conferir GitHub Actions no commit final.
5. Rodar Supabase security e performance advisors.
6. Confirmar buckets privados e ausência de segredo no frontend.
7. Confirmar que `archive-dona-antonia` permanece acessível e sem alteração.
8. Usar `superpowers:verification-before-completion` antes de afirmar que o projeto está concluído.
