-- Full catalog search support v0
create extension if not exists pg_trgm;

alter table products
  add column if not exists search_text text not null default '';

create index if not exists products_search_text_trgm_idx
  on products using gin (search_text gin_trgm_ops);
