
create schema if not exists private;

create table if not exists private.public_rate_limits (
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (key_hash, window_start)
);

create or replace function public.consume_public_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_key_hash is null or length(p_key_hash) < 16 then
    return false;
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.public_rate_limits(key_hash, window_start, request_count, updated_at)
  values (p_key_hash, v_window, 1, now())
  on conflict (key_hash, window_start)
  do update
    set request_count = private.public_rate_limits.request_count + 1,
        updated_at = now()
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_public_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, integer, integer)
  to service_role;
