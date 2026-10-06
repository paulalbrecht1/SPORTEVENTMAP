import fs from "node:fs";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

const adminSource = fs.readFileSync(new URL("../../js/supabase.js", import.meta.url), "utf8");
const reportSource = fs.readFileSync(new URL("../../js/catalog-quality-report.js", import.meta.url), "utf8");
const loaderSource = fs.readFileSync(new URL("../../js/event-catalog-loader.js", import.meta.url), "utf8");
const styleSource = fs.readFileSync(new URL("../../css/style.css", import.meta.url), "utf8");
const opsStyles = fs.readFileSync(new URL("../../css/source-monitor.css", import.meta.url), "utf8");
const dataOpsStyles = fs.readFileSync(new URL("../../css/data-operations.css", import.meta.url), "utf8");
const actualFunctions = adminSource.slice(adminSource.indexOf("function renderCatalogQualityReport()"), adminSource.indexOf('document.getElementById("downloadCatalogQualityReport")?.addEventListener'));
const dateFunction = adminSource.slice(adminSource.indexOf("function formatDataOpsDate("), adminSource.indexOf("function setDataOpsKpi("));
const escapeFunction = adminSource.slice(adminSource.indexOf("function escapeAdminHTML("), adminSource.indexOf("function safeAdminUrl("));
const qualityMarkup = adminSource.match(/<div class="data-freshness-priorities">[\s\S]*?<\/div>/g)
  ?.find(markup => markup.includes('id="catalogQualityDefinition"'));

function syntheticData() {
  const measured = new Date(), measuredAt = measured.toISOString();
  const future = new Date(measured.getTime() + 70 * 86400000).toISOString().slice(0, 10);
  const nextCheck = new Date(measured.getTime() + 14 * 86400000).toISOString();
  const overdue = new Date(measured.getTime() - 86400000).toISOString();
  const row = (n, country, decision, options = {}) => ({
    event_id: n, edition_id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    event_name: `Synthetische Edition ${n}`, edition_year: Number(future.slice(0, 4)),
    date: future.split("-").reverse().join("."), country, city: "Berlin", sport: "Running", latitude: 52.5, longitude: 13.4,
    description: "Synthetische ausschließliche Testbeschreibung. Die öffentliche Quelle belegt den Rundkurs und das konkrete Programm dieser Ausgabe.",
    event_url: "https://example.invalid/register", source_url: "https://example.invalid/edition",
    distance: "10 km", race_formats: [{ label: "10 km", distance_km: 10 }],
    verification_status: "verified", last_checked: measuredAt, next_check: nextCheck,
    decision, ...options
  });
  const inputs = [row(1, "Germany", true), row(2, "Deutschland", false), row(3, "France", true),
    row(4, "DE", true, { next_check: overdue }), row(5, "Germany", false, { date: null, next_check: null })];
  const discovery = inputs.map(({ decision, ...data }) => data);
  return {
    snapshot: { schema_version: 1, consistency: "single_statement", measured_at: measuredAt, discovery_count: discovery.length, archive_count: discovery.length, discovery,
      archive: discovery, freshness_guard: { schema_version: 1, evaluated_at: measuredAt, requested_count: inputs.length,
        decisions: Object.fromEntries(inputs.map(row => [row.edition_id, row.decision])) } },
    policy: { minimum_discovery_rows: 400, reference_discovery_rows: 400, maximum_discovery_drop_percent: 0,
      minimum_archive_rows: 400, reference_archive_rows: 400, maximum_archive_drop_percent: 0,
      minimum_freshness_rate: 55, minimum_completeness_rate: 45 },
    // Schema and a plausible timestamp alone deliberately prove no file integrity.
    exportManifest: { schema_version: 1, exported_at: "2026-08-27T07:41:01.290Z", metrics: { discovery_rows: 431, archive_rows: 994 } },
    measuredAt
  };
}

async function fixture(page, { rpcMissing = false, operationsUnavailable = false, integrityVerified = false } = {}) {
  expect(qualityMarkup).toBeTruthy();
  const data = syntheticData();
  data.exportFiles = { "data/events.csv": "id,event_name\n1,Synthetischer Lauf\n", "data/event-editions-public.json": '{"editions":[]}' };
  if (integrityVerified) data.exportManifest.sha256 = {
    discovery: createHash("sha256").update(data.exportFiles["data/events.csv"]).digest("hex"),
    archive: createHash("sha256").update(data.exportFiles["data/event-editions-public.json"]).digest("hex")
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/catalog-quality-fixture", route => route.fulfill({ contentType: "text/html", body:
    `<html lang="de" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body data-theme="light"><div id="adminModal" class="modal open"><div class="admin-card"><section id="dataFreshnessOverview" class="data-freshness-overview">${qualityMarkup}</section></div></div></body></html>` }));
  await page.goto("/catalog-quality-fixture");
  await page.addStyleTag({ content: styleSource });
  await page.addStyleTag({ content: opsStyles });
  await page.addStyleTag({ content: dataOpsStyles });
  await page.addScriptTag({ content: loaderSource });
  await page.addScriptTag({ content: reportSource });
  await page.evaluate(({ data, rpcMissing, operationsUnavailable, source }) => {
    window.qualityFixture = data;
    window.rpcCalls = [];
    const script = document.createElement("script");
    script.textContent = `
      let catalogQualityReport = null, catalogQualityExport = null;
      let dataOpsMeasuredAt = ${JSON.stringify(operationsUnavailable ? null : data.measuredAt)};
      let dataOpsRuns = [{ job_type: "validation", run_status: "succeeded", finished_at: ${JSON.stringify(data.measuredAt)} }];
      let dataOpsIssues = [{ severity: "error", status: "open" }];
      let dataOpsEvents = [{ id: 1 }, { id: 2 }];
      let editionLifecycleInbox = [{ item_type: "proposal", item_id: "same-review" }, { item_type: "source_review", item_id: "source-1" }];
      let dataOpsProposals = [{ id: "same-review", proposal_status: "pending" }];
      let sourceMonitorReviews = [{ id: "source-1", status: "open" }];
      let dataOpsSuccessionCandidates = [{ id: "candidate-1", validation_status: "conflict", candidate_status: "conflict" }, { id: "candidate-2", validation_status: "conflict", candidate_status: "draft_created" }];
      let dataOpsEditions = [{ publication_status: "draft" }];
      const supabase = { createClient() { throw new Error("SDK factory is not a Data API client."); } };
      const supabaseClient = { async rpc(name) { window.rpcCalls.push(name); return ${rpcMissing ? '{ error: { code: "PGRST202", message: "Snapshot RPC not deployed." } }' : '{ data: window.qualityFixture.snapshot, error: null }'}; } };
      window.fetch = async path => ({ ok: true,
        json: async () => structuredClone(String(path).includes("catalog-release-policy") ? window.qualityFixture.policy : window.qualityFixture.exportManifest),
        arrayBuffer: async () => new TextEncoder().encode(window.qualityFixture.exportFiles[String(path)] || "").buffer });
      ${source}
      window.loadActualCatalogReport = loadCatalogQualityReport;
      window.getActualCatalogReport = () => structuredClone(catalogQualityReport);
    `;
    document.head.appendChild(script);
  }, { data, rpcMissing, operationsUnavailable, source: dateFunction + escapeFunction + actualFunctions });
  await page.evaluate(() => window.loadActualCatalogReport());
}

const metric = (page, label) => page.locator("#catalogQualityDetails > div").filter({ has: page.locator("dt", { hasText: label }) }).locator("dd");

test("catalog quality: actual loader uses client RPC, strict guard and the same German denominator on mobile", async ({ page }, testInfo) => {
  await fixture(page);
  expect(await page.evaluate(() => window.rpcCalls)).toEqual(["get_public_event_catalog_snapshot"]);
  await expect(metric(page, "Zukünftig öffentlich suchbar")).toHaveText("4 insgesamt · 3 Deutschland");
  await expect(metric(page, "Vollständig aktuell verifiziert")).toHaveText("2 von 4 (50 %)");
  await expect(metric(page, "Deutschland: Vollnachweise")).toHaveText("1 von 3 (33,33 %)");
  await expect(metric(page, "Offene Reviews / Kandidatenkonflikte")).toHaveText("4 / 2");
  await expect(metric(page, "Entwürfe / veröffentlichtes Archiv")).toHaveText("1 / 5");
  await expect(page.locator("#catalogQualityDefinition")).toContainText("Messzeitpunkt:");
  await expect(page.locator("#catalogQualityBlockers")).toContainText("mindestens 400");
  await expect(page.locator("#downloadCatalogQualityReport")).toBeEnabled();
  const actual = await page.evaluate(() => window.getActualCatalogReport());
  expect(actual.future.germany_freshness_rate).toBe(33.33);
  expect(actual.metrics.fresh_rows).toBe(2);
  expect(actual.operations.candidate_conflicts).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator("#adminModal .admin-card").screenshot({ path: testInfo.outputPath("catalog-quality-mobile.png") });
  await page.locator("#downloadCatalogQualityReport").scrollIntoViewIfNeeded();
  await expect(page.locator("#downloadCatalogQualityReport")).toBeVisible();
  await page.locator("#adminModal .admin-card").screenshot({ path: testInfo.outputPath("catalog-quality-mobile-bottom.png") });
});

test("catalog quality: missing snapshot RPC and unavailable operational read remain unknown", async ({ page }) => {
  await fixture(page, { rpcMissing: true, operationsUnavailable: true });
  await expect(metric(page, "Zukünftig öffentlich suchbar")).toHaveText("nicht ermittelt");
  await expect(metric(page, "Deutschland: Vollnachweise")).toHaveText("nicht ermittelt");
  await expect(metric(page, "Kritische Datenprobleme")).toHaveText("nicht ermittelt");
  await expect(metric(page, "Offene Reviews / Kandidatenkonflikte")).toHaveText("nicht ermittelt");
  await expect(metric(page, "Letzter erfolgreicher Qualitätscheck")).toHaveText("nicht ermittelt");
  await expect(page.locator("#catalogQualityDefinition")).toContainText("nicht ermittelt");
  expect((await page.evaluate(() => window.getActualCatalogReport())).available).toBe(false);
});

test("catalog quality: a manifest timestamp alone proves neither export integrity nor source data time", async ({ page }) => {
  await fixture(page);
  const lastExport = metric(page, "Letzter erfolgreicher Export");
  await expect(lastExport).toHaveText("nicht ermittelt");
  await expect(page.locator("#catalogQualityBlockers")).toContainText("Exportstand nicht ermittelt");
});

test("catalog quality: unavailable date parser does not invent a zero future cohort", async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    window.EventCatalogLoader = undefined;
    await window.loadActualCatalogReport();
  });
  await expect(metric(page, "Zukünftig öffentlich suchbar")).toHaveText("nicht ermittelt");
  await expect(metric(page, "Deutschland: Vollnachweise")).toHaveText("nicht ermittelt");
  expect((await page.evaluate(() => window.getActualCatalogReport())).available).toBe(false);
});

test("catalog quality: verified SHA files preserve unknown source time and still require release approval", async ({ page }) => {
  await fixture(page, { integrityVerified: true });
  const lastExport = metric(page, "Letzter erfolgreicher Export");
  await expect(lastExport).toContainText("SHA-256 geprüft");
  await expect(lastExport).toContainText("Snapshot: nicht dokumentiert");
  await expect(lastExport).toContainText("keine Aussage über neue Quellenprüfung oder Freigabe");
  await expect(page.locator("#catalogQualityBlockers")).toContainText("produktive Freigabe erforderlich");
});
