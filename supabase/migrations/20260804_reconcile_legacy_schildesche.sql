-- Preserve the reviewed legacy row and id, but remove its known spelling
-- duplicate from public discovery after the curated catalog import.

begin;

do $reconcile$
declare
  legacy_id bigint;
  canonical_id bigint;
begin
  select min(id) into legacy_id
  from public.events
  where canonical_key = 'inschildische-lauf-bielefeld-deutschland'
  having count(*) = 1;

  select min(id) into canonical_id
  from public.events
  where canonical_key = 'inschildesche-lauf-bielefeld-bielefeld-germany'
  having count(*) = 1;

  if legacy_id is not null and canonical_id is not null and legacy_id <> canonical_id then
    perform set_config('app.change_source', 'import', true);
    perform set_config(
      'app.change_reason',
      'Reviewed legacy spelling duplicate retained for audit; canonical catalog event is ' || canonical_id::text,
      true
    );

    update public.events
    set status = 'duplicate',
        publication_status = 'draft',
        event_status = 'inactive',
        needs_review = false,
        review_status = 'rejected',
        review_reason = 'duplicate_of_catalog_event',
        review_note = 'Canonical replacement event id: ' || canonical_id::text,
        updated_at = now()
    where id = legacy_id;

    delete from private.event_catalog_identity_aliases
    where event_id = legacy_id
       or catalog_key in (
         'inschildesche-lauf-bielefeld-deutschland',
         'inschildesche-lauf-bielefeld-bielefeld-germany'
       );

    insert into private.event_catalog_identity_aliases (catalog_key, event_id, reason)
    values (
      'inschildesche-lauf-bielefeld-bielefeld-germany',
      canonical_id,
      'Canonical mapping after reviewed legacy spelling duplicate reconciliation.'
    )
    on conflict (catalog_key) do update set
      event_id = excluded.event_id,
      reason = excluded.reason;
  end if;
end
$reconcile$;

commit;
