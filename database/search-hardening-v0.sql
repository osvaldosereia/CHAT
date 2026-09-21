-- Move pg_trgm out of public for security hygiene.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
