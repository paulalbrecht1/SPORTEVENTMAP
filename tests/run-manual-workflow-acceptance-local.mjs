import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runBrowserAcceptance } from './manual-workflow-acceptance-browser.mjs';

// A real, disposable PostgREST + GoTrue + browser test. This runner never accepts
// an external database URL, existing session, production key or linked project.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, 'exports', 'manual-workflow-acceptance');
fs.mkdirSync(outputRoot, { recursive: true });
const args=process.argv.slice(2),resumeIndex=args.indexOf('--resume');
const stage=resumeIndex>=0?path.resolve(root,args[resumeIndex+1]||''):fs.mkdtempSync(path.join(outputRoot,'run-'));
assert.equal(path.dirname(fs.realpathSync(stage)),fs.realpathSync(outputRoot),'Only this runner\'s export directory can be resumed.');
assert.match(path.basename(stage),/^run-[a-z0-9]+$/i);
const metadataPath=path.join(stage,'owned-stack.json');
const metadata=resumeIndex>=0?JSON.parse(fs.readFileSync(metadataPath,'utf8')):{projectId:'sport-event-map-acceptance-'+path.basename(stage).slice(4).toLowerCase()};
const projectId=metadata.projectId;
assert.equal(projectId,'sport-event-map-acceptance-'+path.basename(stage).slice(4).toLowerCase());
fs.writeFileSync(metadataPath,JSON.stringify(metadata,null,2));
const cli = path.join(root, 'node_modules/supabase/dist/supabase.js');
const env = { ...process.env, DO_NOT_TRACK: '1', SUPABASE_TELEMETRY_DISABLED: '1' };
for (const key of Object.keys(env)) if (/^SUPABASE_(ACCESS_TOKEN|DB_PASSWORD|PROJECT_ID|PROJECT_REF|URL|ANON_KEY|PUBLISHABLE_KEY|SERVICE_ROLE_KEY|SECRET_KEY)$/.test(key)) delete env[key];
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'CONTAINER_HOST', 'CONTAINER_CONNECTION']) delete env[key];
env.DOCKER_HOST = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
const containerCli = ['C:\\Program Files\\RedHat\\Podman\\podman.exe', 'docker', 'podman'].find(command => spawnSync(command, ['--version'], { encoding: 'utf8', env }).status === 0);
assert.ok(containerCli, 'An available local Podman/Docker engine is required.');
if (process.platform === 'win32') {
  const excluded = spawnSync('netsh.exe', ['interface','ipv4','show','excludedportrange','protocol=tcp'], {encoding:'utf8'});
  if (excluded.status === 0) for (const match of excluded.stdout.matchAll(/^\s*(\d+)\s+(\d+)\s*\*?\s*$/gm)) {
    for (const port of [56320,56321,56322]) assert.ok(port<Number(match[1])||port>Number(match[2]), `Local acceptance port ${port} is reserved by Windows; choose a free range before starting containers.`);
  }
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${path.basename(command)} failed: ${String(result.stderr || result.error || '').slice(-6000)}`);
  return result.stdout;
}
if (/podman/i.test(containerCli)) {
  const current = JSON.parse(run(containerCli, ['system', 'connection', 'list', '--format', 'json'])).find(row => row.Default);
  const endpoint = new URL(current.URI);
  assert.ok(endpoint.protocol === 'unix:' || ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname), 'Remote container engine forbidden.');
}
const container = 'supabase_db_' + projectId;
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const parse = output => JSON.parse(output.trim().split(/\r?\n/).at(-1));
function sql(statement) {
  const labels = JSON.parse(run(containerCli, ['inspect', '--format', '{{json .Config.Labels}}', container]));
  assert.equal(labels['com.supabase.cli.project'], projectId);
  return run(containerCli, ['exec', '-i', container, 'psql', '--quiet', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--username', 'postgres', '--dbname', 'postgres', '--no-align', '--tuples-only'], { input: statement });
}
const report = { started_at: new Date().toISOString(), projectId, production_touched: false, real_auth: true, mocked_successful_rpc: false };
let started = false, server;
try {
  const target = path.join(stage, 'supabase');
  if(resumeIndex<0){
    fs.mkdirSync(target);
    fs.cpSync(path.join(root, 'supabase/migrations'), path.join(target, 'migrations'), { recursive: true });
    const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8').replace(/^project_id\s*=.*$/m, `project_id = "${projectId}"`).replace(/\b543(\d\d)\b/g, '563$1').replace(/\b8083\b/g, '18094');
    fs.writeFileSync(path.join(target, 'config.toml'), config);
  }
  assert.equal(fs.existsSync(path.join(target, '.temp/project-ref')), false);
  started = true; console.log((resumeIndex<0?'Starting':'Resuming')+' disposable local acceptance stack; public API port 56321.');
  if(resumeIndex<0)run(process.execPath, [cli, '--workdir', stage, 'start', '-x', 'edge-runtime,imgproxy,logflare,mailpit,postgres-meta,realtime,storage-api,studio,supavisor,vector']);
  else {
    sql("select 'owned isolated stack available';");
    // Remove only this runner's accounts first: their own Planner rows cascade
    // with the accounts, preserving the edition FK's deliberate RESTRICT rule.
    if(metadata.actorIds?.length)sql(`delete from auth.users where id in(${metadata.actorIds.map(id=>{assert.match(id,/^[a-f0-9-]{36}$/);return literal(id);}).join(',')});`);
    if(metadata.eventIds?.length)sql(`delete from public.events where id in(${metadata.eventIds.map(id=>{assert.ok(Number.isSafeInteger(id));return id;}).join(',')});`);
  }
  sql('select cron.unschedule(jobid) from cron.job;');
  const status = JSON.parse(run(process.execPath, [cli, '--workdir', stage, 'status', '-o', 'json']));
  assert.equal(status.API_URL, 'http://127.0.0.1:56321');
  const apiUrl = status.API_URL, publishableKey = status.ANON_KEY;
  assert.ok(publishableKey, 'Disposable local anon key required.');
  report.postgrest_image = run(containerCli, ['inspect', '--format', '{{.Config.Image}}', 'supabase_rest_' + projectId]).trim();
  report.migrations = sql('select count(*) from supabase_migrations.schema_migrations;').trim();
  const sqlRegression = sql("set sporteventmap.test_manual_maintenance='isolated';\n" + fs.readFileSync(path.join(root,'tests/manual-event-maintenance.sql'),'utf8'));
  fs.writeFileSync(path.join(stage,'sql-regression.log'),sqlRegression);
  assert.match(sqlRegression,/MANUAL_MAINTENANCE_ASSERTIONS=\d+/);
  report.sql_assertions = Number(sqlRegression.match(/MANUAL_MAINTENANCE_ASSERTIONS=(\d+)/)[1]);
  console.log('SQL assertions passed: '+report.sql_assertions);
  const knowledgeRegression = sql("set sporteventmap.test_manual_maintenance='isolated';\n" + fs.readFileSync(path.join(root,'tests/manual-event-knowledge.sql'),'utf8'));
  fs.writeFileSync(path.join(stage,'knowledge-regression.log'),knowledgeRegression);
  assert.match(knowledgeRegression,/MANUAL_KNOWLEDGE_ASSERTIONS=\d+/);
  report.knowledge_sql_assertions = Number(knowledgeRegression.match(/MANUAL_KNOWLEDGE_ASSERTIONS=(\d+)/)[1]);
  console.log('Knowledge SQL assertions passed: '+report.knowledge_sql_assertions);
  for(const [file,setting,marker] of [
    ['manual-approved-save.sql','test_manual_approval','MANUAL_APPROVAL_ASSERTIONS'],
    ['own-planner-archived-editions.sql','test_own_planner_archive','OWN_ARCHIVE_ASSERTIONS'],
    ['catalog-consistent-snapshot.sql','test_catalog_snapshot','CATALOG_SNAPSHOT_ASSERTIONS'],
    ['housekeeping-validation-route.sql','test_housekeeping','HOUSEKEEPING_ASSERTIONS']
  ]) {
    const regression=sql(`set sporteventmap.${setting}='isolated';\n`+fs.readFileSync(path.join(root,'tests',file),'utf8'));
    fs.writeFileSync(path.join(stage,file.replace('.sql','-regression.log')),regression);
    const completed=regression.match(new RegExp(marker+'=(\\d+)'));assert.ok(completed,`Missing ${file} completion marker`);
    report[file.replace('.sql','').replaceAll('-','_')+'_assertions']=Number(completed[1]);
    console.log(marker+'='+completed[1]);
  }
  if(args.includes('--prepare-only')) {
    report.prepared_only=true;
    report.browser_acceptance_pending=true;
  } else {
  const rls=spawnSync(process.execPath,[path.join(root,'tests/local-rls-security.test.mjs')],{cwd:root,encoding:'utf8',env:{...env,SPORT_EVENT_MAP_LOCAL_SUPABASE_WORKDIR:stage},maxBuffer:16*1024*1024});
  const rlsLog=[rls.stdout,rls.stderr].filter(Boolean).join('\n');fs.writeFileSync(path.join(stage,'local-rls-security.log'),rlsLog);
  report.local_rls={passed:rls.status===0,workdir:path.relative(root,stage),log:'local-rls-security.log'};
  assert.equal(rls.status,0,`Existing isolated Auth/RLS suite failed; see ${path.join(stage,'local-rls-security.log')}`);
  assert.match(rlsLog,/Local Supabase Auth and RLS verification passed\./);
  console.log('Existing local Auth/RLS suite passed against the exact owned workflow stack.');
  for (const field of ['end_date','start_time','price_min','price_max','currency','participant_limit']) {
    assert.equal(sql(`select count(*) from information_schema.columns where table_schema='public' and table_name='public_event_archive' and column_name=${literal(field)};`).trim(), '1', `Acceptance backend migration missing ${field}`);
  }
  const marker = randomUUID();
  async function createAccount(kind) {
    const email = `acceptance-${kind}-${marker}@example.com`, password = 'Local-acceptance-' + randomUUID();
    const response = await fetch(apiUrl + '/auth/v1/signup', { method:'POST', headers:{apikey:publishableKey,'Content-Type':'application/json'}, body:JSON.stringify({email,password}) });
    const data = await response.json(); assert.equal(response.status,200); assert.ok(data.user?.id && data.access_token);
    if (kind==='admin') sql(`update public.profiles set role='admin' where id=${literal(data.user.id)};`);
    return { email, password, id:data.user.id };
  }
  const admin = await createAccount('admin'), user = await createAccount('user');
  metadata.actorIds=[admin.id,user.id];fs.writeFileSync(metadataPath,JSON.stringify(metadata,null,2));
  const year = new Date().getUTCFullYear()+1, date = `${year}-06-10`;
  const name = 'Akzeptanzlauf '+marker.slice(0,8), official='https://example.invalid/acceptance-'+marker;
  const fixture = parse(sql(`
    insert into public.events(event_name,date,city,country,sport,address,latitude,longitude,distance,description,event_url,source_url,status)
    values(${literal(name)},${literal('10.06.'+year)},'Berlin','Germany','Running','Teststraße 1','52.52000','13.40500','10 km',
      'Synthetische Laufveranstaltung ausschließlich für die isolierte Website-Abnahme. Rundkurs mit ausgeschilderter Strecke und Anmeldung.',${literal(official)},${literal(official)},'approved');
    update public.event_editions set edition_slug='07-stadtholz-marathon-2026',edition_status='scheduled',publication_status='published',discovery_status='active',race_formats='[{"label":"10 km","distance_km":10}]',registration_status='registration_open',registration_url=${literal(official+'/register')},source_url=${literal(official)},end_date=${literal(date)},start_time='09:00',price_min=10,price_max=15,currency='EUR',participant_limit=200 where event_id=(select id from public.events where event_name=${literal(name)});
    insert into public.event_sources(event_id,edition_id,source_type,source_url,parser_type,is_active,crawl_status)
    select event_id,id,'official_event_website',${literal(official)},'json_ld',true,'pending' from public.event_editions where event_id=(select id from public.events where event_name=${literal(name)});
    insert into public.season_planner_events(user_id,event_id,edition_id,priority,planned_distance)
    select ${literal(user.id)},event_id::text,id,'A','10 km' from public.event_editions where event_id=(select id from public.events where event_name=${literal(name)});
    insert into public.edition_results(event_id,edition_id,result_type,result_status,publication_status,official_url,fingerprint)
    select event_id,id,'official_results','available','published',${literal(official+'/results')},${literal(marker)} from public.event_editions where event_id=(select id from public.events where event_name=${literal(name)});
    select jsonb_build_object('event_id',e.id,'edition_id',d.id,'edition_slug',d.edition_slug,'source_id',s.id)
    from public.events e join public.event_editions d on d.event_id=e.id join public.event_sources s on s.edition_id=d.id where e.event_name=${literal(name)};
  `));
  metadata.eventIds=[fixture.event_id];fs.writeFileSync(metadataPath,JSON.stringify(metadata,null,2));
  const historyName='Historischer Akzeptanzlauf '+marker.slice(0,8),historyOfficial=official+'/history',pastYear=year-2;
  const historical=parse(sql(`
    insert into public.events(event_name,date,city,country,sport,address,latitude,longitude,distance,description,event_url,source_url,status)
    values(${literal(historyName)},${literal('10.06.'+pastYear)},'Berlin','Germany','Running','Teststraße 2','52.52000','13.40500','10 km',
      'Historische synthetische Veranstaltung mit geprüfter Adresse und Laufstrecke für den isolierten Editionsworkflow.',${literal(historyOfficial)},${literal(historyOfficial)},'approved');
    update public.event_editions set edition_status='completed',publication_status='published',discovery_status='detail_only',race_formats='[{"label":"10 km","distance_km":10}]',registration_status='registration_open',registration_url=${literal(historyOfficial+'/register')},source_url=${literal(historyOfficial)} where event_id=(select id from public.events where event_name=${literal(historyName)});
    insert into public.event_sources(event_id,edition_id,source_type,source_url,parser_type,is_active,crawl_status)
    select event_id,id,'official_event_website',${literal(historyOfficial)},'json_ld',true,'pending' from public.event_editions where event_id=(select id from public.events where event_name=${literal(historyName)});
    insert into public.season_planner_events(user_id,event_id,edition_id,priority,planned_distance)
    select ${literal(user.id)},event_id::text,id,'A','10 km' from public.event_editions where event_id=(select id from public.events where event_name=${literal(historyName)});
    insert into public.edition_results(event_id,edition_id,result_type,result_status,publication_status,official_url,fingerprint)
    select event_id,id,'official_results','available','published',${literal(historyOfficial+'/results')},${literal(marker+'-history')} from public.event_editions where event_id=(select id from public.events where event_name=${literal(historyName)});
    select jsonb_build_object('event_id',e.id,'edition_id',d.id,'edition_slug',d.edition_slug,'source_id',s.id)
    from public.events e join public.event_editions d on d.event_id=e.id join public.event_sources s on s.edition_id=d.id where e.event_name=${literal(historyName)};
  `));
  metadata.eventIds.push(historical.event_id);fs.writeFileSync(metadataPath,JSON.stringify(metadata,null,2));
  const participation=parse(sql(`
    with inserted as (
      insert into public.event_editions(event_id,edition_year,edition_key,edition_slug,legacy_event_key,start_date,end_date,
        publication_status,published_at,discovery_status,edition_status,race_formats,legacy_distance,source_url)
      select ${historical.event_id},${pastYear}-n,'main',${literal(marker+'-personal-')}||n,${literal(marker+'-personal-key-')}||n,
        make_date(${pastYear}-n,6,10),make_date(${pastYear}-n,6,10),'archived',make_date(${pastYear}-n,1,1),'suppressed','completed',
        '[{"label":"10 km","distance_km":10}]'::jsonb,'10 km',${literal(historyOfficial)} from generate_series(1,8) n
      returning id,edition_year,legacy_event_key
    ), planned as (
      insert into public.season_planner_events(user_id,event_id,edition_id,priority,planned_distance,planner_details)
      select ${literal(user.id)},legacy_event_key,id,'A','10 km',jsonb_build_object('result',jsonb_build_object(
        'finish_status',(array['Finished','DNF','DNS','DSQ','Finisher','Finished','Finished','Finished'])[${pastYear}-edition_year],
        'finish_time',case when ${pastYear}-edition_year in(1,5,6,7,8) then '00:45:00' else '' end),
        'post_race',jsonb_build_object('archived',${pastYear}-edition_year>=6)) from inserted
      returning event_id,edition_id,planner_details
    ) select jsonb_agg(jsonb_build_object('key',event_id,'edition_id',edition_id,'status',planner_details->'result'->>'finish_status') order by event_id) from planned;
  `));
  Object.assign(historical,{name:historyName,official:historyOfficial,year});
  Object.assign(fixture,{name,year,date,official,admin,user,historical,participation});
  const allowed = /^(?:(?:css|js|assets|event|data)\/|(?:index|404|event-detail|about|contact|privacy|legal|imprint)\.html$|(?:favicon[^/]*|apple-touch-icon\.png|site\.webmanifest)$)/;
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.csv':'text/csv','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
  const configSource=`window.SPORT_EVENT_MAP_CONFIG=${JSON.stringify({supabaseUrl:apiUrl,supabasePublishableKey:publishableKey,siteUrl:'http://127.0.0.1:4189',authCallbackPath:'index.html',passwordResetPath:'index.html'})};document.documentElement.dataset.appConfig='loaded';`;
  server=http.createServer((request,response)=>{
    const send=(code,type,body)=>{response.writeHead(code,{'content-type':type,'cache-control':'no-store'});response.end(body);};
    if(!['GET','HEAD'].includes(request.method))return send(405,'text/plain','Only static reads are served here.');
    let relative;try{relative=decodeURIComponent(new URL(request.url,'http://127.0.0.1:4189').pathname).replace(/^\/+/, '')||'index.html';}catch{return send(404,'text/html',fs.readFileSync(path.join(root,'404.html')));}
    if(relative==='js/config.js')return send(200,mime['.js'],configSource);
    if(!allowed.test(relative)||relative.includes('\\')||relative.split('/').some(x=>x==='..'))return send(404,'text/plain','Not found');
    let file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))return send(404,'text/plain','Not found');
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)||!fs.statSync(file).isFile())return send(404,'text/html',fs.readFileSync(path.join(root,'404.html')));
    send(200,mime[path.extname(file)]||'application/octet-stream',fs.readFileSync(file));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4189,'127.0.0.1',resolve);});
  report.browser = await runBrowserAcceptance({root,baseURL:'http://127.0.0.1:4189',apiUrl,publishableKey,fixture,sql,parse,literal,outputDir:stage});
  }
  report.passed = true;
} catch (error) { report.passed=false; report.failure={name:error.name,message:error.message};process.exitCode=1; }
finally {
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));report.web_server_stopped=true;}
  if(started&&(report.prepared_only||(report.passed===false&&args.includes('--retain-on-failure')))){
    report.retained_isolated_stage=stage;report.resume_command='node tests/run-manual-workflow-acceptance-local.mjs --resume '+path.relative(root,stage)+' --retain-on-failure';
  }else if(started){try{
    run(process.execPath,[cli,'--workdir',stage,'stop']);
    const volumes=run(containerCli,['volume','ls','--filter',`label=com.supabase.cli.project=${projectId}`,'--format','{{.Name}}']).trim().split(/\r?\n/).filter(Boolean);
    for(const volume of volumes){const [info]=JSON.parse(run(containerCli,['volume','inspect',volume]));assert.equal(info.Labels['com.supabase.cli.project'],projectId);run(containerCli,['volume','rm',volume]);}
    report.owned_containers_and_volumes_removed=true;
  }catch(error){report.cleanup_error=error.message;report.passed=false;process.exitCode=1;}}
  report.completed_at=new Date().toISOString();fs.writeFileSync(path.join(stage,'acceptance-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,report:path.join(stage,'acceptance-report.json'),failure:report.failure,cleanup_error:report.cleanup_error,resume_command:report.resume_command},null,2));
}
