# Caneca Fácil Phase 4 — Production, Shipping Lifecycle and Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release paid orders safely into print production, complete Melhor Envio label/tracking automation, and turn the current minimal Admin into the operational console defined in the approved MVP spec.

**Architecture:** Production is a separate deterministic domain gated by approved artwork, confirmed payment and a valid print file. Admin reads normalized operational views rather than raw provider payloads. Role-based authorization is enforced in the database/backend, not only in React navigation.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest, Hono, Supabase Postgres/Auth/Storage/RLS, Melhor Envio API, official WhatsApp notifications.

**Spec:** `docs/superpowers/specs/2026-09-16-caneca-facil-operational-mvp-design.md`

## Global Constraints

- Production never uses `current_art_version_id`; it uses the immutable approved art pinned by the order.
- Production cannot start unless payment is confirmed and the print file is valid.
- Mockup and print file are different assets with different purposes.
- Every production/shipping transition records who/what changed it and when.
- Role checks must be enforced server/database-side; hiding a button is not authorization.
- Customer-facing notifications are selective; do not spam every internal production transition.

---

### Task 1: Add Print Files and Production Jobs With Hard Release Gates

**Files:**
- Create: `supabase/migrations/20260916_production.sql`
- Create: `packages/core/src/production.ts`
- Create: `packages/core/src/production.test.ts`
- Create: `apps/api/src/production/print-file.ts`
- Create: `apps/api/src/production/print-file.test.ts`
- Create: `apps/api/src/production/release.ts`
- Create: `apps/api/src/production/release.test.ts`

**Interfaces:**
- Produces: `print_files`, `production_jobs`, production statuses `blocked | ready | printing | printed | quality_check | packaging | ready_to_ship | completed | problem`.
- Produces: `canReleaseToProduction(order, payment, art, printFile)` and `releaseOrderToProduction(orderId)`.

- [ ] Write failing core tests proving all three gates are mandatory: approved pinned art, confirmed paid status and valid print file.
- [ ] Create/apply production migration with immutable links to order/project/art version, storage path, dimensions/DPI/template metadata, timestamps and operator IDs where applicable.
- [ ] Implement print-file generation from the order-pinned approved art and mug template; persist into a private print-file storage location rather than reusing customer mockup storage.
- [ ] Implement production release in a transactional boundary so an order cannot be marked `in_production` without a ready production job.
- [ ] Write transition tests rejecting skipped/invalid production steps and preserving `problem` as an exception flag/reason without losing traceability.
- [ ] Run repository verification and Supabase advisors; expect PASS.
- [ ] Commit with `feat: gate and manage print production`.

### Task 2: Complete Melhor Envio Label, Posting and Tracking Lifecycle

**Files:**
- Modify: `apps/api/src/shipping/provider.ts`
- Modify: `apps/api/src/shipping/melhor-envio.ts`
- Modify: `apps/api/src/shipping/melhor-envio.test.ts`
- Create: `apps/api/src/shipping/label.ts`
- Create: `apps/api/src/shipping/label.test.ts`
- Create: `apps/api/src/shipping/webhook.ts`
- Create: `apps/api/src/shipping/webhook.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: label creation/purchase/print-reference flow, tracking code, normalized shipment statuses, idempotent shipping-event ingestion.

- [ ] Write failing tests for create/purchase label, retrieve printable label, duplicate webhook event, posted, delivered and delivery-issue mappings.
- [ ] Implement the complete Melhor Envio label flow only for orders in `ready_to_ship`; repeated calls must reconcile existing provider state before creating duplicate labels.
- [ ] Implement webhook ingestion preserving raw provider event/status and mapping it to normalized shipment state.
- [ ] Trigger WhatsApp notifications only for configured customer-relevant events: ready for shipping, posted/tracking, delivery issue and delivered.
- [ ] Verify provider errors mark the shipment/order attention state without silently rolling back production completion.
- [ ] Run API/repository verification; expect PASS.
- [ ] Commit with `feat: add shipping labels and tracking lifecycle`.

### Task 3: Add Admin Roles and Server-Enforced Permissions

**Files:**
- Create: `supabase/migrations/20260916_admin_roles.sql`
- Modify: `apps/admin/src/auth/AuthGate.tsx`
- Modify: `apps/admin/src/auth/AuthGate.test.tsx`
- Create: `apps/admin/src/auth/permissions.ts`
- Create: `apps/admin/src/auth/permissions.test.ts`
- Create: `apps/admin/src/services/admin-profile.ts`
- Create: `apps/admin/src/services/admin-profile.test.ts`

**Interfaces:**
- Produces roles: `administrator`, `sales`, `production`; permission helpers used by routes/actions.
- Database policies enforce the same role boundaries for admin-readable/writeable operational tables.

- [ ] Write failing permission tests for Administrator full access, Sales access to conversations/customers/orders with no integration-secret/production-setting mutation, and Production access only to fulfillment-required data/actions.
- [ ] Create/apply admin-role migration extending the existing admin membership model with explicit role and active state; add role-aware RLS/policies without disabling RLS.
- [ ] Load the signed-in admin profile immediately after Auth session verification and reject authenticated users who are not active admin members.
- [ ] Add permission helpers for UI rendering, but keep privileged mutations protected server/database-side.
- [ ] Run Admin tests, full repository verification and Supabase security advisor; expect PASS.
- [ ] Commit with `feat: enforce admin operational roles`.

### Task 4: Rebuild Admin Navigation Around Operations

**Files:**
- Modify: `apps/admin/src/AdminWorkspace.tsx`
- Modify: `apps/admin/src/AdminWorkspace.test.tsx`
- Create: `apps/admin/src/pages/HomePage.tsx`
- Create: `apps/admin/src/pages/ConversationsPage.tsx`
- Create: `apps/admin/src/pages/OrdersPage.tsx`
- Create: `apps/admin/src/pages/ProductionPage.tsx`
- Create: `apps/admin/src/pages/CustomersPage.tsx`
- Create: `apps/admin/src/pages/ModelsPage.tsx`
- Create: `apps/admin/src/pages/SettingsPage.tsx`
- Create corresponding `*.test.tsx` files for each page.

**Interfaces:**
- Produces navigation: `Início | Atendimento | Pedidos | Artes & Produção | Clientes | Modelos | Configurações` filtered by role.

- [ ] Write failing navigation tests for all seven sections and role-specific visibility.
- [ ] Split current two-section `AdminWorkspace` into navigation/shell plus focused pages; preserve existing Project/Gabarito capabilities by moving them into `Artes & Produção` and `Configurações` rather than deleting them.
- [ ] Implement Home operational counters/links only: waiting conversations, human attention, approval, pending PIX, paid waiting production, in production, ready to ship and shipping problems.
- [ ] Implement consistent loading/error/empty states and avoid fetching data for unauthorized hidden sections.
- [ ] Run Admin tests/typecheck/build; expect PASS.
- [ ] Commit with `feat: reshape admin around operations`.

### Task 5: Implement Atendimento Workspace and Human Takeover Controls

**Files:**
- Create: `apps/admin/src/components/conversations/ConversationList.tsx`
- Create: `apps/admin/src/components/conversations/ConversationThread.tsx`
- Create: `apps/admin/src/components/conversations/ConversationContext.tsx`
- Create: `apps/admin/src/services/conversations.ts`
- Create corresponding tests.

**Interfaces:**
- Displays: conversation stream, text/image/audio/document messages, audio transcription, structured briefing summary, missing information, project/order status and AI/human/paused mode.
- Actions: `assume`, `returnToAi`, `pause` using Phase 1 conversation-control backend.

- [ ] Write failing tests proving takeover changes control state and does not discard project/order context.
- [ ] Implement three-column workspace: list, message/media thread, context panel.
- [ ] Render structured AI extraction only; never expose hidden reasoning/chain-of-thought.
- [ ] Show clear attention reason and current owner/mode at top of each conversation.
- [ ] Run Admin verification; expect PASS.
- [ ] Commit with `feat: add admin conversation workspace`.

### Task 6: Implement Orders, Production Queue, Customers and Model Library Screens

**Files:**
- Create: `apps/admin/src/services/orders.ts`
- Create: `apps/admin/src/services/production.ts`
- Create: `apps/admin/src/services/customers.ts`
- Create: `apps/admin/src/services/models.ts`
- Create focused list/detail components and tests under `apps/admin/src/components/orders/`, `production/`, `customers/`, `models/`.

**Interfaces:**
- Orders: filters by commercial state, totals, payment, approved art, production, shipment and event timeline.
- Production: creation/approval queue plus paid/released production jobs with mockup preview and print-file access.
- Customers: name/WhatsApp/email search plus summary/orders/projects/conversations/addresses.
- Models: gallery CRUD/search with active/reusable controls.

- [ ] Write failing screen/service tests for each module using fixed mocked data ports.
- [ ] Implement Orders list/detail and immutable event timeline.
- [ ] Implement Production queue with hard-disabled actions when backend release gates are unmet.
- [ ] Implement Customer detail tabs and multi-address history.
- [ ] Implement model gallery create/edit/activate/deactivate and reusable-as-inspiration control.
- [ ] Run Admin tests/typecheck/build; expect PASS.
- [ ] Commit with `feat: add operational admin modules`.

### Task 7: Implement Admin Settings for AI, Products, Pricing and Integrations

**Files:**
- Create: `supabase/migrations/20260916_operational_settings.sql`
- Create: `apps/admin/src/services/settings.ts`
- Create: `apps/admin/src/components/settings/AiAttendantSettings.tsx`
- Create: `apps/admin/src/components/settings/BusinessKnowledgeSettings.tsx`
- Create: `apps/admin/src/components/settings/ProductSettings.tsx`
- Create: `apps/admin/src/components/settings/PricingSettings.tsx`
- Create: `apps/admin/src/components/settings/IntegrationStatus.tsx`
- Create corresponding tests.

**Interfaces:**
- Produces versioned AI attendant settings, editable business knowledge, product/mug definitions, discount rules and safe integration health/config references.

- [ ] Write failing tests proving AI config changes create a new version and can reactivate a prior version rather than destructively overwriting history.
- [ ] Create/apply operational-settings migration for AI config versions and business knowledge; reuse product/discount tables from Phase 3.
- [ ] Implement settings forms with validation and role restriction to Administrator.
- [ ] Integration status panels may show connected/disconnected/webhook health/last event, but must never return raw secret values to the browser.
- [ ] Implement an Admin AI test/simulator endpoint that uses the same orchestration rules with a non-WhatsApp test conversation context and cannot send real customer messages.
- [ ] Run repository verification and Supabase advisors; expect PASS.
- [ ] Commit with `feat: add admin operational settings`.

### Task 8: Lifecycle Event Coverage and Customer Notifications

**Files:**
- Create: `supabase/migrations/20260916_lifecycle_events.sql`
- Create: `packages/core/src/lifecycle-event.ts`
- Create: `packages/core/src/lifecycle-event.test.ts`
- Create: `apps/api/src/events/lifecycle-store.ts`
- Create: `apps/api/src/events/lifecycle-store.test.ts`
- Create: `apps/api/src/notifications/order-notifications.ts`
- Create: `apps/api/src/notifications/order-notifications.test.ts`

**Interfaces:**
- Persists event types required by the spec from `conversation_started` through `delivered`; notification dispatcher maps selected events to WhatsApp messages/templates.

- [ ] Write failing tests for event append/idempotency and notification selection.
- [ ] Create/apply lifecycle-event migration with entity references, occurred timestamp, source and unique external-event key when applicable.
- [ ] Emit events at the existing Phase 1–4 domain boundaries rather than duplicating business state logic.
- [ ] Configure customer notifications for payment confirmed, production started, ready to ship, shipped/tracking, delivery issue and delivered.
- [ ] Confirm lifecycle storage is sufficient for later abandoned project/PIX/post-sale automation without implementing campaign scheduling now.
- [ ] Run repository verification; expect PASS.
- [ ] Commit with `feat: persist commerce lifecycle events`.

### Task 9: Full Operational Acceptance and Security Gate

**Files:**
- Create: `docs/acceptance/operational-mvp.md`

- [ ] Execute one complete real/sandbox scenario: WhatsApp → image/audio → briefing → art → mockup → change → approval → quantity/discount → email/address → Melhor Envio quote → Asaas PIX → payment webhook → print file → production → label/tracking → delivered.
- [ ] Verify the printed file references exactly the art version approved by the customer and pinned by the order.
- [ ] Verify Admin role boundaries with one account per role or equivalent policy-level tests.
- [ ] Replay Meta, PIX and shipping webhooks to confirm idempotency.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`.
- [ ] Run Supabase security and performance advisors; no newly introduced security lint may remain unresolved.
- [ ] Record real operational caveats/provider sandbox limitations in the acceptance document.
- [ ] Commit with `docs: verify Caneca Fácil operational MVP`.

## MVP Exit Gate

The operational MVP is complete only after the approved spec's 20-step end-to-end path is demonstrated and traceable across customer, conversation, project, approved art, order, payment, print file, production job, shipment and lifecycle events.
