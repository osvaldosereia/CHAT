-- Full catalog search support v0
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

alter table products
  add column if not exists search_text text not null default '';

create index if not exists products_search_text_trgm_idx
  on products using gin (search_text extensions.gin_trgm_ops);
