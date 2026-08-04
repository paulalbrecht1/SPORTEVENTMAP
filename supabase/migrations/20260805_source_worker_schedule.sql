-- Secure pg_cron -> Edge Function scheduling. Runtime credentials live only in
-- Supabase Vault and a one-way SHA-256 digest is used to authenticate cron.

begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists private.event_source_cron_credentials (
  credential_name text primary key,
  secret_sha256 text not null check (secret_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

revoke all on private.event_source_cron_credentials from public, anon, authenticated;

create or replace function public.verify_event_source_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, extensions, private
as $$
  select exists (
    select 1
    from private.event_source_cron_credentials
    where credential_name = 'event_source_check'
      and secret_sha256 = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
  );
$$;

revoke all on function public.verify_event_source_cron_secret(text) from public, authenticated;
grant execute on function public.verify_event_source_cron_secret(text) to anon, service_role;

create or replace function private.install_event_source_check_cron()
returns void
language plpgsql
security definer
set search_path = pg_catalog, cron, net, vault, private
as $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'sem_function_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'sem_anon_jwt')
     or not exists (select 1 from vault.decrypted_secrets where name = 'sem_source_check_cron_secret') then
    raise exception 'Required Vault secrets are missing' using errcode = '55000';
  end if;

  if exists (select 1 from cron.job where jobname = 'sem-event-source-check') then
    perform cron.unschedule('sem-event-source-check');
  end if;

  perform cron.schedule(
    'sem-event-source-check',
    '*/15 * * * *',
    $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'sem_function_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sem_anon_jwt'),
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sem_source_check_cron_secret')
        ),
        body := '{"batch_size": 5}'::jsonb,
        timeout_milliseconds := 5000
      );
    $cron$
  );
end;
$$;

revoke all on function private.install_event_source_check_cron() from public, anon, authenticated;

comment on function public.verify_event_source_cron_secret(text) is
  'One-way verification for JWT-gated pg_cron Edge Function calls; the plaintext secret remains in Vault.';

commit;
