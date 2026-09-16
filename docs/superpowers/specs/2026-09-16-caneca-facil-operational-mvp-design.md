# Caneca Fácil — Operational MVP Design

**Date:** 2026-09-16  
**Status:** Proposed for implementation  
**Repository:** `osvaldosereia/CHAT`  
**Primary branch:** `feat/caneca-facil-foundation`

> This specification supersedes the earlier MVP framing where necessary. The existing technical foundation, project/art versioning, Supabase schema, Admin shell and WhatsApp ingestion work should be reused and expanded rather than discarded.

## 1. Product Goal

Caneca Fácil is a WhatsApp-first commerce and production system for personalized mugs.

There is no public storefront in the MVP. The entire customer journey happens through the official WhatsApp Business Platform (Meta Cloud API), while an internal Admin controls conversations, customers, orders, artwork, print production, models/inspiration, prices, shipping, payment and automation settings.

The system must support the complete operational journey:

`WhatsApp → intelligent briefing → artwork → mockup → customer approval → order → customer data → shipping → PIX → payment confirmation → print file → production → shipment → tracking → delivery`

The platform must also preserve enough structured events and customer data to add abandoned-cart recovery, post-sale automation, repurchase, evaluation requests, campaigns and other e-commerce lifecycle automations later without redesigning the core database.

## 2. Core Architectural Principles

1. **WhatsApp is the storefront.** No customer-facing website is required for the MVP.
2. **Meta Cloud API is the official messaging channel.** The main path must not depend on unofficial WhatsApp gateways.
3. **Project, order and production are separate domains.** A creative project can exist without a sale; a paid order references a specific approved art version; production only processes financially released orders.
4. **AI understands; the system decides.** AI may interpret customer intent, organize a briefing and generate creative assets, but prices, discounts, totals, shipping costs, payment status and production release are deterministic backend responsibilities.
5. **Approved artwork is immutable for production.** The exact approved art version is pinned to the order. Later edits create new versions and require a new approval cycle.
6. **Admin is operational, not decorative.** Every initial screen must exist because somebody needs it to sell, produce, ship or correct an exception.
7. **Human takeover is first-class.** A staff member must be able to assume, pause and return a conversation to AI without losing context.
8. **Event history is permanent.** Important business transitions are appended as events rather than silently overwritten.
9. **Build the lifecycle foundation now, activate marketing later.** Store the facts required for future automation without building campaign tooling in the first MVP.
10. **Reuse the current Caneca Fácil foundation.** Existing project statuses, art/mockup versioning, WhatsApp normalization and Supabase security should be evolved rather than restarted.

## 3. End-to-End Customer Flow

### 3.1 Conversation Entry

A customer starts a WhatsApp conversation.

The system identifies the customer primarily through the normalized WhatsApp phone number and retrieves any existing customer profile, open conversation, active creative project and relevant unfinished order.

The AI should not begin with a long form. It should quickly determine whether the customer:

- has an image/model they want to use as inspiration;
- wants to describe the mug from scratch;
- wants to resume a previous creation/order.

### 3.2 Receiving References

The customer may send:

- text only;
- audio only;
- one or more images;
- images plus audio explaining the requested changes;
- documents when relevant.

Audio is transcribed. Images, captions, transcription and text are combined into one structured project context.

Original media must always be preserved in private storage.

### 3.3 Intelligent Briefing

The AI builds a structured briefing containing, when relevant:

- occasion;
- recipient;
- main theme;
- desired style;
- color preferences;
- names;
- dates;
- mandatory text;
- mandatory elements;
- forbidden elements;
- reference items;
- composition notes;
- creative direction;
- missing information;
- readiness/confidence state.

The AI must ask only for missing information and must not repeat questions already answered in text, audio or image context.

Questions should be short and conversational, normally one decision at a time.

### 3.4 Inspiration Library

When useful, the AI may search the internal model/inspiration library and present a small number of relevant references.

The library guides direction; it does not force copying. The customer can always request a creation from scratch.

### 3.5 Artwork Generation

The system generates an internal master artwork using the current mug/print template and the approved briefing.

The master artwork is not sent directly to the customer in the normal MVP flow.

Generation is followed by limited automated validation. A bounded number of automatic correction attempts is allowed; after that the project moves to human review rather than looping indefinitely.

### 3.6 Customer Mockup

A commercial mockup is generated from the current artwork.

The mockup must:

- be a single image;
- clearly show both sides of the mug;
- be visually commercial/emotional;
- correspond exactly to the art version being reviewed.

The mockup is sent through WhatsApp for approval.

### 3.7 Revision and Approval

The customer can approve or request changes through text or audio.

A change request produces a new briefing/art/mockup version. Previous versions remain preserved.

Approval requires an explicit affirmative customer message such as an unambiguous equivalent of “approved” or “can produce”. The system records:

- approved art version ID;
- approved mockup version ID;
- approval message;
- approval timestamp.

The approved creative version becomes the commercial reference for the order.

### 3.8 Order Creation

An order is created after creative approval and purchase intent.

The order captures a snapshot of:

- customer;
- approved project/art/mockup;
- mug/product type;
- quantity;
- unit price;
- discount rule applied;
- discount amount;
- subtotal;
- shipping amount;
- final total.

Future price changes must not alter existing orders.

### 3.9 Customer Data Collection

Before payment, the system ensures the required customer data is complete:

- full name;
- WhatsApp phone;
- email;
- postal code;
- street;
- number;
- complement when present;
- district;
- city;
- state.

CPF may remain optional initially unless required by the selected payment/shipping/fiscal flow.

A customer can have multiple addresses; addresses are not overwritten globally when one order ships elsewhere.

### 3.10 Quantity Discounts

Discount rules are configured in Admin, not hardcoded in AI prompts.

The backend determines the valid price and discount for the requested quantity. The AI only communicates the resulting commercial condition.

The initial model should support configurable quantity bands and be extensible to percentage discounts or fixed unit prices later.

### 3.11 Shipping

The system uses Melhor Envio for shipping quotation and, in the planned complete integration, label purchase/generation, tracking and shipment status events.

Shipping calculation uses product/package dimensions, weight, declared value, origin address and destination address from system configuration/customer data.

The selected shipping option is persisted as an order shipment snapshot.

Shipment is modeled as a separate entity so re-shipment or replacement can be supported later without corrupting the original order.

### 3.12 PIX Payment

PIX is the only payment method in the initial operation.

Payment must be modeled as a real entity rather than a boolean. It stores at least:

- provider/external reference;
- amount;
- QR/copy-paste representation when applicable;
- expiration;
- status;
- confirmation timestamp;
- provider event payload/reference.

The target flow is dynamic PIX with automatic confirmation by webhook.

The production system must not rely solely on customer-submitted payment screenshots as final proof of payment.

### 3.13 Production Release

An order may enter production only when all three conditions are true:

1. approved art version is pinned to the order;
2. payment is confirmed;
3. a valid print file exists for the pinned approved art/template.

This must be enforced by backend rules, not only by UI labels.

### 3.14 Print File

The print file is a technical artifact and is separate from the commercial mockup.

It is generated from the approved artwork using the configured print template and is linked directly to the order’s approved art version.

Production must never resolve the print asset from `current_art_version_id`; it must resolve from the order-pinned approved art version.

### 3.15 Production

Initial production stages:

- waiting production;
- printing;
- print completed;
- quality/conference;
- packaging;
- ready to ship.

Every production transition records who changed it and when.

### 3.16 Shipment and Customer Notifications

Customer WhatsApp notifications should be useful, not noisy.

Recommended initial notification events:

- payment confirmed;
- production started;
- ready for shipment;
- shipment posted/tracking available;
- delivery problem requiring attention;
- delivered.

Internal production events come from Caneca Fácil. Logistics events come from Melhor Envio/webhook when available.

### 3.17 Human Handoff

Every conversation has an operational mode:

- `ai`;
- `human`;
- `paused`.

Admin actions:

- assume conversation;
- return conversation to AI;
- pause automation.

When in human mode, AI must not send customer replies automatically.

When returned to AI, the assistant resumes using the full structured state rather than restarting the conversation.

### 3.18 Interrupted Journeys

The system must preserve where the customer stopped, for example:

- incomplete briefing;
- reference collection;
- mockup waiting approval;
- change requested;
- checkout/customer data incomplete;
- shipping choice pending;
- PIX pending.

No recovery campaigns are required in the first MVP, but the system must emit/persist lifecycle events so they can be added later.

## 4. Domain Separation and State Models

### 4.1 Conversation

Purpose: messaging context and control.

Key state:

- open / closed;
- AI / human / paused;
- active project;
- active order when applicable;
- last inbound/outbound activity;
- waiting-for-customer/intervention markers.

### 4.2 Creative Project

Reuse and extend the existing creative states:

- `new`;
- `collecting_references`;
- `building_briefing`;
- `waiting_customer`;
- `ready_to_generate`;
- `generating_art`;
- `validating_art`;
- `generating_mockup`;
- `waiting_approval`;
- `change_requested`;
- `needs_review`;
- `approved`;
- `failed`.

A project may never become an order.

### 4.3 Order

Initial order statuses:

- `draft`;
- `collecting_customer_data`;
- `calculating_shipping`;
- `waiting_shipping_choice`;
- `waiting_payment`;
- `paid`;
- `in_production`;
- `ready_to_ship`;
- `shipping_label_ready`;
- `shipped`;
- `delivered`;
- `cancelled`;
- `problem`.

Operational warning/exception state should be modeled independently where possible so the underlying business stage is not lost.

### 4.4 Payment

Suggested statuses:

- `created`;
- `pending`;
- `paid`;
- `expired`;
- `cancelled`;
- `refunded` when supported later;
- `problem`.

### 4.5 Production Job

Suggested statuses:

- `blocked`;
- `ready`;
- `printing`;
- `printed`;
- `quality_check`;
- `packaging`;
- `ready_to_ship`;
- `completed`;
- `problem`.

### 4.6 Shipment

Suggested statuses are mapped from the selected shipping provider and normalized internally, for example:

- `quoted`;
- `selected`;
- `label_ready`;
- `posted`;
- `in_transit`;
- `delivery_issue`;
- `delivered`;
- `cancelled`.

Provider-specific raw statuses/events are retained for audit.

## 5. Admin Information Architecture

Initial navigation:

`Início | Atendimento | Pedidos | Artes & Produção | Clientes | Modelos | Configurações`

### 5.1 Início

Purpose: operational queue, not analytics.

Show high-priority counts/shortcuts:

- conversations waiting;
- conversations needing human intervention;
- mockups waiting approval;
- projects needing review;
- pending PIX;
- paid orders waiting production;
- orders in production;
- ready-to-ship orders;
- shipping/delivery problems.

### 5.2 Atendimento

Three-column working layout:

- conversation list;
- WhatsApp conversation/media stream;
- customer/project/order context.

Must expose:

- conversation mode: AI/human/paused;
- assume/return/pause controls;
- messages, audio and image references;
- audio transcription;
- current structured briefing summary;
- missing information;
- project state;
- current mockup/art reference;
- order state when created;
- “needs attention” reason.

Do not expose hidden model chain-of-thought. Only expose structured business state and AI-extracted fields.

### 5.3 Pedidos

List filters:

- new/draft;
- waiting data;
- waiting PIX;
- paid;
- production;
- ready to ship;
- shipped;
- delivered;
- problem/cancelled.

Order detail sections:

- customer;
- commercial values;
- approved artwork/mockup;
- payment;
- production;
- shipment/tracking;
- chronological event history.

### 5.4 Artes & Produção

Two operational views:

**Creation**
- collecting data;
- generating;
- waiting approval;
- change requested;
- needs review;
- approved.

**Production**
- blocked;
- ready to print;
- printing;
- printed;
- quality check;
- packaging;
- ready to ship.

Production cards should prioritize:

- order number;
- customer;
- quantity;
- mug/product type;
- approved mockup preview;
- print file access;
- blockers;
- production action.

### 5.5 Clientes

Search by at least:

- name;
- WhatsApp/phone;
- email.

Customer detail tabs:

- summary;
- orders;
- artworks/projects;
- conversations;
- addresses.

Stored lifecycle summaries should include first contact, last interaction, last order, order count and cumulative purchase amount when derivable.

### 5.6 Modelos

Gallery of internal inspiration/model references.

Each model stores:

- image/media;
- name;
- category;
- occasion;
- style;
- tags;
- color descriptors;
- AI-facing description;
- origin/source type;
- reusable-as-inspiration flag;
- active/inactive.

Initial search uses text/category/tags/style/occasion. Visual/semantic retrieval may be added later.

Completed customer artwork may be promoted to the inspiration library only through an explicit admin action and only after removing/private-separating customer-specific content where necessary.

### 5.7 Configurações

Subsections:

#### AI Attendant
- active/paused;
- identity/name/company;
- response style rules;
- one-question-at-a-time behavior;
- handoff conditions;
- customer interaction rules;
- active configuration version;
- test mode/simulator.

#### Business Knowledge
- company information;
- production times;
- product/material care;
- revision policy;
- shipping/payment FAQ;
- other editable operational knowledge.

#### Products/Mugs
- product/model name;
- active state;
- capacity;
- base price;
- weight/package dimensions;
- print template;
- mockup template/configuration.

#### Artwork Generation
- image-generation provider/model settings;
- generation quality/options;
- validation policy;
- max automatic correction attempts;
- print dimensions/resolution/template.

#### Pricing and Discounts
- quantity bands;
- discount policy;
- effective dates if needed later.

#### WhatsApp / Meta
- operational integration status;
- WABA/phone configuration references;
- template mapping/status information;
- webhook health/status.

Secrets must not be exposed to the browser.

#### PIX
- provider configuration/status;
- webhook status;
- payment expiration/business rules.

#### Melhor Envio
- integration status;
- origin address;
- packaging defaults;
- shipping rules;
- webhook status.

## 6. Admin Roles and Permissions

Initial roles:

### 6.1 Administrator

Full access to all modules and settings.

### 6.2 Atendimento/Vendas

Allowed:

- conversations;
- customer records;
- projects and mockup review context;
- orders and commercial state;
- customer-facing shipping/payment status.

Restricted:

- system integrations/secrets;
- destructive configuration;
- direct production settings unless explicitly granted later.

### 6.3 Produção/Expedição

Allowed only what is needed to fulfill orders:

- paid/released order details;
- quantity/product;
- approved mockup preview;
- print file;
- production transitions;
- required address/shipment information;
- label/tracking operations.

Should not require access to the full private customer conversation history.

## 7. Data Model Evolution

Reuse existing tables:

- `customers`;
- `conversations`;
- `messages`;
- `mug_templates`;
- `mug_projects`;
- `project_media`;
- `audio_transcriptions`;
- `briefings`;
- `art_versions`;
- `mockup_versions`;
- `review_events`.

Add domain structures approximately equivalent to:

- `customer_addresses`;
- `orders`;
- `order_items`;
- `order_events`;
- `payments`;
- `production_jobs`;
- `print_files`;
- `shipments`;
- `shipping_events`;
- `products` or an equivalent commercial mug/product definition;
- `discount_rules`;
- `model_library`;
- `model_categories` / `model_tags` as needed;
- AI configuration/version tables;
- business knowledge/configuration tables;
- admin role/permission structure;
- generic lifecycle/business events where not covered by the domain event tables.

Extend `customers` with email and customer profile fields, but keep addresses in a separate table.

Extend `conversations` with operational automation control state or provide an associated conversation-control table.

Orders must pin the approved art/mockup version IDs or an immutable approval snapshot.

## 8. Lifecycle Events for Future Commerce Automation

From the first production release, persist meaningful events such as:

- `conversation_started`;
- `project_created`;
- `briefing_ready`;
- `mockup_sent`;
- `change_requested`;
- `art_approved`;
- `checkout_started`;
- `customer_data_completed`;
- `shipping_quoted`;
- `shipping_selected`;
- `pix_created`;
- `payment_confirmed`;
- `production_started`;
- `production_completed`;
- `shipment_created`;
- `shipped`;
- `delivery_issue`;
- `delivered`.

Later automations such as abandoned PIX, abandoned project, post-sale, repurchase and review requests can be expressed as conditions over these events and timestamps.

The initial MVP stores events but does not build a marketing automation UI.

## 9. Integrations

### 9.1 Meta WhatsApp Cloud API

Direct official integration for inbound/outbound customer messaging.

Backend responsibilities include:

- webhook verification;
- webhook POST processing;
- idempotent inbound storage;
- media retrieval/storage;
- outbound messaging;
- template/24-hour-window handling;
- delivery/message status events where useful;
- human/AI send coordination.

### 9.2 OpenAI

Used for AI capabilities such as:

- audio transcription;
- multimodal understanding;
- structured briefing extraction;
- conversation response generation;
- artwork/mockup generation or orchestration depending on selected image model/provider;
- limited creative validation/edit interpretation.

OpenAI is not the source of truth for pricing, discounts, order totals, payment state or shipping prices.

### 9.3 Melhor Envio

Planned complete operational integration:

- quote shipping;
- persist selected service;
- create/purchase shipment label when appropriate;
- expose printable label;
- receive tracking/status webhooks;
- normalize logistics events into order/shipment history;
- trigger appropriate WhatsApp notifications.

### 9.4 PIX Provider

Provider is configurable/selected during implementation planning.

Required capabilities:

- create dynamic PIX charge;
- QR/copy-paste representation;
- webhook-based payment confirmation;
- idempotent payment-event processing;
- query/reconciliation path for missed webhooks.

## 10. Security and Data Handling

- Supabase RLS remains enabled on exposed tables.
- Private media buckets remain private.
- `service_role`/server secret is backend-only.
- Integration secrets never enter browser-exposed environment variables.
- Admin authorization is role-based, not simply “authenticated means admin”.
- Sensitive backend functions must have tightly scoped execute permissions.
- Raw external webhook payloads may be retained for audit where useful, but UI should expose normalized operational data.
- Customer-uploaded media and personal data must not be promoted to public/shared model libraries without explicit admin action and appropriate sanitization.

## 11. MVP Operational Definition of Done

The first operational MVP is complete when the following path works end to end in a real test:

1. Customer sends a WhatsApp message.
2. System stores/normalizes the customer and conversation.
3. Customer sends audio and/or image references.
4. AI extracts a structured briefing and asks only missing questions.
5. System generates artwork and a two-sided mockup.
6. Mockup is sent through official WhatsApp.
7. Customer requests a change or approves.
8. Approval pins the exact art/mockup version.
9. Order is created with quantity and configured pricing/discount.
10. Customer name, email and delivery address are complete.
11. Melhor Envio returns usable shipping options and one is selected.
12. Final total is calculated by the backend.
13. Dynamic PIX is created and sent.
14. Payment webhook confirms payment idempotently.
15. Print file is generated from the pinned approved art.
16. Production is released only after payment + approved art + print file.
17. Admin can progress the production job.
18. Shipping label/tracking is created.
19. Shipment updates flow into Admin and selected WhatsApp notifications.
20. Delivered order remains fully traceable through customer, project, order, payment, production and shipment history.

## 12. Explicitly Out of Scope for the First MVP

Do not block launch on:

- public e-commerce storefront;
- campaign builder;
- abandoned-cart/PIX automated campaigns;
- advanced post-sale automations;
- loyalty program;
- coupon engine beyond basic planned pricing/discount rules;
- advanced CRM segmentation;
- advanced marketing analytics;
- accounting/ERP replacement;
- multiple AI agents;
- visual workflow builder;
- semantic/vector model search;
- complex warehouse management.

The architecture must allow these later without requiring a core redesign.

## 13. Implementation Strategy

Continue from `feat/caneca-facil-foundation`.

Preserve and reuse:

- monorepo foundation;
- CI/test/build setup;
- Supabase project/schema/security foundation;
- existing project state machine;
- customer/phone normalization foundation;
- Admin authentication shell and current project/template views where useful;
- WhatsApp event normalization/idempotency work;
- art/mockup version model.

The implementation should proceed in vertical operational slices rather than building every Admin screen first. The preferred sequence is:

1. reconcile GitHub schema/migrations with live Supabase state;
2. finish official WhatsApp inbound/outbound path;
3. build conversation control + customer profile foundation;
4. implement media/transcription/briefing orchestration;
5. implement artwork/mockup/revision/approval loop;
6. implement products/pricing/discounts + order domain;
7. implement customer addresses + Melhor Envio quotation;
8. implement dynamic PIX + confirmation;
9. implement print-file generation + production gate/queue;
10. implement Melhor Envio labels/tracking notifications;
11. complete Admin navigation/roles and operational polish;
12. run one complete end-to-end acceptance scenario and security/advisor checks.

Every new behavior should be tested, and database/security changes should be verified against Supabase advisors before completion.
