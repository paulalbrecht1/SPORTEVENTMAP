import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { buildWebhookPayload, clipText } from "../_shared/data-alert-dispatch-core.mjs";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function parseJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
  } catch {
    return null;
  }
}

function readKeyDictionary(name: string) {
  try { return JSON.parse(Deno.env.get(name) || "{}"); } catch { return {}; }
}

function runtimeKeys() {
  const publishable = readKeyDictionary("SUPABASE_PUBLISHABLE_KEYS");
  const secret = readKeyDictionary("SUPABASE_SECRET_KEYS");
  return {
    serviceKey: Deno.env.get("SUPABASE_SECRET_KEY") ||
      secret.default ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  };
}

async function isAuthorized(request: Request, admin: ReturnType<typeof createClient>) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (parseJwtPayload(token)?.role === "service_role") return true;

  const cronSecret = request.headers.get("x-cron-secret") || "";
  if (!cronSecret) return false;
  const { data, error } = await admin.rpc("verify_event_source_cron_secret", {
    p_secret: cronSecret
  });
  return !error && data === true;
}

async function recordDelivery(
  admin: ReturnType<typeof createClient>,
  claimToken: string,
  success: boolean,
  httpStatus: number | null,
  responseExcerpt: string | null,
  errorMessage: string | null
) {
  const { error } = await admin.rpc("record_data_alert_delivery", {
    p_claim_token: claimToken,
    p_success: success,
    p_http_status: httpStatus,
    p_response_excerpt: responseExcerpt,
    p_error_message: errorMessage
  });
  if (error) throw new Error(`delivery audit failed: ${error.message}`);
}

function buildTestNotification(
  snapshot: Record<string, unknown> | null,
  kind: "critical" | "recovery" = "critical"
) {
  const isRecovery = kind === "recovery";
  return {
    claim_token: "controlled-test",
    kind,
    status: "test",
    title: isRecovery
      ? "RECOVERY-TEST \u2013 SportEventMap Slack-Alarmierung"
      : "TESTALARM \u2013 SportEventMap Slack-Alarmierung",
    captured_at: new Date().toISOString(),
    snapshot_id: snapshot?.id || null,
    metrics: {
      catalog_rows: snapshot?.catalog_rows || 0,
      expected_catalog_rows: snapshot?.expected_catalog_rows || 0,
      fresh_editions: snapshot?.fresh_editions || 0,
      current_editions: snapshot?.current_editions || 0,
      freshness_percent: snapshot?.freshness_percent || 0,
      overdue_sources: snapshot?.overdue_sources || 0,
      recent_failures: snapshot?.recent_failures || 0,
      open_critical_alerts: snapshot?.open_critical_alerts || 0,
      open_error_alerts: snapshot?.open_error_alerts || 0
    },
    signals: snapshot?.signal_statuses || {},
    open_alerts: isRecovery ? [] : [
      { alert_code: "controlled_test", severity: "test", alert_count: 1 }
    ]
  };
}

async function dispatchWebhook(
  admin: ReturnType<typeof createClient>,
  notification: Record<string, unknown>,
  status: string,
  auditDelivery: boolean
) {
  const webhookUrl = (Deno.env.get("DATA_ALERT_WEBHOOK_URL") || "").trim();
  if (!webhookUrl) {
    return response({
      status,
      delivery: "not_configured",
      pending_kind: notification.kind
    });
  }

  let target: URL;
  try {
    target = new URL(webhookUrl);
    if (target.protocol !== "https:") throw new Error("HTTPS is required");
  } catch (configurationError) {
    const message = configurationError instanceof Error
      ? configurationError.message
      : "invalid webhook URL";
    if (auditDelivery) {
      await recordDelivery(
        admin,
        String(notification.claim_token),
        false,
        null,
        null,
        message
      );
    }
    return response({ error: "invalid_webhook_configuration" }, 500);
  }

  const format = Deno.env.get("DATA_ALERT_WEBHOOK_FORMAT") || "generic";
  const dashboardUrl = Deno.env.get("DATA_ALERT_DASHBOARD_URL") || "";
  const bearerToken = Deno.env.get("DATA_ALERT_WEBHOOK_BEARER_TOKEN") || "";
  const payload = buildWebhookPayload(notification, { format, dashboardUrl });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  try {
    const webhookResponse = await fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(10000)
    });
    const responseExcerpt = clipText(await webhookResponse.text(), 1000);
    const success = webhookResponse.ok;
    if (auditDelivery) {
      await recordDelivery(
        admin,
        String(notification.claim_token),
        success,
        webhookResponse.status,
        responseExcerpt || null,
        success ? null : `webhook returned HTTP ${webhookResponse.status}`
      );
    }
    return response({
      status,
      test: !auditDelivery,
      delivery: success
        ? (auditDelivery ? "sent" : "test_sent")
        : "failed",
      http_status: webhookResponse.status
    }, success ? 200 : 502);
  } catch (deliveryError) {
    const message = deliveryError instanceof Error
      ? deliveryError.message
      : String(deliveryError);
    if (auditDelivery) {
      await recordDelivery(
        admin,
        String(notification.claim_token),
        false,
        null,
        null,
        clipText(message, 1000)
      );
    }
    return response({
      error: "webhook_delivery_failed",
      test: !auditDelivery
    }, 502);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return response({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const { serviceKey } = runtimeKeys();
  if (!supabaseUrl || !serviceKey) {
    return response({ error: "server_configuration_missing" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  if (!await isAuthorized(request, admin)) {
    return response({ error: "unauthorized" }, 401);
  }

  let requestBody: Record<string, unknown> = {};
  try {
    const rawBody = await request.text();
    requestBody = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return response({ error: "invalid_json" }, 400);
  }

  if (requestBody.test === true) {
    const testKind = requestBody.test_kind === "recovery"
      ? "recovery"
      : "critical";
    const { data: snapshot, error: snapshotError } = await admin
      .from("data_freshness_snapshots")
      .select([
        "id", "catalog_rows", "expected_catalog_rows", "fresh_editions",
        "current_editions", "freshness_percent", "overdue_sources",
        "recent_failures", "open_critical_alerts", "open_error_alerts",
        "signal_statuses"
      ].join(","))
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snapshotError) {
      return response({
        error: "test_snapshot_failed",
        detail: clipText(snapshotError.message, 500)
      }, 500);
    }
    return dispatchWebhook(
      admin,
      buildTestNotification(snapshot, testKind),
      "test",
      false
    );
  }

  const { data, error } = await admin.rpc("run_data_freshness_monitor");
  if (error) {
    return response({ error: "monitor_failed", detail: clipText(error.message, 500) }, 500);
  }

  const notification = data?.notification;
  if (!notification) {
    return response({ status: data?.status || "unknown", delivery: "not_due" });
  }
  return dispatchWebhook(admin, notification, data.status, true);
});
