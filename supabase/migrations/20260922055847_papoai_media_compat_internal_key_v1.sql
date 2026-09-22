
begin;

do $$
begin
  if not exists(
    select 1 from vault.decrypted_secrets
    where name='dona_antonia_papo_media_compat_key_v1'
  ) then
    perform vault.create_secret(
      'pmc_'||encode(extensions.gen_random_bytes(32),'hex'),
      'dona_antonia_papo_media_compat_key_v1',
      'Internal key for PapoAI media compatibility Edge'
    );
  end if;
end $$;

create or replace function public.get_papoai_media_compat_key_v1()
returns text
language sql
stable
security definer
set search_path=public,vault,pg_temp
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='dona_antonia_papo_media_compat_key_v1'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_papoai_media_compat_key_v1()
from public,anon,authenticated;
grant execute on function public.get_papoai_media_compat_key_v1()
to service_role;

commit;
