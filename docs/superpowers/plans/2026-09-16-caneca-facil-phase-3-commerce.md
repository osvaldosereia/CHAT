# Caneca Fácil Phase 3 — Commerce, Shipping and PIX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert an approved creative project into a deterministic order with customer data, quantity discounts, Melhor Envio shipping selection and dynamic PIX payment confirmed by webhook.

**Architecture:** Keep commerce calculations in pure domain functions and provider integrations behind adapters. Orders pin the exact approved art/mockup pair. The first PIX adapter is Asaas, behind a `PixProvider` interface; Melhor Envio is behind a `ShippingProvider` interface. Provider callbacks are normalized and processed idempotently.

**Tech Stack:** TypeScript, Hono, Vitest, Supabase Postgres, official Melhor Envio API, Asaas API/Sandbox for first PIX adapter, official WhatsApp outbound messaging from Phase 1.

**Spec:** `docs/superpowers/specs/2026-09-16-caneca-facil-operational-mvp-design.md`

## Global Constraints

- Order totals are calculated by backend code only; AI never invents commercial values.
- Orders pin approved art/mockup IDs and preserve price/discount/freight snapshots.
- Email is required before checkout completion; multiple customer addresses are supported.
- PIX is the only MVP payment method.
- Production is not released merely because a QR code exists or a customer sends a receipt image; only confirmed payment state releases it.
- Payment and shipping webhooks are idempotent.
- Real provider secrets stay backend-only and out of GitHub/browser code.

---

### Task 1: Add Products, Pricing, Discounts, Customer Addresses and Order Domain

**Files:**
- Create: `supabase/migrations/20260916_commerce_core.sql`
- Create: `packages/core/src/pricing.ts`
- Create: `packages/core/src/pricing.test.ts`
- Create: `packages/core/src/order.ts`
- Create: `packages/core/src/order.test.ts`
- Modify: `packages/core/src/customer.ts`
- Modify: `packages/core/src/customer.test.ts`
- Create: `apps/api/src/orders/order-store.ts`
- Create: `apps/api/src/orders/order-store.test.ts`

**Interfaces:**
- Produces: `products`, `discount_rules`, `customer_addresses`, `orders`, `order_items`, `order_events`.
- Produces pure functions `calculateUnitPrice`, `calculateOrderSubtotal`, `calculateDiscount`, `calculateOrderTotal`, and typed order status transitions.

- [ ] Write failing pricing tests covering no discount, percentage discount band, fixed unit price band, exact quantity boundaries and historical price snapshot behavior.
- [ ] Write failing order-state tests covering draft → data collection → shipping → payment and rejecting invalid transitions.
- [ ] Create and apply `20260916_commerce_core.sql` with foreign keys to customer/project/approved art IDs, checks for non-negative monetary values, RLS and admin/service access patterns.
- [ ] Add customer email support and normalized multi-address persistence without overwriting old addresses.
- [ ] Implement order creation from an approved project. It must fail if `approved_art_version_id` or `approved_mockup_id` is missing.
- [ ] Run Supabase advisors, then `npm test && npm run typecheck && npm run build`; expect PASS.
- [ ] Commit with `feat: add commerce and order domain`.

### Task 2: Integrate Melhor Envio Quotation and Shipping Selection

**Files:**
- Create: `apps/api/src/shipping/provider.ts`
- Create: `apps/api/src/shipping/melhor-envio.ts`
- Create: `apps/api/src/shipping/melhor-envio.test.ts`
- Create: `apps/api/src/shipping/quote-order.ts`
- Create: `apps/api/src/shipping/quote-order.test.ts`
- Create: `supabase/migrations/20260916_shipping.sql`

**Interfaces:**
- Produces: `ShippingProvider.quote(input)`, `selectQuote(orderId, quoteId)`, `shipments`, `shipping_events`.
- Consumes: origin configuration, delivery address, product package dimensions/weight, quantity and declared value.

- [ ] Write failing adapter tests using fixed Melhor Envio response fixtures for multiple services, provider error, no available service and timeout/retry-safe behavior.
- [ ] Create/apply shipping migration storing selected provider/service, quoted price, estimated days, provider IDs, tracking and raw normalized event metadata.
- [ ] Implement quote mapping so only supported/usable quotes are returned to the conversation layer.
- [ ] Persist the selected quote snapshot on the order/shipment; later price changes must not mutate the order total.
- [ ] Add one reconciliation/query method for an inconclusive provider response before creating a duplicate shipment operation.
- [ ] Run API tests, repository verification and Supabase advisors; expect PASS.
- [ ] Commit with `feat: integrate Melhor Envio quotations`.

### Task 3: Add Provider-Neutral PIX Domain and First Asaas Adapter

**Files:**
- Create: `supabase/migrations/20260916_payments.sql`
- Create: `packages/core/src/payment.ts`
- Create: `packages/core/src/payment.test.ts`
- Create: `apps/api/src/payments/provider.ts`
- Create: `apps/api/src/payments/asaas.ts`
- Create: `apps/api/src/payments/asaas.test.ts`
- Create: `apps/api/src/payments/create-pix.ts`
- Create: `apps/api/src/payments/create-pix.test.ts`

**Interfaces:**
- Produces: `PixProvider.createCharge`, `PixProvider.getCharge`, normalized payment states, `payments` table.
- First adapter: Asaas dynamic PIX charge + QR/copy-paste retrieval.

- [ ] Write failing payment-state tests covering `created`, `pending`, `paid`, `expired`, `cancelled`, `refunded`, `problem` and legal transitions.
- [ ] Create/apply payments migration with unique provider/payment IDs and order link; store amount, due/expiration, QR copy-paste payload, QR image reference/derived representation, status and confirmed timestamp.
- [ ] Write mocked Asaas adapter tests proving charge creation uses `billingType=PIX`, obtains the payment QR payload, and maps provider errors without exposing API keys.
- [ ] Implement `createPixForOrder(orderId)` with idempotency: if an active charge already exists for the same order/amount, return it rather than creating another charge.
- [ ] Send QR/copy-paste to the customer through the WhatsApp service after successful persistence.
- [ ] Run API/core tests, typecheck, build and Supabase advisors; expect PASS.
- [ ] Commit with `feat: add dynamic Pix payments`.

### Task 4: Implement PIX Webhook Confirmation and Reconciliation

**Files:**
- Create: `apps/api/src/payments/webhook.ts`
- Create: `apps/api/src/payments/webhook.test.ts`
- Create: `apps/api/src/payments/reconcile.ts`
- Create: `apps/api/src/payments/reconcile.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: idempotent Asaas webhook endpoint, normalized payment events, `payment_confirmed` lifecycle event and order transition to `paid`.

- [ ] Write failing webhook tests for payment received/confirmed, duplicate event, irrelevant event, wrong amount/order correlation and malformed authentication/token condition.
- [ ] Implement webhook authentication using the configured Asaas webhook token/secret mechanism; reject unauthorized events before database mutation.
- [ ] Update payment/order in one transaction/RPC boundary so `paid` and `payment_confirmed` cannot diverge.
- [ ] Implement reconciliation: query the provider for pending payments when webhook delivery is missed or state is uncertain; never mark paid from client-submitted receipt images alone.
- [ ] Send one WhatsApp payment-confirmed notification only on the first transition to `paid`.
- [ ] Run repository verification; expect PASS.
- [ ] Commit with `feat: confirm Pix payments by webhook`.

### Task 5: Implement Checkout Orchestration in the WhatsApp Conversation

**Files:**
- Create: `apps/api/src/checkout/orchestrator.ts`
- Create: `apps/api/src/checkout/orchestrator.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: approved project, customer profile, pricing rules, shipping provider, PIX provider, WhatsApp client.
- Produces: deterministic next checkout action and lifecycle events: `checkout_started`, `customer_data_completed`, `shipping_quoted`, `shipping_selected`, `pix_created`, `payment_confirmed`.

- [ ] Write failing scenario tests for approved project → ask missing email → ask address → quote shipping → customer selects service → calculate total → create PIX.
- [ ] Add an existing-customer test proving known name/email/address are reused after confirmation rather than asked again blindly.
- [ ] Add an interrupted-checkout test proving the customer resumes at the correct stage rather than starting over.
- [ ] Implement the orchestration with pure state checks; AI wording may phrase messages but cannot skip required commercial gates.
- [ ] Run repository verification; expect PASS.
- [ ] Commit with `feat: orchestrate WhatsApp checkout`.

### Task 6: Commerce Acceptance Gate

**Files:**
- Create: `docs/acceptance/phase-3-commerce.md`

- [ ] Run one sandbox end-to-end scenario from approved art through quantity discount, customer email/address, Melhor Envio quote, shipping choice, Asaas dynamic PIX and webhook-confirmed payment.
- [ ] Confirm the persisted order total equals the sum of immutable item snapshot minus discount plus selected freight.
- [ ] Replay both shipping-selection and payment webhook operations to prove idempotency.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, security advisor and performance advisor.
- [ ] Commit with `docs: verify commerce checkout flow`.

## Phase 3 Exit Gate

Do not release production automation until a real/sandbox order can reach `paid` with an immutable approved art reference, customer email/address, selected Melhor Envio service and webhook-confirmed PIX payment.
