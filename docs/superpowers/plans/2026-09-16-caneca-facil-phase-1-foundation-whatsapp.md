# Caneca Fácil Phase 1 — Foundation and WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the existing Caneca Fácil foundation and deliver a real, idempotent, official Meta WhatsApp inbound/outbound path with customer/conversation control ready for the creative pipeline.

**Architecture:** Keep the existing Node/Hono API, React Admin, `packages/core`, and separate Supabase project. Normalize Meta webhook events at the API boundary, persist business state in Supabase, keep deterministic conversation-control state outside the AI layer, and expose only backend-safe integration configuration.

**Tech Stack:** Node.js 24, TypeScript 5.9, Hono, Vitest, React 19, Vite 8, Supabase Postgres/Auth/Storage, Meta WhatsApp Cloud API.

**Spec:** `docs/superpowers/specs/2026-09-16-caneca-facil-operational-mvp-design.md`

## Global Constraints

- No public storefront in the MVP; WhatsApp is the customer-facing channel.
- Use official Meta WhatsApp Cloud API only for the main messaging path.
- Keep Supabase RLS enabled; backend secrets must never reach browser code.
- Preserve idempotent inbound processing by WhatsApp message ID.
- AI/human/paused conversation control must be deterministic backend state.
- TDD for every behavior change; run `npm test`, `npm run typecheck`, and `npm run build` before each phase checkpoint.
- Do not commit real Meta, Supabase secret, or OpenAI credentials to this public repository.

---

### Task 1: Reconcile Repository Database History With the Live Supabase Baseline

**Files:**
- Create: `supabase/migrations/20260915155520_add_idempotent_whatsapp_ingest.sql`
- Create: `supabase/README.md`
- Verify: `supabase/schema/initial_caneca_facil.sql`

**Interfaces:**
- Consumes: current live Supabase project `ijquzclfijwfgwupoxmg` and its tracked migration `20260915155520 add_idempotent_whatsapp_ingest`.
- Produces: a repository-side migration history that explicitly records the existing production baseline and a rule that every new DDL change is added under `supabase/migrations/` and applied through Supabase migrations.

- [ ] **Step 1: Capture the live migration contract**

Use Supabase SQL inspection to retrieve the exact `public.ingest_whatsapp_inbound(...)` function definition and execute permissions. Record the existing migration version/name in `supabase/README.md`.

- [ ] **Step 2: Add the tracked migration file to GitHub**

Create `supabase/migrations/20260915155520_add_idempotent_whatsapp_ingest.sql` with the exact function/permission SQL already represented by the live migration. The file must be idempotency-focused only; do not duplicate the entire initial schema in this migration.

- [ ] **Step 3: Document the baseline rule**

`supabase/README.md` must state that `supabase/schema/initial_caneca_facil.sql` is the historical baseline snapshot, production already contains that baseline, and all changes after `20260915155520` must be forward migrations.

- [ ] **Step 4: Verify production drift before any DDL**

Run Supabase table/migration inspection and confirm the current 11 public domain tables and one tracked migration still match the expected baseline. Do not modify production in this step.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260915155520_add_idempotent_whatsapp_ingest.sql supabase/README.md
git commit -m "chore: reconcile Supabase migration baseline"
```

### Task 2: Unify API Configuration and Webhook Verification

**Files:**
- Modify: `apps/api/.env.example`
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/config.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`

**Interfaces:**
- Produces: `loadApiConfig(env): ApiConfig` with `supabaseUrl`, `supabaseSecretKey`, `whatsappVerifyToken`, `whatsappAccessToken`, `whatsappPhoneNumberId`, optional `whatsappAppSecret`, and `port`.
- Consumers: API server, WhatsApp webhook registration, outbound WhatsApp client.

- [ ] **Step 1: Write failing configuration tests**

Test that `WHATSAPP_VERIFY_TOKEN` is the canonical verify-token name, required server values fail fast with a clear error, and the old `META_VERIFY_TOKEN` name is not silently preferred.

- [ ] **Step 2: Run the focused tests**

```bash
npm run test --workspace apps/api -- config.test.ts
```

Expected: FAIL because `loadApiConfig` does not exist.

- [ ] **Step 3: Implement `loadApiConfig` and wire server startup**

Keep configuration parsing in `apps/api/src/config.ts`. `server.ts` must call it once and pass the config into `createApiApp` rather than reading unrelated environment variables directly.

- [ ] **Step 4: Align `.env.example`**

Use only placeholder values. Include `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_APP_SECRET` without real credentials.

- [ ] **Step 5: Run API tests, typecheck and build**

```bash
npm run test --workspace apps/api
npm run typecheck --workspace apps/api
npm run build --workspace apps/api
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/.env.example apps/api/src/config.ts apps/api/src/config.test.ts apps/api/src/server.ts apps/api/src/app.ts apps/api/src/app.test.ts
git commit -m "fix: unify WhatsApp API configuration"
```

### Task 3: Implement Webhook POST Processing and Idempotent Supabase Persistence

**Files:**
- Modify: `apps/api/src/whatsapp/webhook.ts`
- Modify: `apps/api/src/whatsapp/webhook.test.ts`
- Modify: `apps/api/src/whatsapp/normalize-event.ts`
- Modify: `apps/api/src/whatsapp/normalize-event.test.ts`
- Modify: `apps/api/src/whatsapp/ingest.ts`
- Modify: `apps/api/src/whatsapp/ingest.test.ts`
- Create: `apps/api/src/whatsapp/supabase-ingest-store.ts`
- Create: `apps/api/src/whatsapp/supabase-ingest-store.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: Meta webhook JSON payload and existing `public.ingest_whatsapp_inbound(...)` database function.
- Produces: `registerWhatsAppWebhook(app, deps)` with GET verification and POST ingestion; `SupabaseWhatsAppIngestStore.claim(message)` returns `{ accepted, customerId, conversationId, messageId }`.

- [ ] **Step 1: Write failing POST route tests**

Cover: valid text event returns HTTP 200, unsupported/non-message status notification returns 200 without creating a customer message, duplicate WhatsApp message ID returns 200 and does not execute downstream processing twice, malformed body returns 400 only when it is not a valid Meta webhook envelope.

- [ ] **Step 2: Run focused tests**

```bash
npm run test --workspace apps/api -- webhook.test.ts ingest.test.ts
```

Expected: FAIL because POST processing is not registered.

- [ ] **Step 3: Implement the Supabase ingest adapter**

Call the existing database RPC with normalized phone, WhatsApp ID, customer name, message direction/type/text, WhatsApp message ID, and raw payload. Map the RPC response into a typed claim result.

- [ ] **Step 4: Register the POST webhook**

Normalize every inbound message through `normalizeWhatsAppEvent`. Pass normalized messages to `processInboundMessage`; call the downstream callback only when `accepted === true`.

- [ ] **Step 5: Add signature verification when `WHATSAPP_APP_SECRET` is configured**

Verify `X-Hub-Signature-256` over the raw request body. A bad signature must return 401 and must not persist the event. Tests must use a deterministic test secret and HMAC fixture.

- [ ] **Step 6: Run full API verification**

```bash
npm run test --workspace apps/api
npm run typecheck --workspace apps/api
npm run build --workspace apps/api
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/whatsapp apps/api/src/app.ts
git commit -m "feat: receive WhatsApp messages idempotently"
```

### Task 4: Add Official WhatsApp Outbound Messaging

**Files:**
- Create: `apps/api/src/whatsapp/client.ts`
- Create: `apps/api/src/whatsapp/client.test.ts`
- Create: `apps/api/src/whatsapp/send.ts`
- Create: `apps/api/src/whatsapp/send.test.ts`
- Modify: `apps/api/src/config.ts`

**Interfaces:**
- Produces: `WhatsAppClient.sendText(to, text)`, `sendImage(to, media)`, and `sendTemplate(to, template)`; `sendAndRecordMessage(store, client, input)` persists outbound messages and provider IDs.
- Consumers: AI orchestration, approval loop, payment/shipping notifications.

- [ ] **Step 1: Write failing client tests with mocked `fetch`**

Assert the Graph API request uses the configured phone-number ID, bearer token, `messaging_product: "whatsapp"`, and correct text/image/template payload shape. No real network call is allowed in unit tests.

- [ ] **Step 2: Run the focused tests**

```bash
npm run test --workspace apps/api -- client.test.ts send.test.ts
```

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement the minimal Graph API client**

Keep the Graph API version configurable in one constant/module. Throw typed errors containing HTTP status and normalized provider error details, never credentials.

- [ ] **Step 4: Persist outbound messages**

When a send succeeds, store direction `outbound`, message type, text/caption where relevant, and returned provider message ID in `messages`.

- [ ] **Step 5: Run API verification**

```bash
npm run test --workspace apps/api
npm run typecheck --workspace apps/api
npm run build --workspace apps/api
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/whatsapp apps/api/src/config.ts
git commit -m "feat: send official WhatsApp messages"
```

### Task 5: Add Conversation Automation Control and Basic Customer Profile Fields

**Files:**
- Create: `supabase/migrations/20260916_conversation_control_customer_profile.sql`
- Modify: `packages/core/src/conversation.ts`
- Modify: `packages/core/src/conversation.test.ts`
- Modify: `packages/core/src/customer.ts`
- Modify: `packages/core/src/customer.test.ts`
- Create: `apps/api/src/conversations/control.ts`
- Create: `apps/api/src/conversations/control.test.ts`

**Interfaces:**
- Produces conversation `automation_mode: 'ai' | 'human' | 'paused'`, `needs_attention: boolean`, `attention_reason: string | null`; customer `email: string | null`, `first_contact_at`, `last_interaction_at`.
- Consumers: Admin Atendimento screen and later AI orchestrator.

- [ ] **Step 1: Write failing core tests**

Test valid automation modes and that human/paused modes prevent AI-send eligibility while preserving conversation state.

- [ ] **Step 2: Run core tests**

```bash
npm run test --workspace packages/core -- conversation.test.ts customer.test.ts
```

Expected: FAIL for the new fields/behavior.

- [ ] **Step 3: Create the forward Supabase migration**

Add the customer profile fields and conversation-control fields with explicit checks/defaults. Keep RLS enabled and extend existing admin policies rather than disabling RLS.

- [ ] **Step 4: Apply the migration through Supabase and run advisors**

Apply the migration to project `ijquzclfijwfgwupoxmg`, then run security and performance advisors. Any new security warning introduced by this migration blocks completion.

- [ ] **Step 5: Implement typed domain/control helpers**

Provide `canAiReply(conversation)` and `setAutomationMode(...)` semantics so later orchestration cannot accidentally answer while a human owns the chat.

- [ ] **Step 6: Run repository verification**

```bash
npm test
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations packages/core/src apps/api/src/conversations
git commit -m "feat: add conversation automation control"
```

### Task 6: Phase 1 Acceptance Test and Operational Checkpoint

**Files:**
- Create: `docs/acceptance/phase-1-whatsapp.md`
- Modify only if test failures require fixes: files from Tasks 2–5.

**Interfaces:**
- Produces: a reproducible real-environment checklist proving inbound, duplicate protection, customer/conversation persistence, outbound text, and AI/human/paused control.

- [ ] **Step 1: Document the acceptance scenario**

The checklist must include Meta webhook verification, one real inbound text, replay of the same event, one outbound reply, human takeover, and return to AI.

- [ ] **Step 2: Run automated verification**

```bash
npm test
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 3: Verify Supabase state**

Confirm one customer, one open conversation, one inbound message for the replayed WhatsApp ID, and one outbound message. Confirm no duplicate inbound row was created.

- [ ] **Step 4: Run Supabase security/performance advisors**

Security must have no new errors. Performance informational notices are recorded but only fixed when relevant to real query paths.

- [ ] **Step 5: Commit acceptance documentation**

```bash
git add docs/acceptance/phase-1-whatsapp.md
git commit -m "docs: verify phase 1 WhatsApp flow"
```

## Phase 1 Exit Gate

Do not begin the creative AI phase until all of the following are true:

- official Meta GET verification works;
- signed POST events are accepted and persisted;
- duplicate inbound messages are harmless;
- outbound WhatsApp text works and is persisted;
- customer/conversation records are created correctly;
- conversation mode can switch AI → human → AI without losing context;
- repository tests/typecheck/build pass;
- Supabase security advisor has no newly introduced security issue.
