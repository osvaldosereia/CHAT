# Caneca Fácil Operational MVP — Execution Roadmap

**Approved spec:** `docs/superpowers/specs/2026-09-16-caneca-facil-operational-mvp-design.md`

This roadmap is the execution index for the approved operational MVP. Each phase is independently testable and has a hard exit gate before the next phase begins.

## Execution Order

1. `2026-09-16-caneca-facil-phase-1-foundation-whatsapp.md`
   - reconcile Supabase migration history;
   - unify configuration;
   - finish official Meta webhook POST/signature/idempotent persistence;
   - add official outbound messaging;
   - add customer profile and AI/human/paused conversation control.

2. `2026-09-16-caneca-facil-phase-2-creative-ai.md`
   - WhatsApp media retrieval/private storage;
   - audio transcription;
   - intelligent structured briefing;
   - inspiration/model library;
   - artwork generation/validation/versioning;
   - two-sided mockup, revisions and immutable approval.

3. `2026-09-16-caneca-facil-phase-3-commerce.md`
   - products/pricing/quantity discounts;
   - customer email and multiple addresses;
   - order domain/event history;
   - Melhor Envio quotation/selection;
   - provider-neutral PIX with first Asaas adapter;
   - webhook-confirmed payment and resumable WhatsApp checkout.

4. `2026-09-16-caneca-facil-phase-4-production-admin.md`
   - print files and production hard gates;
   - Melhor Envio labels/tracking lifecycle;
   - Admin roles/RLS;
   - operational Admin navigation and screens;
   - AI/business/product/pricing/integration settings;
   - lifecycle events and customer status notifications;
   - complete operational acceptance test.

## Cross-Phase Rules

- Do not implement later-phase business logic to compensate for a failed earlier gate.
- Every phase ends with `npm test`, `npm run typecheck`, `npm run build` and relevant Supabase advisor checks.
- Database changes are forward migrations under `supabase/migrations/` and are applied through Supabase migration tooling.
- Provider integrations use backend-only credentials and typed adapters.
- Meta, payment and shipping webhook processing is idempotent.
- AI interprets and creates; backend domain code owns prices, totals, shipping selection, payment state and production release.
- An order pins immutable approved artwork; production never follows a mutable “current art” pointer.
- Marketing/post-sale/abandonment automation is intentionally deferred, but lifecycle events are persisted from the first operational release.

## Final MVP Acceptance

The project is considered operational only when one complete scenario is traceable end to end:

`WhatsApp → references/audio → briefing → artwork → two-sided mockup → revision/approval → order → email/address → quantity discount → Melhor Envio → PIX → confirmed payment → print file → production → label/tracking → delivery`.
