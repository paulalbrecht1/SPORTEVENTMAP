import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(
  root,
  "supabase/migrations/20260812063022_data_freshness_alert_dispatch.sql"
), "utf8");
const edgeFunction = fs.readFileSync(path.join(
  root,
  "supabase/functions/data-alert-dispatch/index.ts"
), "utf8");

for (const table of [
  "data_freshness_settings",
  "data_freshness_snapshots",
  "data_alert_notification_state",
  "data_alert_deliveries"
]) {
  assert.match(
    migration,
    new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    `${table} must have RLS enabled`
  );
  assert.match(
    migration,
    new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, "i"),
    `${table} must not retain default Data API grants`
  );
}

assert.match(migration, /grant execute on function public\.run_data_freshness_monitor\(\) to service_role/i);
assert.match(migration, /service role required/);
assert.doesNotMatch(migration, /grant execute on function public\.run_data_freshness_monitor\(\) to anon/i);
assert.match(migration, /pg_try_advisory_xact_lock/i);
assert.match(migration, /notification_cooldown_minutes integer not null default 720/i);
assert.match(migration, /claim_expires_at = now\(\) \+ interval '10 minutes'/i);
assert.match(migration, /x-cron-secret/i);
assert.match(migration, /sem_anon_jwt/i);

assert.match(edgeFunction, /DATA_ALERT_WEBHOOK_URL/);
assert.match(edgeFunction, /target\.protocol !== "https:"/);
assert.match(edgeFunction, /redirect: "error"/);
assert.match(edgeFunction, /AbortSignal\.timeout\(10000\)/);
assert.match(edgeFunction, /requestBody\.test === true/);
assert.match(edgeFunction, /requestBody\.test_kind === "recovery"/);
assert.match(edgeFunction, /TESTALARM \\u2013 SportEventMap Slack-Alarmierung/);
assert.match(edgeFunction, /RECOVERY-TEST \\u2013 SportEventMap Slack-Alarmierung/);
assert.match(edgeFunction, /auditDelivery: boolean/);
assert.doesNotMatch(edgeFunction, /request\.json\(\).*webhook/is);
assert.doesNotMatch(edgeFunction, /Access-Control-Allow-Origin/i);

console.log("Data alert security verified: RLS, explicit grants, service-only RPC and HTTPS webhook.");
