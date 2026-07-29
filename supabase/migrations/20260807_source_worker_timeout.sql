-- Allow the sequential five-source worker batch to finish within pg_net's
-- response window. Each source may perform a robots.txt request and a source
-- request with a 12-second per-request timeout.

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
        timeout_milliseconds := 120000
      );
    $cron$
  );
end;
$$;

revoke all on function private.install_event_source_check_cron() from public, anon, authenticated;

do $install$
begin
  if exists (select 1 from vault.decrypted_secrets where name = 'sem_function_url')
     and exists (select 1 from vault.decrypted_secrets where name = 'sem_anon_jwt')
     and exists (select 1 from vault.decrypted_secrets where name = 'sem_source_check_cron_secret') then
    perform private.install_event_source_check_cron();
  end if;
end
$install$;
