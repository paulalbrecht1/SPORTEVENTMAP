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
  const required=['event.canonical_name','edition.edition_year','edition.start_date','event.city','event.country','event.address','event.latitude','event.longitude','event.sport','edition.race_formats','event.description','edition.registration_status','edition.source_url','edition.registration_url'];
  let adminPage;
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
    await page.locator('[data-maintenance-search]').fill(target.name);await page.locator('[data-maintenance-search-form] button[type="submit"]').click();
    await page.locator(`[data-maintenance-event="${target.event_id}"]`).click();await expect(field(page,'event.canonical_name')).toHaveValue(target.name);
  }
  async function optional(page){const details=field(page,'edition.price_min').locator('xpath=ancestor::details');if(await details.count())await details.locator('summary').click();}
  async function preview(page,notes='Synthetische offizielle Angaben im isolierten Test ausdrücklich geprüft.'){await expect(page.locator('#adminEventMaintenancePanel')).not.toHaveAttribute('aria-busy','true',{timeout:30000});await page.locator('[data-maintenance-notes]').fill(notes);await page.locator('[data-maintenance-preview]').click();await expect(page.locator('[data-maintenance-preview-box]')).toBeVisible();}
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
    for(const name of required)await adminPage.locator(`[data-maintenance-confirm="${name}"]`).check();
    await preview(adminPage);const receipt=await save(adminPage);assert.equal(receipt.saved,true);
    const reloaded=readEdition(fixture.edition_id);for(const [key,value] of Object.entries(expected))assert.equal(reloaded[key],value,key+' actual DB reload');
    await expect(adminPage.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert: Normale Detailseite geprüft.',{timeout:25000});
    const rows=await publicRead('public_event_archive',fixture.edition_id);assert.equal(rows.length,1);for(const [key,value] of Object.entries(expected))assert.equal(rows[0][key],value,key+' anonymous API');
    const guard=await fetch(apiUrl+'/rest/v1/rpc/get_public_event_freshness_guard',{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_edition_ids:[fixture.edition_id]})});
    assert.equal(guard.status,200);const actualGuard=await guard.json();assert.equal(actualGuard.decisions[fixture.edition_id],true,'Actual nested freshness guard');
    const staticResponse=await visitor.goto('/event/'+fixture.edition_slug+'/');assert.equal(staticResponse.status(),200);
    assert.equal(await staticResponse.text(),fs.readFileSync(path.join(root,'event',fixture.edition_slug,'index.html'),'utf8'),'Actual unchanged static baseline served');
    await expect(visitor.locator('html')).toHaveAttribute('data-sem-public-detail-state','verified',{timeout:25000});
    await expect(visitor.locator('html')).toHaveAttribute('data-sem-public-edition-id',fixture.edition_id);
    const visible=JSON.parse(await visitor.locator('#sem-public-detail-data').textContent());for(const [key,value] of Object.entries(expected))assert.equal(visible[key],value,key+' actual regular-path rendered evidence');
    await expect(visitor.locator('#liveDetailName')).toContainText(fixture.name);await expect(visitor.locator('#liveDetailChecked')).toBeVisible();
    await expect(visitor.locator('#liveDetailFacts')).toContainText('321');await expect(visitor.locator('#liveDetailFacts')).toContainText('CHF');await expect(visitor.locator('#liveDetailFacts')).toContainText('10:35');
    assert.ok(await visitor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    await visitor.screenshot({path:path.join(outputDir,'anonymous-regular-detail.png'),fullPage:true});
    record('Six optional fields persist through actual form -> DB -> anonymous archive -> existing regular event page, including true nested freshness guard');

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
    await expect(adminPage.locator('[data-maintenance-publication]')).toContainText('noch nicht vollständig verifiziert',{timeout:25000});
    await adminPage.evaluate(()=>{processPendingSeasonAdd=window.__acceptanceProcessPendingSeasonAdd;delete window.__acceptanceProcessPendingSeasonAdd;});
    await adminPage.locator('[data-maintenance-check-publication]').click();
    await expect(adminPage.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert: Normale Detailseite geprüft.',{timeout:25000});
    record('Actual public read failure preserves DB commit and shows retryable publication failure; retry uses real public path');
    record('Catalog preparation failure cannot claim publication success; restored actual function and explicit retry succeed');

    const history=fixture.historical,old=readEdition(history.edition_id);
    const oldLinks=parse(sql(`select jsonb_build_object('planner',(select jsonb_agg(to_jsonb(p) order by id) from public.season_planner_events p where edition_id=${literal(history.edition_id)}),'results',(select jsonb_agg(to_jsonb(r) order by id) from public.edition_results r where edition_id=${literal(history.edition_id)}));`));
    await openEditor(adminPage,history);await adminPage.locator('[data-maintenance-action]').selectOption('create');
    await expect(field(adminPage,'edition.start_date')).toHaveValue('');await expect(field(adminPage,'edition.registration_url')).toHaveValue('');await expect(adminPage.locator('[data-maintenance-format]')).toHaveCount(0);
    await field(adminPage,'edition.edition_year').fill(String(history.year));await field(adminPage,'edition.start_date').fill(`${history.year}-08-07`);
    await field(adminPage,'edition.edition_status').selectOption('scheduled');await field(adminPage,'edition.registration_status').selectOption('registration_open');
    const nextOfficial=history.official+'/'+history.year;
    await field(adminPage,'edition.source_url').fill(nextOfficial);await field(adminPage,'edition.registration_url').fill(nextOfficial+'/register');
    await optional(adminPage);await field(adminPage,'edition.end_date').fill(`${history.year}-08-08`);
    await adminPage.locator('[data-maintenance-add-format]').click();await adminPage.locator('[data-format-label]').fill('10 km');await adminPage.locator('[data-format-distance]').fill('10');
    await adminPage.locator('[data-maintenance-source]').fill(nextOfficial);await preview(adminPage);const newReceipt=await save(adminPage),nextId=newReceipt.edition_id;
    assert.notEqual(nextId,history.edition_id);assert.equal(readEdition(nextId).publication_status,'draft');assert.deepEqual(readEdition(history.edition_id),old);
    assert.equal((await publicRead('public_event_archive',nextId)).length,0);
    const nextSource=parse(sql(`select to_jsonb(s) from public.event_sources s where edition_id=${literal(nextId)} and source_url=${literal(nextOfficial)};`));
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
    await adminPage.locator('[data-maintenance-confirm="edition.start_date"]').check();await adminPage.locator('[data-maintenance-confirm="edition.end_date"]').check();await preview(adminPage);await save(adminPage);
    record('New edition is created by actual form with separate identity, unchanged historical edition and no inherited annual values');

    if(!await field(adminPage,'event.address').isVisible())await optional(adminPage);
    for(const name of required)await adminPage.locator(`[data-maintenance-confirm="${name}"]`).check();
    await adminPage.locator('[data-maintenance-publish]').check();await preview(adminPage);const blocked=await save(adminPage);
    assert.equal(blocked.publication.status,'failed');assert.equal(readEdition(nextId).publication_status,'draft');
    await expect(adminPage.locator('[data-maintenance-publication]')).not.toContainText('Öffentlich aktualisiert');
    const row=adminPage.locator(`[data-maintenance-review-row="${candidate.id}"]`);await expect(row).toHaveAttribute('data-maintenance-review-kind','candidate_range');
    await row.locator('[data-maintenance-review-source]').fill(nextOfficial);
    await row.locator('[data-maintenance-review-notes]').fill('Im synthetischen offiziellen Programm gehört Sonntag zum ausdrücklich bestätigten Wochenende vom Samstag bis Sonntag.');
    await row.locator('[data-maintenance-review-preview]').click();await expect(adminPage.locator('[data-maintenance-preview-box]')).toContainText('veröffentlicht keinen Entwurf');
    await save(adminPage);
    const reviewed=parse(sql(`select to_jsonb(c) from public.edition_succession_candidates c where id=${literal(candidate.id)};`));
    assert.equal(reviewed.candidate_start_date,candidate.candidate_start_date);assert.equal(reviewed.candidate_year,candidate.candidate_year);assert.equal(reviewed.source_id,candidate.source_id);assert.equal(reviewed.fingerprint,candidate.fingerprint);
    assert.equal(reviewed.source_url,historicalCandidateUrl);
    assert.equal(parse(sql(`select to_jsonb(s) from public.event_sources s where id=${literal(nextSource.id)};`)).source_url,nextOfficial);
    assert.notEqual(reviewed.validation_status,'conflict');assert.equal(readEdition(nextId).publication_status,'draft');
    record('Real unresolved candidate prevents publication; explicit in-form HTTPS review accepts the same bound source with historical HTTP/www URL, preserves original URL and observed facts, and leaves draft private');
    if(!await field(adminPage,'event.address').isVisible())await optional(adminPage);
    for(const name of required)await adminPage.locator(`[data-maintenance-confirm="${name}"]`).check();
    await adminPage.locator('[data-maintenance-publish]').check();await preview(adminPage);const published=await save(adminPage);assert.equal(published.publication.status,'database_public');
    await expect(adminPage.locator('[data-maintenance-publication]')).toContainText('Öffentlich aktualisiert: Normale Detailseite geprüft.',{timeout:25000});
    const publicNext=await publicRead('public_event_archive',nextId);assert.equal(publicNext.length,1);assert.equal(publicNext[0].end_date,`${history.year}-08-08`);
    await visitor.goto('/event/'+publicNext[0].edition_slug+'/');await expect(visitor.locator('html')).toHaveAttribute('data-sem-public-detail-state','verified',{timeout:25000});
    await expect(visitor.locator('html')).toHaveAttribute('data-sem-public-edition-id',nextId);await expect(visitor.locator('#liveDetailChecked')).toBeVisible();
    assert.deepEqual(readEdition(history.edition_id),old);
    assert.deepEqual(parse(sql(`select jsonb_build_object('planner',(select jsonb_agg(to_jsonb(p) order by id) from public.season_planner_events p where edition_id=${literal(history.edition_id)}),'results',(select jsonb_agg(to_jsonb(r) order by id) from public.edition_results r where edition_id=${literal(history.edition_id)}));`)),oldLinks);
    record('After separate full14 confirmation, resolved draft publishes through actual form and anonymous regular URL; history/planner/results stay intact');

    const normalContext=await contextFor(),normal=await normalContext.newPage();await openApp(normal);await login(normal,fixture.user);await expect(normal.locator('#adminBtn')).toBeHidden();
    const rejection=await normal.evaluate(async ({apiUrl,eventId})=>{
      const cfg=window.SPORT_EVENT_MAP_CONFIG;
      const session=await supabaseClient.auth.getSession();
      const response=await fetch(apiUrl+'/rest/v1/rpc/admin_manual_event_context',{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+session.data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({p_event_id:eventId})});
      return {status:response.status,json:await response.json()};
    },{apiUrl,eventId:fixture.event_id});
    assert.equal(rejection.status,403);assert.equal(rejection.json.code,'42501');
    record('Real normal-user login cannot see Admin and server denies direct maintenance context independently');
    assert.equal(report.production_requests.length,0,'No request may reach production');
    report.passed=true;return report;
  }catch(error){report.passed=false;report.failure={name:error.name,message:error.message};if(adminPage){report.failure.ui=await adminPage.evaluate(()=>({status:document.querySelector('[data-maintenance-status]')?.textContent,publication:document.querySelector('[data-maintenance-publication]')?.textContent,busy:document.querySelector('#adminEventMaintenancePanel')?.getAttribute('aria-busy'),invalid:[...document.querySelectorAll('[data-maintenance-form] :invalid')].map(el=>({field:el.dataset.maintenanceField,message:el.validationMessage})),url:location.href})).catch(()=>null);await adminPage.screenshot({path:path.join(outputDir,'acceptance-failure.png'),fullPage:true}).catch(()=>{});}throw error;}
  finally{await browser.close();report.browser_closed=true;fs.writeFileSync(path.join(outputDir,'browser-acceptance-report.json'),JSON.stringify(report,null,2)+'\n');}
}
