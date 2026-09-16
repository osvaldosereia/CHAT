# Caneca Fácil Phase 2 — Creative AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn WhatsApp text, audio, images and internal model references into a structured briefing, versioned mug artwork, two-sided mockup, revision loop and immutable customer approval.

**Architecture:** Keep AI behind explicit ports/adapters. Persist source media and structured briefing facts in Supabase, let the AI propose creative interpretation only, and preserve all art/mockup versions. The conversation orchestrator may send only validated mockups and must stop automatically when the conversation is human-owned or paused.

**Tech Stack:** TypeScript, Hono, Vitest, Supabase Storage/Postgres, OpenAI API through a backend-only adapter, official WhatsApp outbound adapter from Phase 1.

**Spec:** `docs/superpowers/specs/2026-09-16-caneca-facil-operational-mvp-design.md`

## Global Constraints

- Never expose chain-of-thought; Admin receives only structured extracted fields, state and operational reasons.
- Original customer media remains in private storage.
- AI never determines prices, discounts, freight or payment state.
- A project may exist without becoming an order.
- Every art/mockup edit creates a new version; do not overwrite customer-approved versions.
- Only a validated mockup is customer-facing; print artwork is not sent as the review asset.
- Limit automatic correction loops; unresolved generation quality becomes `needs_review`.

---

### Task 1: Build Media Retrieval, Private Storage and Audio Transcription

**Files:**
- Create: `apps/api/src/media/whatsapp-media.ts`
- Create: `apps/api/src/media/whatsapp-media.test.ts`
- Create: `apps/api/src/media/project-media-store.ts`
- Create: `apps/api/src/media/project-media-store.test.ts`
- Create: `apps/api/src/ai/transcription.ts`
- Create: `apps/api/src/ai/transcription.test.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces: `downloadWhatsAppMedia(mediaId)`, `storeProjectMedia(input)`, `transcribeAudio(input): Promise<AudioTranscript>`.
- Persists: `project_media` and `audio_transcriptions` using existing private bucket `customer-uploads`.

- [ ] Write failing tests for image/audio download metadata, private-path construction and one-transcription-per-media idempotency.
- [ ] Run `npm run test --workspace apps/api -- whatsapp-media.test.ts project-media-store.test.ts transcription.test.ts`; expect FAIL.
- [ ] Implement backend-only media download using the Phase 1 WhatsApp access token; never return credentials in errors.
- [ ] Implement private Supabase upload paths scoped by project ID and media ID.
- [ ] Implement transcription behind a `TranscriptionProvider` interface so tests use a fake provider and production uses OpenAI.
- [ ] Run API tests/typecheck/build; expect PASS.
- [ ] Commit with `feat: ingest WhatsApp media and audio`.

### Task 2: Implement Structured Briefing Extraction and Missing-Question Logic

**Files:**
- Modify: `packages/core/src/briefing.ts`
- Create: `packages/core/src/briefing.test.ts`
- Create: `apps/api/src/ai/briefing-provider.ts`
- Create: `apps/api/src/ai/briefing-provider.test.ts`
- Create: `apps/api/src/projects/briefing-orchestrator.ts`
- Create: `apps/api/src/projects/briefing-orchestrator.test.ts`

**Interfaces:**
- Produces: `BriefingDraft`, `mergeBriefing(previous, extraction)`, `getMissingBriefingInformation(briefing)`, `isBriefingReady(briefing)`.
- Consumes: conversation text, transcriptions, image references, prior briefing version and model-library metadata when available.

- [ ] Write failing core tests proving previously supplied facts are retained, explicit customer changes replace only targeted facts, and missing-information output is deterministic.
- [ ] Write adapter contract tests requiring structured JSON output only; malformed provider output must become a recoverable `needs_review`/retry condition rather than corrupting the project.
- [ ] Implement briefing merge/readiness helpers in `packages/core`.
- [ ] Implement the provider adapter and orchestration that creates a new `briefings.version`, updates `mug_projects.current_briefing_id`, and moves project state between `building_briefing`, `waiting_customer`, and `ready_to_generate`.
- [ ] Ensure the next WhatsApp question targets only the highest-priority missing fact and does not repeat known facts.
- [ ] Run `npm test && npm run typecheck && npm run build`; expect PASS.
- [ ] Commit with `feat: build intelligent mug briefings`.

### Task 3: Add the Inspiration Model Library Backend

**Files:**
- Create: `supabase/migrations/20260916_model_library.sql`
- Create: `packages/core/src/model-library.ts`
- Create: `packages/core/src/model-library.test.ts`
- Create: `apps/api/src/models/model-library-store.ts`
- Create: `apps/api/src/models/model-library-store.test.ts`

**Interfaces:**
- Produces tables `model_library`, `model_categories`, `model_tags`, `model_library_categories`, and `model_library_tags`.
- `model_library` stores media reference, name, occasion, style, color descriptors, AI description, origin, reusable flag and active state.
- `searchModels(query)` filters active/reusable records by text, category, tag, style and occasion.

- [ ] Write failing search/filter tests in `packages/core`, including combined category + tag + style filtering and exclusion of inactive/non-reusable records.
- [ ] Create the forward migration with the five tables above, unique normalized category/tag slugs, foreign keys, RLS, admin CRUD policies and private media references; customer uploads remain private and are never automatically exposed.
- [ ] Apply migration through Supabase and run security/performance advisors.
- [ ] Implement `model-library-store.ts` with create/update/search operations and deterministic filter mapping.
- [ ] Enforce `reusable=false` by default for `origin='customer'`; only an explicit Admin update may set it true after sanitization.
- [ ] Run repository verification; expect PASS.
- [ ] Commit with `feat: add mug inspiration library`.

### Task 4: Implement Artwork Generation, Validation and Versioning

**Files:**
- Create: `apps/api/src/artwork/artwork-provider.ts`
- Create: `apps/api/src/artwork/artwork-provider.test.ts`
- Create: `apps/api/src/artwork/generate-artwork.ts`
- Create: `apps/api/src/artwork/generate-artwork.test.ts`
- Create: `apps/api/src/artwork/validate-artwork.ts`
- Create: `apps/api/src/artwork/validate-artwork.test.ts`
- Modify: `packages/core/src/project-status.ts`
- Modify: `packages/core/src/project-status.test.ts`

**Interfaces:**
- Produces: immutable `art_versions` with parent/version/generation type, model, prompt metadata, storage path and validation result.
- Consumes: approved-ready briefing and mug template dimensions.

- [ ] Write failing tests for initial generation, edit generation linked to parent version, failed generation and one automatic correction retry.
- [ ] Implement `ArtworkProvider` so concrete image-model choice is configuration, not domain logic.
- [ ] Persist generated master artwork to private `artwork-master` storage and create an `art_versions` row before advancing state.
- [ ] Validate required dimensions/aspect ratio and provider/creative validation result; after one failed automatic correction, move to `needs_review`.
- [ ] Run API/core verification; expect PASS.
- [ ] Commit with `feat: generate and validate versioned artwork`.

### Task 5: Generate the Two-Sided Mockup and Run Review/Revisions

**Files:**
- Create: `apps/api/src/mockups/mockup-provider.ts`
- Create: `apps/api/src/mockups/mockup-provider.test.ts`
- Create: `apps/api/src/mockups/generate-mockup.ts`
- Create: `apps/api/src/mockups/generate-mockup.test.ts`
- Create: `apps/api/src/projects/review-orchestrator.ts`
- Create: `apps/api/src/projects/review-orchestrator.test.ts`

**Interfaces:**
- Produces: one commercial/emotional mockup image showing both sides; `mockup_versions`; `review_events`; explicit `approved_art_version_id`, `approved_mockup_id`, `approved_at`.

- [ ] Write failing tests proving the mockup is tied to one exact art version and template, and a change request never overwrites the previous version.
- [ ] Implement mockup generation into private `mockups` storage with `show_both_sides = true` from template configuration.
- [ ] Send the mockup over WhatsApp using Phase 1 outbound messaging and record `sent_for_review`.
- [ ] Interpret explicit approval/change requests into normalized review events; ambiguous messages must not approve automatically.
- [ ] On approval, pin exact art/mockup IDs on `mug_projects`; on change, create a new briefing/art cycle.
- [ ] Run repository verification; expect PASS.
- [ ] Commit with `feat: add mockup approval and revision loop`.

### Task 6: Creative Flow Acceptance Gate

**Files:**
- Create: `docs/acceptance/phase-2-creative-ai.md`

- [ ] Test one real path with image + audio reference, one AI follow-up question, generated art, two-sided mockup, customer change request, second mockup and explicit approval.
- [ ] Confirm all source media, transcriptions, briefing versions, art versions, mockup versions and review events are traceable in Supabase.
- [ ] Confirm human takeover blocks automated replies and generation continuation until returned to AI.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, then Supabase security advisor.
- [ ] Commit with `docs: verify creative AI flow`.

## Phase 2 Exit Gate

Do not begin checkout/order automation until a real WhatsApp customer can complete the full creative loop and the project stores an immutable approved art/mockup pair.
