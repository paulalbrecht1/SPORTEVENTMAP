import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Called only by the disposable local runner. No transport success is mocked:
// both browser sessions use the real application and the real local Data API.
export async function runBrowserAcceptance({root,baseURL,apiUrl,publishableKey,fixture,sql,parse,literal,outputDir}) {
  assert.equal(baseURL,'http://127.0.0.1:4189');assert.equal(apiUrl,'http://127.0.0.1:56321');
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(root,'.playwright-browsers');
  const {chromium,expect}=await import('@playwright/test');
  const browser=await chromium.launch({headless:true});
  const report={checks:[],network:[],save_requests:[],external_write_attempts:[],production_requests:[],errors:[],auth_via_actual_form:true,successful_rpc_responses_mocked:false};
  const record=(name,extra={})=>{report.checks.push({name,passed:true,...extra});console.log('PASS '+name);};
  let adminPage,normalPage;
  async function contextFor(viewport={width:1440,height:1000}) {
    const context=await browser.newContext({baseURL,viewport,serviceWorkers:'block'});
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(/\.supabase\.(?:co|in)$/.test(url.hostname)||url.hostname==='sporteventmap.com'||url.hostname==='sporteventmap.pages.dev'){
        report.production_requests.push({origin:url.origin,path:url.pathname});return route.abort('blockedbyclient');
      }
      if(!['GET','HEAD','OPTIONS'].includes(request.method())&&url.origin!==apiUrl){report.external_write_attempts.push({origin:url.origin,path:url.pathname,method:request.method()});return route.abort('blockedbyclient');}
      return route.continue();
    });
    await context.routeWebSocket('**/*',socket=>socket.close());
    await context.addInitScript(()=>{
      localStorage.setItem('sportEventMapLanguage','de');localStorage.setItem('sportEventMapTheme','light');
      localStorage.setItem('sportEventMap.landingSeen','true');localStorage.setItem('sportEventMap.betaWelcomeSeen','true');localStorage.setItem('sportEventMap.betaBannerDismissed','true');
    });
    return context;
  }
  function observe(page){
    page.on('pageerror',error=>report.errors.push(error.message));
    page.on('response',async response=>{
      const request=response.request(),url=new URL(response.url());
      if(url.origin!==apiUrl)return;
      // Auth payloads, bearer tokens and credentials are deliberately excluded.
      if(url.pathname.startsWith('/rest/v1/'))report.network.push({path:url.pathname,status:response.status(),method:request.method()});
      if(url.pathname==='/rest/v1/rpc/save_manual_event_maintenance'){
        report.save_requests.push({request:request.postDataJSON()?.p_request,response:await response.json().catch(()=>null),status:response.status()});
      }
    });
  }
  const field=(page,name)=>page.locator(`[data-maintenance-field="${name}"]`);
  const status=page=>page.locator('[data-maintenance-status]');
  async function openApp(page){
    observe(page);await page.goto('/index.html#/discovery',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.documentElement.dataset.supabaseLoaded==='true'&&window.eventCatalogDiagnostics?.source==='supabase',{},{timeout:45000});
    for(const id of ['closeWelcomeModal','closeBetaBannerBtn'])if(await page.locator('#'+id).isVisible())await page.locator('#'+id).click();
  }
  async function login(page,account){
    await page.locator('#loginBtn').click();await page.locator('#authEmail').fill(account.email);await page.locator('#authPassword').fill(account.password);
    const authResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/auth/v1/token'&&response.request().method()==='POST');
    await page.locator('#authSubmitBtn').click();assert.equal((await authResponse).status(),200);
    await expect(page.locator('#loginBtn')).toBeHidden();
  }
  async function openEditor(page,target=fixture){
    if(!await page.locator('#adminModal').evaluate(el=>el.classList.contains('open')))await page.locator('#adminBtn').click();
    await page.locator('[data-admin-tab="eventMaintenance"]').click();
    if(await page.locator('[data-maintenance-close]').isVisible())await page.locator('[data-maintenance-close]').click();
    await page.locator('[data-maintenance-search]').fill(target.name);await page.locator('[data-maintenance-search-form] button[type="submit"]').click();
    await page.locator(`[data-maintenance-event="${target.event_id}"]`).click();await expect(field(page,'event.canonical_name')).toHaveValue(target.name);
  }
  async function optional(page){const details=field(page,'edition.price_min').locator('xpath=ancestor::details');if(await details.count())await details.locator('summary').click();}
  async function preview(page,notes=''){await expect(page.locator('#adminEventMaintenancePanel')).not.toHaveAttribute('aria-busy','true',{timeout:30000});await page.locator('[data-maintenance-notes]').fill(notes);await page.locator('[data-maintenance-preview]').click();await expect(page.locator('dialog[data-maintenance-preview-box]')).toBeVisible();await expect(page.locator('dialog[data-maintenance-preview-box]')).toHaveJSProperty('open',true);await expect(page.locator('dialog[data-maintenance-preview-box] [data-maintenance-save]')).toHaveText('Übernehmen und speichern');}
  async function save(page){
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/rest/v1/rpc/save_manual_event_maintenance');
    await page.locator('[data-maintenance-save]').click();const result=await response;assert.equal(result.status(),200,JSON.stringify(await result.json()));
    await expect(status(page)).toContainText('In der Datenbank gespeichert',{timeout:25000});
    if(await page.locator('#adminEventMaintenancePanel').getAttribute('aria-busy')==='true')await expect(field(page,'event.canonical_name')).toBeDisabled();
    await expect(page.locator('#adminEventMaintenancePanel')).toHaveAttribute('aria-busy','false',{timeout:30000});return result.json();
  }
  const readEdition=id=>parse(sql(`select to_jsonb(d) from public.event_editions d where id=${literal(id)};`));
  const publicRead=async(view,editionId)=>{const url=new URL(apiUrl+'/rest/v1/'+view);url.searchParams.set('edition_id','eq.'+editionId);url.searchParams.set('select','*');const response=await fetch(url,{headers:{apikey:publishableKey,Authorization:'Bearer '+publishableKey}});assert.equal(response.status,200);return response.json();};
  try{
    const adminContext=await contextFor(),visitorContext=await contextFor({width:390,height:844});
    adminPage=await adminContext.newPage();const visitor=await visitorContext.newPage();observe(visitor);
    await openApp(adminPage);await login(adminPage,fixture.admin);await expect(adminPage.locator('#adminBtn')).toBeVisible();await openEditor(adminPage);
    record('Actual website login establishes local admin session and real Events pflegen form searches canonical fixture');
    await optional(adminPage);await adminPage.locator('[data-maintenance-action]').selectOption('correct');
    // Changing action can re-render and collapse optional details.
    if(!await field(adminPage,'edition.end_date').isVisible())await optional(adminPage);
    const expected={end_date:`${fixture.year}-06-11`,start_time:'10:35:00',price_min:21.5,price_max:39.75,currency:'CHF',participant_limit:321};
    for(const [key,value] of Object.entries(expected))await field(adminPage,'edition.'+key).fill(String(value).replace(/^10:35:00$/,'10:35'));
    await field(adminPage,'event.city').fill('Potsdam');
    await expect(adminPage.locator('[data-maintenance-confirm],[data-knowledge-confirm],[data-maintenance-source],[data-maintenance-publish]')).toHaveCount(0);
    const sourcesBefore=parse(sql(`select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]'::jsonb) from public.event_sources s where event_id=${fixture.event_id};`));
    await preview(adminPage);const receipt=await save(adminPage);assert.equal(receipt.saved,true);assert.equal(receipt.manual_approval.approved,true);assert.equal(receipt.manual_approval.source_verified,false);assert.equal(receipt.freshness.verified,false);
    const committedRequest=parse(sql(`select request from private.manual_event_maintenance_receipts where request_id=${literal(receipt.request_id)};`));
    assert.equal(committedRequest.manual_approval,true);assert.deepEqual(committedRequest.confirmations,[]);assert.equal(committedRequest.notes,'');assert.equal(committedRequest.publish,true);assert.equal(committedRequest.source_url,undefined);
    const actualAudit=parse(sql(`select jsonb_build_object('approval',count(*) filter(where field_name='__manual_change_approval__' and changed_by=${literal(fixture.admin.id)} and new_value->>'source_verified'='false'),'fabricated_proof',count(*) filter(where field_name in('__manual_field_verification__','__manual_source_review__'))) from public.event_audit_log where entity_id in(${literal(String(fixture.event_id))},${literal(fixture.edition_id)});`));
    assert.ok(actualAudit.approval>=7);assert.equal(actualAudit.fabricated_proof,0);assert.deepEqual(parse(sql(`select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]'::jsonb) from public.event_sources s where event_id=${fixture.event_id};`)),sourcesBefore);
    const reloaded=readEdition(fixture.edition_id);for(const [key,value] of Object.entries(expected))assert.equal(reloaded[key],value,key+' actual DB reload');
    await expect(adminPage.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert: Normale Detailseite geprüft.',{timeout:25000});
    const rows=await publicRead('public_event_archive',fixture.edition_id);assert.equal(rows.length,1);for(const [key,value] of Object.entries(expected))assert.equal(rows[0][key],value,key+' anonymous API');
    const guard=await fetch(apiUrl+'/rest/v1/rpc/get_public_event_freshness_guard',{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_edition_ids:[fixture.edition_id]})});
    assert.equal(guard.status,200);const actualGuard=await guard.json();assert.equal(actualGuard.decisions[fixture.edition_id],false,'Manual approval must not manufacture current source verification');
    const staticResponse=await visitor.goto('/event/'+fixture.edition_slug+'/');assert.equal(staticResponse.status(),200);
    assert.equal(await staticResponse.text(),fs.readFileSync(path.join(root,'event',fixture.edition_slug,'index.html'),'utf8'),'Actual unchanged static baseline served');
    await expect(visitor.locator('html')).toHaveAttribute('data-sem-public-detail-state','verified',{timeout:25000});
    await expect(visitor.locator('html')).toHaveAttribute('data-sem-public-edition-id',fixture.edition_id);
    const visible=JSON.parse(await visitor.locator('#sem-public-detail-data').textContent());for(const [key,value] of Object.entries(expected))assert.equal(visible[key],value,key+' actual regular-path rendered evidence');
    await expect(visitor.locator('#liveDetailName')).toContainText(fixture.name);await expect(visitor.locator('#liveDetailChecked')).toBeHidden();
    await expect(visitor.locator('#liveDetailFacts')).toContainText('321');await expect(visitor.locator('#liveDetailFacts')).toContainText('CHF');await expect(visitor.locator('#liveDetailFacts')).toContainText('10:35');
    assert.ok(await visitor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    await visitor.screenshot({path:path.join(outputDir,'anonymous-regular-detail.png'),fullPage:true});
    record('One modal approval without source checks or required notes persists six optional fields and audit through DB -> anonymous archive -> regular event page; source verification stays false');

    // The loaded application must refresh its discovery values after the save.
    const catalogFresh=await adminPage.evaluate(id=>typeof events!=='undefined'&&events.some(row=>String(row.event_id??row.id)===String(id)&&row.city==='Potsdam'),fixture.event_id);
    assert.equal(catalogFresh,true,'Already-open catalog refreshed after manual save');
    record('Already-open discovery catalog refreshes after form save without page navigation');
    await adminPage.reload();await expect(adminPage.locator('#adminBtn')).toBeVisible();await openEditor(adminPage);await optional(adminPage);
    await expect(field(adminPage,'edition.price_min')).toHaveValue('21.5');await expect(field(adminPage,'edition.participant_limit')).toHaveValue('321');
    record('Browser reload restores values from real database and retains authenticated admin session');

    // Deliberate independent local source change makes the preview obsolete.
    await field(adminPage,'edition.price_min').fill('25');await preview(adminPage);
    sql(`update public.event_sources set next_fetch_at=now()+interval '2 days' where id=${literal(fixture.source_id)};`);
    const conflictResponse=adminPage.waitForResponse(r=>new URL(r.url()).pathname==='/rest/v1/rpc/save_manual_event_maintenance');await adminPage.locator('[data-maintenance-save]').click();
    const conflict=await conflictResponse;assert.equal(conflict.status(),409);assert.equal((await conflict.json()).code,'PT409');
    await expect(status(adminPage)).toContainText(/inzwischen|geändert/);await expect(field(adminPage,'edition.price_min')).toHaveValue('25');assert.equal(readEdition(fixture.edition_id).price_min,21.5);
    await adminPage.locator('[data-maintenance-reload]').click();await expect(status(adminPage)).toContainText(/geladen/);
    await expect(field(adminPage,'edition.price_min')).toHaveValue('25');await preview(adminPage);await save(adminPage);
    record('Real concurrent change returns HTTP409, preserves input and commits only after explicit current-context reload');

    // Drop one real committed response, then allow the actual application retry.
    let lost=false;const savedBefore=Number(sql(`select count(*) from private.manual_event_maintenance_receipts where actor_id=${literal(fixture.admin.id)};`).trim());
    await adminPage.route('**/rest/v1/rpc/save_manual_event_maintenance',async route=>{
      if(!lost){lost=true;const real=await route.fetch();assert.equal(real.status(),200);await route.abort('failed');}else await route.continue();
    });
    if(!await field(adminPage,'edition.price_max').isVisible())await optional(adminPage);
    await field(adminPage,'edition.price_max').fill('42.5');await preview(adminPage);await adminPage.locator('[data-maintenance-save]').click();
    await expect(status(adminPage)).toContainText('In der Datenbank gespeichert',{timeout:30000});await expect(adminPage.locator('#adminEventMaintenancePanel')).toHaveAttribute('aria-busy','false',{timeout:30000});await adminPage.unroute('**/rest/v1/rpc/save_manual_event_maintenance');
    assert.equal(readEdition(fixture.edition_id).price_max,42.5);assert.equal(Number(sql(`select count(*) from private.manual_event_maintenance_receipts where actor_id=${literal(fixture.admin.id)};`).trim()),savedBefore+1);
    record('Lost real commit response is recovered by application retry with one receipt and no duplicated edition');

    await adminPage.route('**/rest/v1/public_event_archive*',route=>route.abort('failed'));
    if(!await field(adminPage,'edition.participant_limit').isVisible())await optional(adminPage);
    await field(adminPage,'edition.participant_limit').fill('333');await preview(adminPage);await save(adminPage);
    await expect(adminPage.locator('[data-maintenance-publication]')).toContainText(/nicht erreichbar|nicht geprüft|nicht.*prüf/,{timeout:25000});
    assert.equal(readEdition(fixture.edition_id).participant_limit,333);
    await adminPage.unroute('**/rest/v1/public_event_archive*');
    await adminPage.evaluate(()=>{window.__acceptanceProcessPendingSeasonAdd=processPendingSeasonAdd;processPendingSeasonAdd=async()=>{throw new Error('Controlled local acceptance catalog preparation failure');};});
    await adminPage.locator('[data-maintenance-check-publication]').click();
    await expect(adminPage.locator('[data-maintenance-publication]')).toContainText('Datenbank gespeichert; die öffentliche Übernahme ist noch nicht bestätigt.',{timeout:25000});
    await expect(adminPage.locator('[data-maintenance-publication]')).toContainText('Öffentlicher Katalog: geprüft. Detailseite: geprüft. Karte und Liste: noch nicht bestätigt.');
    await expect(adminPage.locator('[data-maintenance-publication]')).not.toContainText('Öffentlich aktualisiert');
    await expect(adminPage.locator('[data-maintenance-check-publication]')).toBeVisible();assert.equal(readEdition(fixture.edition_id).participant_limit,333);
    await adminPage.evaluate(()=>{processPendingSeasonAdd=window.__acceptanceProcessPendingSeasonAdd;delete window.__acceptanceProcessPendingSeasonAdd;});
    await adminPage.locator('[data-maintenance-check-publication]').click();
    await expect(adminPage.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert: Normale Detailseite geprüft.',{timeout:25000});
    record('Actual public read failure preserves DB commit and shows retryable publication failure; retry uses real public path');
    record('Catalog preparation failure cannot claim publication success; restored actual function and explicit retry succeed');

    // Exercise the new Knowledge fields through the actual form and Auth/API
    // chain, then inspect a separate anonymous regular detail page.
    const knowledge=adminPage.locator('[data-maintenance-knowledge] > details');
    await knowledge.locator(':scope > summary').click();
    await adminPage.locator('[data-knowledge-section="registration"] > summary').click();
    await adminPage.locator('[data-knowledge-add="registration.price_tiers"]').click();
    const tier=adminPage.locator('[data-knowledge-array="registration.price_tiers"]').first();
    await tier.locator('[data-knowledge-cell="tier"]').fill('Geprüfte Testgebühr');
    await tier.locator('[data-knowledge-cell="price"]').fill('31');
    await adminPage.locator('[data-knowledge-section="faq"] > summary').click();
    await adminPage.locator('[data-knowledge-add-faq]').click();
    const faq=adminPage.locator('[data-knowledge-faq]').first(),faqId=await faq.getAttribute('data-knowledge-faq');
    await faq.locator('[data-knowledge-question]').fill('Wo ist das geprüfte Startbüro?');
    await faq.locator('[data-knowledge-answer]').fill('Am ausdrücklich geprüften Testbahnhof.');
    await preview(adminPage);await save(adminPage);
    await expect(adminPage.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert',{timeout:25000});
    const savedKnowledge=parse(sql(`select jsonb_build_object('tiers',r.price_tiers,'faq',to_jsonb(q)) from public.event_details d join public.event_registration r on r.event_detail_id=d.id join public.event_faq q on q.event_detail_id=d.id where d.edition_id=${literal(fixture.edition_id)} and q.id=${literal(faqId)};`));
    assert.equal(savedKnowledge.tiers[0].tier,'Geprüfte Testgebühr');assert.equal(savedKnowledge.faq.answer,'Am ausdrücklich geprüften Testbahnhof.');
    await visitor.reload();await expect(visitor.locator('html')).toHaveAttribute('data-sem-public-detail-knowledge-state','verified',{timeout:25000});
    await expect(visitor.locator('#registration .race-guide-table')).toContainText('Geprüfte Testgebühr');
    await visitor.locator('#faq details > summary').click();await expect(visitor.locator('#faq')).toContainText(savedKnowledge.faq.answer);
    const renderedKnowledge=JSON.parse(await visitor.locator('#sem-public-detail-knowledge-data').textContent());
    assert.ok(renderedKnowledge.some(row=>row.rendered_fields?.includes('registration.price_tiers')));
    const approvedBundle=await fetch(apiUrl+'/rest/v1/rpc/get_public_event_detail_bundle',{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_edition_id:fixture.edition_id})});
    assert.equal(approvedBundle.status,200);assert.ok((await approvedBundle.json()).some(row=>row.manual_approved_fields?.includes('registration.price_tiers')));
    assert.equal(Number(sql(`select count(*) from public.event_detail_sources s join public.event_details d on d.id=s.event_detail_id where d.edition_id=${literal(fixture.edition_id)};`).trim()),0,'Manual approval does not create citations');
    await visitor.locator('#eventDetailLanguageSelect').selectOption('en');
    await expect(visitor.locator('#registration .race-guide-table')).toContainText('Geprüfte Testgebühr');
    await expect(visitor.locator('#faq')).toContainText(savedKnowledge.faq.question);
    await adminPage.reload();await expect(adminPage.locator('#adminBtn')).toBeVisible();await openEditor(adminPage);
    await knowledge.locator(':scope > summary').click();await adminPage.locator('[data-knowledge-section="faq"] > summary').click();
    await expect(adminPage.locator(`[data-knowledge-faq="${faqId}"] [data-knowledge-answer]`)).toHaveValue(savedKnowledge.faq.answer);
    record('One actual modal saves manually approved tier and stable FAQ via Auth/PostgREST without fabricated citations; separate anonymous regular page renders both after reload and language change');

    const history=fixture.historical,old=readEdition(history.edition_id);
    const oldLinks=parse(sql(`select jsonb_build_object('planner',(select jsonb_agg(to_jsonb(p) order by id) from public.season_planner_events p where edition_id=${literal(history.edition_id)}),'results',(select jsonb_agg(to_jsonb(r) order by id) from public.edition_results r where edition_id=${literal(history.edition_id)}));`));
    await openEditor(adminPage,history);await adminPage.locator('[data-maintenance-action]').selectOption('create');
    await expect(field(adminPage,'edition.start_date')).toHaveValue('');await expect(field(adminPage,'edition.registration_url')).toHaveValue('');await expect(adminPage.locator('[data-maintenance-format]')).toHaveCount(0);
    await field(adminPage,'edition.edition_year').fill(String(history.year));await field(adminPage,'edition.start_date').fill(`${history.year}-08-07`);
    await field(adminPage,'edition.edition_status').selectOption('scheduled');await field(adminPage,'edition.registration_status').selectOption('registration_open');
    const nextOfficial=history.official+'/'+history.year;
    await field(adminPage,'edition.source_url').fill(nextOfficial);await field(adminPage,'edition.registration_url').fill(nextOfficial+'/register');
    await optional(adminPage);await field(adminPage,'edition.end_date').fill(`${history.year}-08-08`);
    // Intentionally leave competitions absent so the new edition is an honest
    // incomplete draft, rather than pretending a full manually approved edition
    // requires the removed source-confirmation/publish checkbox chain.
    await preview(adminPage);const newReceipt=await save(adminPage),nextId=newReceipt.edition_id;
    assert.notEqual(nextId,history.edition_id);assert.equal(readEdition(nextId).publication_status,'draft');assert.deepEqual(readEdition(history.edition_id),old);
    assert.equal((await publicRead('public_event_archive',nextId)).length,0);
    assert.equal(readEdition(nextId).last_verified_at,null);assert.equal(readEdition(nextId).last_verified_source_id,null);
    const nextSource=parse(sql(`insert into public.event_sources(event_id,edition_id,source_type,source_url,parser_type,is_active,crawl_status)
      values(${history.event_id},${literal(nextId)},'official_event_website',${literal(nextOfficial)},'json_ld',true,'pending') returning to_jsonb(event_sources);`));
    // Preserve the crawler's historical HTTP/www spelling while the same source
    // and the explicit human evidence now use HTTPS without www.
    const historicalCandidateUrl=nextOfficial.replace(/^https:\/\//,'http://www.');
    assert.notEqual(historicalCandidateUrl,nextSource.source_url);
    // Simulate one independent crawler observation in the owned local database.
    const candidate=parse(sql(`insert into public.edition_succession_candidates(event_id,source_id,predecessor_edition_id,draft_edition_id,candidate_year,candidate_start_date,source_url,confidence,fingerprint,candidate_status,validation_status,validation_reasons)
      values(${history.event_id},${literal(nextSource.id)},${literal(history.edition_id)},${literal(nextId)},${history.year},${literal(history.year+'-08-08')},${literal(historicalCandidateUrl)},0.99,${literal('acceptance-'+nextId)},'conflict','conflict',array['edition_year_date_conflict']) returning to_jsonb(edition_succession_candidates);`));
    sql(`update public.event_editions set generated_from_candidate_id=${literal(candidate.id)} where id=${literal(nextId)};`);
    await adminPage.locator('[data-maintenance-reload]').click();await adminPage.locator('[data-maintenance-reset-form]').click();
    if(!await field(adminPage,'edition.end_date').isVisible())await optional(adminPage);
    record('New edition is created by actual form with separate identity, unchanged historical edition and no inherited annual values');

    await adminPage.locator('[data-maintenance-add-format]').click();await adminPage.locator('[data-format-label]').fill('10 km');await adminPage.locator('[data-format-distance]').fill('10');
    await preview(adminPage);const blockedResponse=adminPage.waitForResponse(r=>new URL(r.url()).pathname==='/rest/v1/rpc/save_manual_event_maintenance');
    await adminPage.locator('[data-maintenance-save]').click();const blocked=await blockedResponse;
    assert.equal(blocked.status(),400);assert.equal((await blocked.json()).code,'23514');assert.equal(readEdition(nextId).publication_status,'draft');
    assert.deepEqual(readEdition(nextId).race_formats,[],'Conflict rolls back changes instead of returning a false successful save');
    await expect(status(adminPage)).toContainText(/Konflikt/i);
    await expect(adminPage.locator('[data-maintenance-publication]')).not.toContainText('Öffentlich aktualisiert');
    await adminPage.locator('[data-maintenance-reload]').click();await expect(status(adminPage)).toContainText(/geladen/);await adminPage.locator('[data-maintenance-reset-form]').click();
    const row=adminPage.locator(`[data-maintenance-review-row="${candidate.id}"]`);await expect(row).toHaveAttribute('data-maintenance-review-kind','candidate_range');
    await row.locator('[data-maintenance-review-source]').fill(nextOfficial);
    await row.locator('[data-maintenance-review-notes]').fill('Im synthetischen offiziellen Programm gehört Sonntag zum ausdrücklich bestätigten Wochenende vom Samstag bis Sonntag.');
    await row.locator('[data-maintenance-review-preview]').click();await expect(adminPage.locator('[data-maintenance-preview-box]')).toContainText('veröffentlicht keinen Entwurf');
    const proofRequiredResponse=adminPage.waitForResponse(r=>new URL(r.url()).pathname==='/rest/v1/rpc/save_manual_event_maintenance');
    await adminPage.locator('[data-maintenance-save]').click();const proofRequired=await proofRequiredResponse;
    assert.equal(proofRequired.status(),400);assert.equal((await proofRequired.json()).code,'23514');
    await expect(status(adminPage)).toContainText('Anfangs- und gegebenenfalls Enddatum');
    assert.equal(readEdition(nextId).publication_status,'draft');
    assert.equal(parse(sql(`select to_jsonb(c) from public.edition_succession_candidates c where id=${literal(candidate.id)};`)).validation_status,'conflict');
    record('Specialist conflict review rejects ordinary manual approval as source evidence and keeps the candidate unresolved');
    // This is the pre-existing specialist verification RPC, deliberately separate
    // from the normal one-modal editing workflow. Every fact and source in this
    // case is synthetic and confined to this disposable local test database.
    const dateProof=await adminPage.evaluate(async ({eventId,editionId,sourceUrl})=>{
      const current=await supabaseClient.rpc('admin_manual_event_context',{p_event_id:eventId});if(current.error)throw current.error;
      return supabaseClient.rpc('save_manual_event_maintenance',{p_request:{request_id:crypto.randomUUID(),action:'confirm',event_id:eventId,edition_id:editionId,
        expected_version:current.data.version,source_url:sourceUrl,source_result:'confirmed',publish:false,
        notes:'Ausschließlich synthetische Quellenprüfung im isolierten Test: Anfangs- und Enddatum des Testwochenendes ausdrücklich verglichen.',
        confirmations:['edition.start_date','edition.end_date']}});
    },{eventId:history.event_id,editionId:nextId,sourceUrl:nextOfficial});
    assert.equal(dateProof.error,null);assert.equal(dateProof.data.saved,true);assert.equal(dateProof.data.freshness.verified,false);assert.equal(readEdition(nextId).publication_status,'draft');
    const boundProofs=parse(sql(`select jsonb_agg(new_value order by new_value->>'field') from public.event_audit_log
      where entity_type='edition' and entity_id=${literal(nextId)} and field_name='__manual_field_verification__'
        and changed_by=${literal(fixture.admin.id)} and new_value->>'source_id'=${literal(nextSource.id)};`));
    assert.deepEqual(boundProofs.map(proof=>proof.field),['edition.end_date','edition.start_date']);
    assert.ok(boundProofs.every(proof=>proof.source_url===nextOfficial&&proof.result==='confirmed'));
    assert.equal(boundProofs.find(proof=>proof.field==='edition.start_date').value,`${history.year}-08-07`);
    assert.equal(boundProofs.find(proof=>proof.field==='edition.end_date').value,`${history.year}-08-08`);
    record('Existing specialist RPC records two exact synthetic date/source proofs under the real local admin session; it neither publishes the draft nor claims full current verification');
    await adminPage.locator('[data-maintenance-reload]').click();await expect(status(adminPage)).toContainText(/geladen/);await adminPage.locator('[data-maintenance-reset-form]').click();
    await row.locator('[data-maintenance-review-source]').fill(nextOfficial);
    await row.locator('[data-maintenance-review-notes]').fill('Im synthetischen offiziellen Programm liegt die beobachtete Sonntagveranstaltung innerhalb des ausdrücklich quellengeprüften Wochenendes.');
    await row.locator('[data-maintenance-review-preview]').click();await expect(adminPage.locator('[data-maintenance-preview-box]')).toContainText('veröffentlicht keinen Entwurf');
    await save(adminPage);
    const reviewed=parse(sql(`select to_jsonb(c) from public.edition_succession_candidates c where id=${literal(candidate.id)};`));
    assert.equal(reviewed.candidate_start_date,candidate.candidate_start_date);assert.equal(reviewed.candidate_year,candidate.candidate_year);assert.equal(reviewed.source_id,candidate.source_id);assert.equal(reviewed.fingerprint,candidate.fingerprint);
    assert.equal(reviewed.source_url,historicalCandidateUrl);
    assert.equal(parse(sql(`select to_jsonb(s) from public.event_sources s where id=${literal(nextSource.id)};`)).source_url,nextOfficial);
    assert.notEqual(reviewed.validation_status,'conflict');assert.equal(readEdition(nextId).publication_status,'draft');
    record('Real unresolved candidate prevents publication; explicit in-form HTTPS review accepts the same bound source with historical HTTP/www URL, preserves original URL and observed facts, and leaves draft private');
    await adminPage.locator('[data-maintenance-add-format]').click();await adminPage.locator('[data-format-label]').fill('10 km');await adminPage.locator('[data-format-distance]').fill('10');
    await preview(adminPage);const published=await save(adminPage);assert.equal(published.publication.status,'database_public');assert.equal(published.freshness.verified,false);
    await expect(adminPage.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert: Normale Detailseite geprüft.',{timeout:25000});
    const publicNext=await publicRead('public_event_archive',nextId);assert.equal(publicNext.length,1);assert.equal(publicNext[0].end_date,`${history.year}-08-08`);
    await visitor.goto('/event/'+publicNext[0].edition_slug+'/');await expect(visitor.locator('html')).toHaveAttribute('data-sem-public-detail-state','verified',{timeout:25000});
    await expect(visitor.locator('html')).toHaveAttribute('data-sem-public-edition-id',nextId);await expect(visitor.locator('#liveDetailChecked')).toBeHidden();
    assert.deepEqual(readEdition(history.edition_id),old);
    assert.deepEqual(parse(sql(`select jsonb_build_object('planner',(select jsonb_agg(to_jsonb(p) order by id) from public.season_planner_events p where edition_id=${literal(history.edition_id)}),'results',(select jsonb_agg(to_jsonb(r) order by id) from public.edition_results r where edition_id=${literal(history.edition_id)}));`)),oldLinks);
    record('After specialist conflict review, one actual modal approval of the missing competitions publishes the draft through anonymous regular URL without full-source claims; history/planner/results stay intact');

    const normalContext=await contextFor(),normal=await normalContext.newPage();normalPage=normal;await openApp(normal);await login(normal,fixture.user);await expect(normal.locator('#adminBtn')).toBeHidden();
    const rejection=await normal.evaluate(async ({apiUrl,eventId})=>{
      const cfg=window.SPORT_EVENT_MAP_CONFIG;
      const session=await supabaseClient.auth.getSession();
      const response=await fetch(apiUrl+'/rest/v1/rpc/admin_manual_event_context',{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+session.data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({p_event_id:eventId})});
      return {status:response.status,json:await response.json()};
    },{apiUrl,eventId:fixture.event_id});
    assert.equal(rejection.status,403);assert.equal(rejection.json.code,'42501');
    record('Real normal-user login cannot see Admin and server denies direct maintenance context independently');
    const deniedSave=await normal.evaluate(async editionId=>supabaseClient.rpc('save_manual_event_maintenance',{p_request:{request_id:crypto.randomUUID(),action:'correct',manual_approval:true,event_id:1,edition_id:editionId,edition_patch:{participant_limit:999},publish:true}}),fixture.edition_id);
    assert.equal(deniedSave.error.code,'42501');assert.equal(readEdition(fixture.edition_id).participant_limit,333);
    record('Server independently denies ordinary-user manual approval/write; real data remains unchanged');

    const archivedIds=fixture.participation.map(row=>row.edition_id);
    const owned=await normal.evaluate(async ids=>supabaseClient.rpc('get_own_planner_archived_editions',{p_edition_ids:ids}),archivedIds);
    assert.equal(owned.error,null);assert.equal(owned.data.length,8);assert.ok(owned.data.every(row=>row.catalog_visibility==='owned_archived'&&row.publication_status==='archived'));
    assert.ok(owned.data.every(row=>!('planner_details' in row)&&!('sources' in row)&&!('verifications' in row)&&!('review_notes' in row)));
    const foreign=await adminPage.evaluate(async ids=>supabaseClient.rpc('get_own_planner_archived_editions',{p_edition_ids:ids}),archivedIds);
    assert.equal(foreign.error,null);assert.deepEqual(foreign.data,[],'Another authenticated account cannot retrieve the owner\'s archived editions');
    const anonOwn=await fetch(apiUrl+'/rest/v1/rpc/get_own_planner_archived_editions',{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_edition_ids:archivedIds})});
    assert.ok([401,403].includes(anonOwn.status));assert.equal((await anonOwn.json()).code,'42501');
    for(const editionId of archivedIds){assert.equal((await publicRead('public_event_archive',editionId)).length,0);assert.equal((await publicRead('public_event_discovery',editionId)).length,0);}
    record('Real own-archive RPC returns only caller-bound whitelisted historical facts; anonymous and other-account access fail, with no archive or Discovery exposure');

    await normal.waitForFunction(()=>window.getPersonalPlannedEvents?.().length===10,{},{timeout:30000});
    const actualCohort=await normal.evaluate(()=>({
      planned:getPersonalPlannedEvents().map(row=>({edition_id:row.edition_id,key:getEventKey(row),owned:row._planner_owned_archive===true,finished:getPersonalParticipationState(row).finished})),
      discovery:events.map(row=>row.edition_id),favorites:getProfileFavoriteEvents().length,
      counts:getProfileArchiveFilterCounts(getProfileCompletedArchiveEvents())
    }));
    assert.equal(actualCohort.favorites,0);assert.equal(actualCohort.planned.filter(row=>row.owned).length,8);
    assert.equal(new Set(actualCohort.planned.map(row=>row.edition_id)).size,10);assert.ok(archivedIds.every(id=>!actualCohort.discovery.includes(id)));
    assert.equal(actualCohort.planned.find(row=>row.edition_id===fixture.historical.edition_id).finished,false,'A passed edition date is not a finish');
    assert.deepEqual(actualCohort.counts,{all:9,finisher:5,dnf_dns:3,with_result:8,without_result:1});
    async function checkProfile(count){
      await normal.evaluate(async()=>openProfileModal());
      await expect(normal.locator('#profileCompletedCount')).toHaveText(`${count} completed`);
      await expect(normal.locator('#profileAchievementBadges .is-unlocked')).toHaveCount(count>=5?1:0);
      if(await normal.locator('#profileCompletedArchiveToggle').getAttribute('aria-expanded')!=='true')await normal.locator('#profileCompletedArchiveToggle').click();
      await expect(normal.locator('#profileCompletedArchiveList .profile-completed-archive-card')).toHaveCount(9);
      await normal.locator('#closeProfileModal').click();
      await expect(normal.locator('#profileModal')).not.toHaveClass(/open/);
    }
    await checkProfile(5);
    record('Real cloud loader keeps ten exact planned editions across public and owned archives, with five lifetime finishes, first badge, DNF/DNS/DSQ and an unfinished past edition independent of Favorites');

    const edited=fixture.participation.find(row=>row.status==='Finished');
    const plannerCount=Number(sql(`select count(*) from public.season_planner_events where user_id=${literal(fixture.user.id)};`).trim());
    const originalPlanner=parse(sql(`select to_jsonb(p) from public.season_planner_events p where user_id=${literal(fixture.user.id)} and event_id=${literal(edited.key)};`));
    async function enterPlanner(){
      await expect(normal.locator('#profileModal')).not.toHaveClass(/open/);
      await normal.setViewportSize({width:1440,height:1000});
      await normal.getByTestId('nav-season-planner').click();
      await expect(normal).toHaveURL(/#\/planner$/);
      await expect(normal.locator('body')).toHaveClass(/platform-route-planner/);
      await expect(normal.getByTestId('season-planner')).toHaveClass(/open/,{timeout:30000});
      await expect(normal.locator('#plannerPageMount > #seasonPlannerModal')).toBeVisible();
    }
    await enterPlanner();
    await normal.getByTestId('planner-tab-events').click();
    await expect(normal.getByTestId('planner-event-card')).toHaveCount(10);
    await normal.setViewportSize({width:390,height:844});
    await normal.locator(`[data-season-edit="${edited.key}"]`).click();
    await expect(normal.getByTestId('planner-event-edit-card')).toContainText('Eigene archivierte Edition');
    async function resultControl(){
      const control=normal.getByTestId('planner-field-result-finish-status');
      if(!await control.isVisible())await normal.locator('[data-season-result-edit]').first().click();
      await expect(control).toBeVisible();return control;
    }
    async function persistedStatus(value){
      await (await resultControl()).selectOption(value);
      await expect(normal.locator('[data-planner-sync-status]')).toContainText('In der Cloud gespeichert und erneut gelesen',{timeout:30000});
      const actual=parse(sql(`select to_jsonb(p) from public.season_planner_events p where user_id=${literal(fixture.user.id)} and event_id=${literal(edited.key)};`));
      assert.equal(actual.id,originalPlanner.id);assert.equal(actual.edition_id,edited.edition_id);assert.equal(actual.planner_details.result.finish_status,value);
      assert.equal(Number(sql(`select count(*) from public.season_planner_events where user_id=${literal(fixture.user.id)};`).trim()),plannerCount);
    }
    await persistedStatus('DNF');await checkProfile(4);
    await persistedStatus('Finished');await checkProfile(5);
    await normal.locator(`[data-season-archive="${edited.key}"]`).click();
    await expect(normal.locator('[data-planner-sync-status]')).toContainText('In der Cloud gespeichert und erneut gelesen',{timeout:30000});
    assert.equal(parse(sql(`select planner_details from public.season_planner_events where id=${literal(originalPlanner.id)};`)).post_race.archived,true);
    await checkProfile(5);
    await persistedStatus('');await checkProfile(4);
    await normal.reload();
    await normal.waitForFunction(()=>window.getPersonalPlannedEvents?.().length===10,{},{timeout:30000});
    await enterPlanner();await normal.setViewportSize({width:390,height:844});
    await normal.getByTestId('planner-tab-events').click();await normal.locator(`[data-season-edit="${edited.key}"]`).click();
    await expect(await resultControl()).toHaveValue('');
    assert.equal(await normal.evaluate(key=>getSeasonPlannerDetails(key).post_race.archived,edited.key),true);
    await checkProfile(4);
    assert.equal(Number(sql(`select count(*) from public.season_planner_events where user_id=${literal(fixture.user.id)};`).trim()),plannerCount);
    record('Actual mobile result controls persist Finished -> DNF -> Finished -> archive -> removed status through cloud readback/reload; badges recalculate 5/4 without duplicate rows or lost edition links');
    assert.equal(report.production_requests.length,0,'No request may reach production');
    assert.equal(report.external_write_attempts.length,0,'No external write may leave the isolated API');
    report.passed=true;return report;
  }catch(error){report.passed=false;report.failure={name:error.name,message:error.message};if(adminPage){report.failure.ui=await adminPage.evaluate(()=>({status:document.querySelector('[data-maintenance-status]')?.textContent,publication:document.querySelector('[data-maintenance-publication]')?.textContent,busy:document.querySelector('#adminEventMaintenancePanel')?.getAttribute('aria-busy'),invalid:[...document.querySelectorAll('[data-maintenance-form] :invalid')].map(el=>({field:el.dataset.maintenanceField,message:el.validationMessage})),url:location.href})).catch(()=>null);await adminPage.screenshot({path:path.join(outputDir,'acceptance-failure.png'),fullPage:true}).catch(()=>{});}if(normalPage){report.failure.normal_ui=await normalPage.evaluate(()=>({url:location.href,body_classes:document.body.className,planner_classes:document.querySelector('#seasonPlannerModal')?.className,planner_parent:document.querySelector('#seasonPlannerModal')?.parentElement?.id,planner_auth_required:{hidden:document.querySelector('#plannerAuthRequired')?.hidden,aria_hidden:document.querySelector('#plannerAuthRequired')?.getAttribute('aria-hidden')},profile_open:document.querySelector('#profileModal')?.classList.contains('open')})).catch(()=>null);await normalPage.screenshot({path:path.join(outputDir,'acceptance-normal-failure.png'),fullPage:true}).catch(()=>{});}throw error;}
  finally{await browser.close();report.browser_closed=true;fs.writeFileSync(path.join(outputDir,'browser-acceptance-report.json'),JSON.stringify(report,null,2)+'\n');}
}
