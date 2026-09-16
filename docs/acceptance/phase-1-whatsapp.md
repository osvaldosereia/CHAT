# Caneca Fácil — Phase 1 WhatsApp Acceptance Checkpoint

**Date:** 2026-09-16  
**Branch:** `feat/caneca-facil-round-1-foundation`  
**Status:** Code/database checkpoint verified; live Meta end-to-end acceptance pending deployment/real credentials.

## Automated repository verification

The Phase 1 branch has automated coverage for:

- canonical API environment configuration;
- Meta GET webhook verification contract;
- raw-body `X-Hub-Signature-256` verification when an App Secret is configured;
- Meta POST envelope validation;
- text/image/audio/document inbound normalization;
- status webhook acceptance without creating an inbound message;
- unsupported message types ignored without crashing the webhook;
- idempotent inbound claim semantics;
- Supabase RPC adapter mapping;
- official WhatsApp outbound text/image/template request shapes;
- normalized provider errors without exposing credentials;
- outbound-message persistence after provider success only;
- conversation AI/human/paused control semantics;
- AI reply blocking while human-owned, paused, closed, or requiring attention;
- customer email/profile domain fields.

Latest implementation/fix CI checkpoint executed repository tests, TypeScript typecheck and build successfully.

## Supabase verification

Live project: `ijquzclfijwfgwupoxmg`.

Tracked live migrations through this checkpoint:

- `20260915155520 add_idempotent_whatsapp_ingest`
- `20260916173531 conversation_control_customer_profile`
- `20260916173939 fix_whatsapp_ingest_variable_conflict`

A transaction-scoped acceptance probe (rolled back after inspection) proved:

- first inbound claim: `accepted = true`;
- replay of the same WhatsApp message ID: `accepted = false`;
- exactly one customer for the test phone;
- exactly one open conversation;
- exactly one stored message for the replayed WhatsApp message ID;
- conversation mode can change `ai → human → ai`;
- customer `first_contact_at` and `last_interaction_at` are populated;
- customer email remains nullable until collected later.

During this probe an ambiguity in the PL/pgSQL `ON CONFLICT` expression was discovered. Root cause was an output variable named `customer_id` conflicting with the partial unique-index inference column. The regression was reproduced, the minimal `#variable_conflict use_column` correction was verified in a rollback transaction, then deployed as migration `20260916173939`.

RPC execution privileges were rechecked: only `postgres` and `service_role` can execute `public.ingest_whatsapp_inbound(...)`.

Supabase security advisor after the migrations: no lints. Performance advisor reports 25 `unused_index` informational notices on the still-empty/low-traffic schema; no indexes are removed at this stage because their real operational query paths have not yet been exercised.

## Live Meta acceptance still required

Do not mark Phase 1 fully accepted until the API is deployed behind a public HTTPS URL and real Meta configuration is available server-side.

Required server environment:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_APP_SECRET`

Real-environment acceptance sequence:

1. Configure Meta webhook callback to `GET/POST /webhooks/whatsapp` on the deployed API.
2. Complete Meta GET verification using the configured verify token.
3. Send one real customer text to the Caneca Fácil WhatsApp number.
4. Confirm one customer, one open conversation and one inbound message in Supabase.
5. Replay the same signed webhook payload and confirm no duplicate message row or downstream processing.
6. Send one outbound text through the official Meta Cloud API and confirm its provider message ID is persisted as `direction = outbound`.
7. Switch the conversation `ai → human`; confirm automated reply eligibility is false while project/conversation context remains intact.
8. Switch `human → ai`; confirm automation eligibility is restored.
9. Re-run repository verification and Supabase security advisor.

## Phase 1 exit decision

The implementation and database portions of Phase 1 are ready for live integration testing. The Phase 1 exit gate remains **pending** until steps 1–8 above are exercised against a deployed API and the real Meta WhatsApp account. Creative AI Phase 2 must not be treated as production-ready before this live gate is closed.
