# Supabase database history

The live Supabase project for Caneca Fácil is `ijquzclfijwfgwupoxmg`.

## Baseline

`supabase/schema/initial_caneca_facil.sql` is a historical baseline snapshot of the initial Caneca Fácil schema. That baseline is already present in production and must not be reapplied as a new migration.

The first migration currently tracked by the live project is:

- version: `20260915155520`
- name: `add_idempotent_whatsapp_ingest`

The repository file `supabase/migrations/20260915155520_add_idempotent_whatsapp_ingest.sql` mirrors the live `public.ingest_whatsapp_inbound(...)` function and its execution permissions so repository history matches the production migration contract.

## Rule for all future database changes

Every schema change after `20260915155520` must be implemented as a forward migration under `supabase/migrations/` and applied through Supabase migration tooling. Do not edit the historical baseline to represent new production changes.

Before and after DDL changes:

1. inspect live tables/migrations;
2. keep RLS enabled for exposed tables;
3. scope grants explicitly;
4. run Supabase security and performance advisors;
5. verify the resulting schema and behavior.

Never commit production secrets or service-role credentials to this public repository.
