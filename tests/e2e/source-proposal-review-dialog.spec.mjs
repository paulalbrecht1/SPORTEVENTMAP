import fs from "node:fs";
import { expect, test } from "@playwright/test";

const admin = fs.readFileSync(new URL("../../js/supabase.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../../css/style.css", import.meta.url), "utf8");
const dialogRuntime = admin.slice(admin.indexOf("function buildProposalCloseRequest("), admin.indexOf("function buildContentVerificationEvidence("));
const handlerStart = admin.indexOf("async function handleDataOpsAction(");
const handlerEnd = admin.lastIndexOf("\n[", admin.indexOf("dataOpsElements.country,", handlerStart));
const handlerRuntime = admin.slice(handlerStart, handlerEnd);
const errorRuntime = admin.slice(admin.indexOf("function getFriendlyErrorMessage("), admin.indexOf("function getCurrentAnalyticsSessionId("));
const urlRuntime = admin.slice(admin.indexOf("function safeAdminUrl("), admin.indexOf("function isValidAdminEventUrl("));

async function startReview(page, action = "reject-proposal", result = null, proposalOverrides = {}) {
  await page.setContent('<html lang="de"><body><button id="start">Vorschlag prüfen</button><p id="status" role="status"></p></body></html>');
  await page.addStyleTag({ content: styles });
  await page.evaluate(({ action, result, proposalOverrides }) => {
    window.fixtureAction = action;
    window.fixtureResult = result;
    window.fixtureProposalOverrides = proposalOverrides;
    window.rpcCalls = [];
    window.prompt = () => { throw new Error("Native prompt must not run"); };
    window.confirm = () => { throw new Error("Native confirm must not run"); };
  }, { action, result, proposalOverrides });
  await page.addScriptTag({ content: `
    const dataOpsEvents = [{id:377,event_name:'BraunenBerg-Lauf <script>unsafe</script>'}];
    const dataOpsProposals = [{id:'fixture-proposal',event_id:377,edition_id:'fixture-edition',source_id:'fixture-source',field_name:'registration_url',proposal_status:'pending',old_value:'https://example.test/old',normalized_value:'https://example.test/'+'x'.repeat(160),...window.fixtureProposalOverrides}];
    const dataOpsSources = [{id:'fixture-source',source_url:'https://official.example.test/guide'}];
    const supabaseClient = { rpc: async (name,args) => {
      window.rpcCalls.push({name,args});
      return window.fixtureResult || {data:{id:args.p_proposal_id,proposal_status:args.p_action},error:null};
    }};
    const escapeAdminHTML = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const formatReviewInboxValue = value => typeof value === 'string' ? value : JSON.stringify(value);
    const setButtonLoading = (button,loading) => { button.disabled=loading; };
    const setDataOpsStatus = (text,type) => { document.getElementById('status').textContent=text; window.statusType=type; };
    const loadDataOperations = async () => { setDataOpsStatus('Übersicht neu geladen.','success'); };
    ${errorRuntime}
    ${urlRuntime}
    ${dialogRuntime}
    ${handlerRuntime}
    const button=document.getElementById('start');
    button.dataset.dataopsAction=window.fixtureAction;
    button.dataset.proposalId='fixture-proposal';
    button.addEventListener('click',()=>handleDataOpsAction(button));
    window.markProposalClosed = () => { dataOpsProposals[0].proposal_status='superseded'; };
    window.changeProposalContext = () => { dataOpsProposals[0].old_value='https://example.test/newer-baseline'; };
  ` });
  await page.locator("#start").click();
  return page.getByRole("dialog");
}

test("proposal closure: cancel and Escape do not write and restore focus", async ({ page }) => {
  const dialog = await startReview(page);
  await expect(dialog.getByLabel("Begründung")).toHaveValue("");
  await expect(dialog).toContainText("<script>unsafe</script>");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#start")).toBeFocused();
  await page.locator("#start").click();
  await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
  expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
});

for (const [action, status] of [["reject-proposal", "rejected"], ["supersede-proposal", "superseded"]]) {
  test(`proposal closure: ${status} uses one admin RPC with its explicit reason on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const dialog = await startReview(page, action);
    const submit = dialog.locator('button[type="submit"]');
    await submit.click();
    await expect(dialog.getByRole("alert")).toContainText("mindestens 12");
    expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
    expect(await dialog.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    const reason = "In der aktuellen Quelle geprüft und begründet entschieden.";
    await dialog.getByLabel("Begründung").fill(reason);
    await submit.click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => window.rpcCalls)).toEqual([{
      name: "review_event_change_proposal",
      args: { p_proposal_id: "fixture-proposal", p_action: status, p_review_notes: reason, ...(status === "rejected" ? {p_rejection_reason:reason} : {}) }
    }]);
    await expect(page.getByRole("status")).toContainText(`(${status})`);
    await expect(page.locator("#start")).toBeEnabled();
  });
}

test("proposal closure: an already closed proposal stays in the dialog without another write", async ({ page }) => {
  const dialog = await startReview(page, "supersede-proposal");
  await dialog.getByLabel("Begründung").fill("Bereits über den geprüften Faktenbatch umgesetzt.");
  await page.evaluate(() => window.markProposalClosed());
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.getByRole("alert")).toContainText("nicht mehr offen");
  expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
});

test("proposal acceptance: a baseline conflict is visibly superseded, never reported as applied", async ({ page }) => {
  await startReview(page, "approve-proposal", { data: { id: "fixture-proposal", proposal_status: "superseded" }, error: null });
  await expect(page.getByRole("status")).toContainText("nicht übernommen");
  await expect(page.getByRole("status")).toContainText("(superseded)");
  expect(await page.evaluate(() => window.statusType)).toBe("error");
});

test("proposal closure: permission errors remain visible without claiming success", async ({ page }) => {
  const dialog = await startReview(page, "reject-proposal", { data: null, error: { code: "42501", message: "admin role required" } });
  await dialog.getByLabel("Begründung").fill("Der vorgeschlagene Wert gehört nicht zu dieser Ausgabe.");
  await dialog.locator('button[type="submit"]').click();
  await expect(page.getByRole("status")).toHaveText("Die Vorschlagsentscheidung konnte nicht bestätigt werden.");
  expect(await page.evaluate(() => window.statusType)).toBe("error");
  await expect(page.locator("#start")).toBeEnabled();
});

test("proposal edit: cancel and Escape preserve source context without any write", async ({ page }) => {
  const dialog = await startReview(page, "edit-proposal");
  await expect(dialog).toContainText("<script>unsafe</script>");
  await expect(dialog).toContainText("registration_url");
  await expect(dialog).toContainText("https://example.test/old");
  await expect(dialog.getByRole("link")).toHaveAttribute("href", "https://official.example.test/guide");
  await expect(dialog.getByLabel("Wertformat")).toHaveValue("text");
  await expect(dialog.getByLabel("Begründung")).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#start")).toBeFocused();
  await page.locator("#start").click();
  await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
  expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
});

test("proposal edit: valid text and explicit reason submit one exact RPC on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const dialog = await startReview(page, "edit-proposal");
  const submit = dialog.getByRole("button", { name: "Bearbeiteten Wert übernehmen" });
  await submit.click();
  await expect(dialog.getByRole("alert")).toContainText("mindestens 12");
  const reason = "Anmeldeseite mit der offiziellen Quelle abgeglichen.";
  await dialog.getByLabel("Begründung").fill(reason);
  await dialog.getByLabel("Zu übernehmender Wert").fill("false");
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
  expect(await dialog.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.locator("form").evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.rpcCalls)).toEqual([{
    name: "review_event_change_proposal", args: {
      p_proposal_id: "fixture-proposal", p_action: "edited_and_accepted", p_review_notes: reason, p_edited_value: "false"
    }
  }]);
  await expect(page.getByRole("status")).toContainText("(edited_and_accepted)");
});

test("proposal edit: malformed and null JSON cannot write; race formats preserve structure and order", async ({ page }) => {
  const formats = [{ label: "10 km", distance_km: 10 }, { label: "5 km", distance_km: 5 }];
  const dialog = await startReview(page, "edit-proposal", null, { field_name: "race_formats", normalized_value: formats });
  await expect(dialog.getByLabel("Wertformat")).toHaveValue("json");
  const reason = "Beide Distanzen editionsgenau mit der Quelle verglichen.";
  await dialog.getByLabel("Begründung").fill(reason);
  for (const [value, message] of [['[{"distance_km":10}', "gültiges JSON"], ["null", "null"]]) {
    await dialog.getByLabel("Zu übernehmender Wert").fill(value);
    await dialog.getByRole("button", { name: "Bearbeiteten Wert übernehmen" }).click();
    await expect(dialog.getByRole("alert")).toContainText(message);
    expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
  }
  await dialog.getByLabel("Zu übernehmender Wert").fill(JSON.stringify(formats));
  await dialog.getByRole("button", { name: "Bearbeiteten Wert übernehmen" }).click();
  expect(await page.evaluate(() => window.rpcCalls)).toEqual([{
    name: "review_event_change_proposal", args: {
      p_proposal_id: "fixture-proposal", p_action: "edited_and_accepted", p_review_notes: reason, p_edited_value: formats
    }
  }]);
});

for (const change of ["markProposalClosed", "changeProposalContext"]) {
  test(`proposal edit: ${change} blocks a stale dialog without RPC`, async ({ page }) => {
    const dialog = await startReview(page, "edit-proposal");
    await dialog.getByLabel("Begründung").fill("Der Wert wurde mit der offiziellen Quelle verglichen.");
    await page.evaluate(change => window[change](), change);
    await dialog.getByRole("button", { name: "Bearbeiteten Wert übernehmen" }).click();
    await expect(dialog.getByRole("alert")).toContainText(change === "markProposalClosed" ? "nicht mehr offen" : "inzwischen geändert");
    expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
  });
}

test("proposal edit: server conflict never claims successful application", async ({ page }) => {
  const dialog = await startReview(page, "edit-proposal", { data: { id: "fixture-proposal", proposal_status: "superseded" }, error: null });
  await dialog.getByLabel("Begründung").fill("Mit der aktuellen offiziellen Ausschreibung verglichen.");
  await dialog.getByRole("button", { name: "Bearbeiteten Wert übernehmen" }).click();
  await expect(page.getByRole("status")).toContainText("nicht übernommen");
  expect(await page.evaluate(() => window.statusType)).toBe("error");
  expect(await page.evaluate(() => window.rpcCalls.length)).toBe(1);
});

test("proposal edit: source links keep their original query parameters", async ({ page }) => {
  const sourceUrl = "https://official.example.test/guide?edition=2027&event=39";
  const dialog = await startReview(page, "edit-proposal", null, { source_url: sourceUrl });
  await expect(dialog.getByRole("link")).toHaveAttribute("href", sourceUrl);
});

test("proposal edit: unsafe source URLs are not linked", async ({ page }) => {
  const dialog = await startReview(page, "edit-proposal", null, { source_url: "javascript:alert(1)" });
  await expect(dialog.getByRole("link")).toHaveCount(0);
  await expect(dialog).toContainText("Keine sichere Quellen-URL");
  expect(await page.evaluate(() => window.rpcCalls)).toEqual([]);
});
