import fs from "node:fs";
import { expect, test } from "@playwright/test";
const admin = fs.readFileSync(new URL("../../js/supabase.js", import.meta.url), "utf8");
const helpers = admin.slice(admin.indexOf("function normalizeDataOpsEventId("), admin.indexOf("function getReviewInboxCategory("));
const handlers = admin.slice(admin.indexOf("async function handleEditionLifecycleAction("), admin.indexOf("function toDateTimeLocal("));
async function fixture(page, count = 2) {
  await page.route("**/publication-fixture", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/style.css"></head><body><button data-lifecycle-action="approve-selected">Auswahl prüfen</button><p id="status"></p><div id="inbox"></div></body></html>' }));
  await page.goto("/publication-fixture");
  await page.evaluate(count => {
    const uuid = n => "00000000-0000-4000-8000-" + String(n).padStart(12,"0");
    const year = new Date().getUTCFullYear() + 1;
    window.events=[]; window.editions=[]; window.candidates=[]; window.sources=[]; window.rpcCalls=[]; window.reloads=[];
    for (let i=1; i<=count; i++) {
      const date=year+"-06-20",url="https://example.test/event-"+i;
      candidates.push({id:uuid(i),event_id:i,source_id:uuid(i+300),draft_edition_id:uuid(i+100),candidate_year:year,candidate_start_date:date,candidate_end_date:date,candidate_status:"draft_created",validation_status:"validated",validation_reasons:[]});
      editions.push({id:uuid(i+100),event_id:i,generated_from_candidate_id:uuid(i),generated_from_source_id:uuid(i+300),publication_status:"draft",discovery_status:"suppressed",edition_status:"scheduled",edition_year:year,start_date:date,end_date:date,source_url:url,race_formats:[{label:"10 km",distance_km:10},{label:"5 km",distance_km:5}],legacy_distance:"10 km / 5 km",registration_status:"registration_open",registration_url:url+"/register"});
      events.push({id:i,canonical_name:"Synthetischer Lauf "+i,status:"approved",publication_status:"published",city:"Berlin",country:"Germany",address:"Teststraße 1",latitude:"52.52000",longitude:"13.40500",sport:"Running",description:"Synthetische Testveranstaltung mit zwei Wettbewerben, einer belegten Veranstaltungsstätte und gemeinsamer Ziellinie für den Browsernachweis."});
      sources.push({id:uuid(i+200),event_id:i,edition_id:uuid(i+100),source_url:url,source_type:"official_event_website",is_active:true,crawl_status:"success",consecutive_failures:0,last_change_status:"first_seen",last_fetched_at:new Date().toISOString()});
    }
    document.getElementById("inbox").innerHTML=candidates.map(c=>'<input type="checkbox" data-lifecycle-select checked value="'+c.id+'">').join("");
  },count);
  const boundary = [
    "const dataOpsEvents=window.events,dataOpsEditions=window.editions,dataOpsSuccessionCandidates=window.candidates,dataOpsSources=window.sources;",
    "const sourceMonitorActiveJobs=[],sourceMonitorReviews=window.candidates.map(c=>({fingerprint:'succession:'+c.id,task_type:'new_edition_candidate',status:'open',event_id:c.event_id,source_id:c.source_id,edition_id:null})),dataOpsProposals=[],dataOpsIssues=[],dataOpsAlerts=[],dataOpsFreshnessBlockingFeedback=[];",
    "const editionLifecycleElements={list:document.getElementById('inbox')};",
    "const getFriendlyErrorMessage=(error,fallback)=>error.message||fallback;",
    "const setButtonLoading=(button,busy)=>{button.disabled=busy;};",
    "const setEditionLifecycleStatus=text=>{document.getElementById('status').textContent=text;};",
    "const loadDataOperations=async options=>{window.reloads.push(options);if(window.failReload)throw Error('Reload unavailable');if(window.driftOnReload)window.editions[0].registration_status='registration_closed';};",
    "const supabaseClient={rpc:async(name,args)=>{window.rpcCalls.push({name,args});if(window.failRpc)throw Error('Response lost');const ids=Object.keys(args.p_evidence);const freshness={requested_count:ids.length,verified_count:ids.length,verified_edition_ids:ids,freshness_verified:true,automatic_fact_changes:false};const data={requested_count:args.p_candidate_ids.length,approved_count:args.p_candidate_ids.length,approved_candidate_ids:args.p_candidate_ids,published_edition_ids:ids,publication_verified:true,freshness};if(window.badReceipt)data.approved_candidate_ids=[window.candidates[0].source_id];return {data,error:null};}};",
    helpers,handlers,
    "const editionLifecycleInbox=getSuccessionInboxRows();",
    "window.makeReviews=()=>window.candidates.map(candidate=>{const c=getSuccessionBatchContext(candidate.id);return {event_id:c.eventId,edition_id:c.editionId,source_id:c.sourceId,source_url:c.sourceUrl,source_checked_at:new Date().toISOString(),confidence:0.95,notes:'Synthetischer vollständiger und unabhängig geprüfter Quellenbeleg.',confirmed_fields:Object.keys(c.storedValues),uncertain_fields:[],observed_values:c.storedValues};});",
    "document.querySelector('[data-lifecycle-action=\"approve-selected\"]').addEventListener('click',event=>handleEditionLifecycleAction(event.currentTarget));",
    "window.addMixedSelection=()=>{editionLifecycleInbox.push({item_type:'result',item_id:'00000000-0000-4000-8000-000000009999'});document.getElementById('inbox').insertAdjacentHTML('beforeend','<input data-lifecycle-select checked type=\"checkbox\" value=\"00000000-0000-4000-8000-000000009999\">');};"
  ].join("\n");
  await page.route("**/js/publication-fixture.js", route=>route.fulfill({contentType:"text/javascript",body:boundary}));
  await page.addScriptTag({url:"/js/publication-fixture.js"});
}
async function openAndFill(page) {
  await page.getByRole("button",{name:"Auswahl prüfen",exact:true}).click();
  const dialog=page.locator("#freshnessBatchDialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading")).toHaveText("Editionen prüfen und veröffentlichen");
  const evidence=await page.evaluate(()=>JSON.stringify({schema_version:1,reviews:makeReviews()}));
  await dialog.getByLabel("Belege als JSON",{exact:true}).fill(evidence);
  await dialog.getByRole("button",{name:"Belege importieren",exact:true}).click();
  for(const card of await dialog.locator(".freshness-batch-card").all()){
    if(await card.getAttribute("open")===null)await card.locator(":scope > summary").click();
    await card.getByRole("checkbox").check();
  }
  return dialog;
}
test("actual publication handler submits one bound 14-field candidate packet",async({page})=>{
  await fixture(page);const dialog=await openAndFill(page);
  await dialog.getByRole("button",{name:"Geprüfte Editionen veröffentlichen",exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("2 Editionen mit vollständigen Feldbelegen veröffentlicht");
  const calls=await page.evaluate(()=>rpcCalls);
  expect(calls).toHaveLength(1);expect(calls[0].name).toBe("approve_edition_succession_candidates");expect(calls[0].args.p_limit).toBe(2);
  expect(Object.keys(calls[0].args.p_evidence)).toEqual(await page.evaluate(()=>editions.map(e=>e.id)));
  expect(calls[0].args.p_candidate_ids).toEqual(await page.evaluate(()=>candidates.map(c=>c.id)));
  expect(await page.evaluate(()=>reloads)).toEqual([{throwOnError:true},{throwOnError:true},{throwOnError:true}]);
});
test("removing one draft also removes its candidate and evidence from the RPC",async({page})=>{
  await fixture(page);const dialog=await openAndFill(page);
  await dialog.locator(".freshness-batch-card").last().getByRole("button",{name:"Aus Paket nehmen",exact:true}).click();
  await dialog.getByRole("button",{name:"Geprüfte Editionen veröffentlichen",exact:true}).click();
  await expect(dialog).toHaveCount(0);
  const calls=await page.evaluate(()=>rpcCalls);expect(calls).toHaveLength(1);
  expect(calls[0].args.p_limit).toBe(1);expect(calls[0].args.p_candidate_ids).toHaveLength(1);expect(Object.keys(calls[0].args.p_evidence)).toHaveLength(1);
});
for(const mode of ["drift","reload"])test(mode+" during strict reload prevents publication",async({page})=>{
  await fixture(page);const dialog=await openAndFill(page);
  await page.evaluate(mode=>{if(mode==="drift")window.driftOnReload=true;else window.failReload=true;},mode);
  await dialog.getByRole("button",{name:"Geprüfte Editionen veröffentlichen",exact:true}).click();
  await expect(dialog.locator(":scope > form > .freshness-batch-errors")).toContainText(mode==="drift"?"geändert":"Reload unavailable");
  expect(await page.evaluate(()=>rpcCalls)).toEqual([]);
});
for(const mode of ["lost","invalid"])test(mode+" publication outcome cannot be retried from the dialog",async({page})=>{
  await fixture(page);const dialog=await openAndFill(page);
  await page.evaluate(mode=>{if(mode==="lost")window.failRpc=true;else window.badReceipt=true;},mode);
  await dialog.getByRole("button",{name:"Geprüfte Editionen veröffentlichen",exact:true}).click();
  await expect(dialog.locator(":scope > form > .freshness-batch-errors")).toContainText("Abschluss nicht bestätigt");
  await expect(dialog.getByRole("button",{name:"Geprüfte Editionen veröffentlichen",exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>rpcCalls)).toHaveLength(1);
});
test("mixed results and editions never cause partial approval",async({page})=>{
  await fixture(page);await page.evaluate(()=>addMixedSelection());
  await page.getByRole("button",{name:"Auswahl prüfen",exact:true}).click();
  await expect(page.locator("#status")).toContainText("eigenen Paket");
  expect(await page.evaluate(()=>rpcCalls)).toEqual([]);
  await expect(page.locator("#freshnessBatchDialog")).toHaveCount(0);
});
test("mobile packet of 25 requires individual confirmations and fits the viewport",async({page})=>{
  await page.setViewportSize({width:390,height:844});await fixture(page,25);const dialog=await openAndFill(page);
  await expect(dialog.locator(".freshness-batch-card")).toHaveCount(25);
  await expect(dialog.locator('input[type="checkbox"]:checked')).toHaveCount(25);
  const box=await dialog.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(391);
  const last=dialog.locator(".freshness-batch-card").last();await last.getByRole("checkbox").uncheck();
  await expect(dialog.getByRole("button",{name:"Geprüfte Editionen veröffentlichen",exact:true})).toBeDisabled();
  await last.getByRole("checkbox").check();
  await dialog.getByRole("button",{name:"Geprüfte Editionen veröffentlichen",exact:true}).click();
  await expect(dialog).toHaveCount(0);expect((await page.evaluate(()=>rpcCalls))[0].args.p_candidate_ids).toHaveLength(25);
});
