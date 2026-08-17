-- Cover alert-delivery foreign keys reported by the production advisor.

begin;

create index if not exists data_alert_deliveries_snapshot_idx
  on public.data_alert_deliveries (snapshot_id)
  where snapshot_id is not null;
create index if not exists data_alert_notification_state_claim_snapshot_idx
  on public.data_alert_notification_state (claim_snapshot_id)
  where claim_snapshot_id is not null;
create index if not exists data_alert_notification_state_last_delivery_idx
  on public.data_alert_notification_state (last_delivery_id)
  where last_delivery_id is not null;

commit;
