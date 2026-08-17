const MAX_TEXT = 2800;

export function clipText(value, maximum = MAX_TEXT) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maximum) return text;
  return `${text.slice(0, Math.max(0, maximum - 1))}\u2026`;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value) {
  return `${number(value).toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })} %`;
}

function metricLines(metrics = {}) {
  return [
    `Katalog: ${number(metrics.catalog_rows)}/${number(metrics.expected_catalog_rows)}`,
    `Aktuell verifiziert: ${number(metrics.fresh_editions)}/${number(metrics.current_editions)} (${formatPercent(metrics.freshness_percent)})`,
    `\u00dcberf\u00e4llige Quellen: ${number(metrics.overdue_sources)}`,
    `Neue Fehler (60 Min.): ${number(metrics.recent_failures)}`,
    `Offene kritische Alarme: ${number(metrics.open_critical_alerts)}`
  ];
}

function alertLines(openAlerts = []) {
  return (Array.isArray(openAlerts) ? openAlerts : [])
    .slice(0, 8)
    .map(alert => `${alert.severity}: ${alert.alert_code} (${number(alert.alert_count)})`);
}

export function buildWebhookPayload(notification, {
  format = "generic",
  dashboardUrl = ""
} = {}) {
  const safeNotification = notification && typeof notification === "object"
    ? notification
    : {};
  const kind = safeNotification.kind === "recovery" ? "recovery" : "critical";
  const title = clipText(
    safeNotification.title || (kind === "recovery"
      ? "Datenqualit\u00e4tsalarm entsch\u00e4rft"
      : "Kritischer Datenqualit\u00e4tsalarm"),
    180
  );
  const metrics = safeNotification.metrics || {};
  const lines = metricLines(metrics);
  const alerts = alertLines(safeNotification.open_alerts);
  const summary = clipText([...lines, ...alerts].join("\n"));

  if (String(format).toLowerCase() === "slack") {
    const isTest = safeNotification.status === "test";
    const slackTitle = kind === "recovery"
      ? (isTest
        ? "\ud83e\uddea RECOVERY-TEST \u2013 Quellenmonitor"
        : "\u2705 RECOVERY \u2013 Quellenmonitor wieder stabil")
      : title;
    const statusText = kind === "recovery"
      ? (isTest
        ? "*Kontrollierter Test:* Der Recovery-Pfad funktioniert. Es wurde kein Produktionsalarm geschlossen."
        : "*Entwarnung:* Der kritische technische Alarm ist beendet. Verbleibende Hinweise werden weiterhin regul\u00e4r \u00fcberwacht.")
      : "*Aktion erforderlich:* Mindestens ein kritisches Datenqualit\u00e4tssignal ist aktiv.";
    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: slackTitle, emoji: true }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: statusText }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: clipText(lines.map(line => `\u2022 ${line}`).join("\n")) }
      }
    ];
    if (alerts.length) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: clipText(`*Alarmgruppen*\n${alerts.map(line => `\u2022 ${line}`).join("\n")}`)
        }
      });
    }
    if (dashboardUrl) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<${clipText(dashboardUrl, 1000)}|Aktualit\u00e4tslage \u00f6ffnen>`
        }
      });
    }
    return { text: `${slackTitle}\n${statusText.replace(/\*/g, "")}\n${summary}`, blocks };
  }

  return {
    schema_version: 1,
    product: "SportEventMap",
    event: "data_freshness_alert",
    kind,
    status: safeNotification.status || "critical",
    title,
    captured_at: safeNotification.captured_at || null,
    snapshot_id: safeNotification.snapshot_id || null,
    summary,
    metrics,
    signals: safeNotification.signals || {},
    open_alerts: Array.isArray(safeNotification.open_alerts)
      ? safeNotification.open_alerts.slice(0, 20)
      : [],
    dashboard_url: dashboardUrl || null
  };
}
