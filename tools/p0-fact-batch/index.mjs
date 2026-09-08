import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const require = createRequire(import.meta.url);
const reviewApi = require('../../js/freshness-batch-review.js');
export const FIELDS = reviewApi.REQUIRED_FIELDS;
export const EVENT_FIELDS = Object.freeze(['address','canonical_name','city','country','description','distance','event_url','latitude','longitude','registration_status','sport']);
export const EDITION_FIELDS = Object.freeze(['legacy_distance','race_formats','registration_status','registration_url']);
const IMPORT_FIELDS = ['event_id','edition_id','source_id','source_url','source_checked_at','confidence','notes','confirmed_fields','uncertain_fields','observed_values'];
// These columns establish a full baseline for the reviewed production schema.
// New columns are retained and checked by the database's exact whole-row guard.
export const BASELINE_COLUMNS = Object.freeze({
  event: 'address canonical_key canonical_name catalog_import_id city country created_at created_by data_confidence data_source date description distance event_name event_status event_url id image import_batch last_checked last_verified_at latitude longitude needs_review next_check_at official_url organizer_id organizer_name publication_status quality_flags region registration_status review_note review_priority review_reason review_status reviewed_at reviewed_by slug source_type source_url sport status status_note subcategory updated_at verification_status'.split(' '),
  edition: 'archive_reason auto_publish_eligible catalog_import_id created_at currency data_confidence discovery_archived_at discovery_status edition_slug edition_status edition_year end_date event_id generated_from_candidate_id generated_from_source_id id last_verified_at last_verified_source_id legacy_distance legacy_event_key needs_review next_check_at participant_limit predecessor_edition_id price_details price_max price_min publication_status published_at race_formats registration_status registration_url results_status review_priority source_url start_date start_time updated_at verification_status'.split(' '),
  source: 'catalog_import_id claimed_at claimed_by consecutive_failures crawl_status created_at edition_id event_id id is_active last_change_status last_changed_at last_content_hash last_content_length last_content_type last_duration_ms last_error last_error_type last_etag last_fetched_at last_final_url last_http_status last_modified last_normalization_version last_pinned_ip last_redirect_count last_semantic_hash next_fetch_at parser_type recently_recovered_at robots_allowed robots_checked_at source_host source_priority source_type source_url updated_at'.split(' ')
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const equal = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const json = value => JSON.stringify(canonical(value), null, 2) + '\n';
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sqlText = value => "'" + value.replaceAll("'", "''") + "'";
function exactKeys(value, keys, label) {
  assert.ok(record(value), `${label}: object required`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label}: missing or unexpected fields`);
}
function time(value, label) {
  assert.equal(typeof value, 'string', `${label}: timestamp required`);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  assert.ok(m, `${label}: RFC3339 with explicit timezone required`);
  const [,y,month,d,h,min,s,z] = m;
  assert.ok(+month>=1 && +month<=12 && +d>=1 && +d<=new Date(Date.UTC(+y,+month,0)).getUTCDate() && +h<24 && +min<60 && +s<60 && (z==='Z' || (+z.slice(1,3)<24 && +z.slice(4)<60)), `${label}: invalid calendar timestamp`);
  const result = Date.parse(value);
  assert.ok(Number.isFinite(result), `${label}: finite time required`);
  return result;
}
function recent(value, now, label) {
  const result = time(value,label);
  assert.ok(result>=now-86400000 && result<=now+300000, `${label}: outside evidence window`);
  return result;
}
function https(value) {
  assert.equal(typeof value, 'string', 'HTTPS URL must remain text');
  const url = new URL(value);
  assert.ok(url.protocol==='https:' && !url.username && !url.password && !/\s/.test(value), 'Uncredentialed HTTPS URL required');
}
function fullRow(value, kind) {
  assert.ok(record(value), `${kind}: full row required`);
  assert.ok(BASELINE_COLUMNS[kind].every(key=>Object.hasOwn(value,key)), `${kind}: incomplete baseline row`);
  for (const key of ['id', ...(kind!=='event'?['event_id']:[])]) assert.ok(value[key]!==null, `${kind}: missing identity`);
}
function cleanPatch(patch, original, allowed, kind) {
  assert.ok(record(patch), `${kind}: explicit patch object required, including no-op {}`);
  const out = {};
  for (const [key,value] of Object.entries(patch)) {
    assert.ok(allowed.includes(key), `${kind}: forbidden field ${key}`);
    assert.ok(Object.hasOwn(original,key), `${kind}: unknown baseline field ${key}`);
    if (key==='race_formats') assert.ok(Array.isArray(value), 'race_formats must remain an array');
    else assert.equal(typeof value,'string', `${kind}.${key}: exact database TEXT type required`);
    if (!equal(value,original[key])) out[key]=clone(value);
  }
  return out;
}
function coordinates(value, limit) {
  assert.ok(typeof value==='string' && /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Math.abs(Number(value))<=limit, 'Coordinate must be valid database TEXT');
}
function formats(value) {
  assert.ok(Array.isArray(value) && value.length>0, 'Complete structured race formats required');
  for (const f of value) {
    assert.ok(record(f) && typeof f.label==='string' && f.label.trim(), 'Format label required');
    // Preserve all original programme metadata; never manufacture numeric distances.
    assert.ok(typeof f.distance_km==='number' && Number.isFinite(f.distance_km) && f.distance_km>0, 'Each format needs a supported positive numeric distance; uncertain/variable cases use a separate review');
  }
}
function binding(pin,row,review) {
  const e=row.event,d=row.edition;
  fullRow(e,'event'); fullRow(d,'edition');
  assert.equal(row.event_id,pin.event_id); assert.equal(e.id,pin.event_id);
  assert.equal(d.event_id,pin.event_id); assert.equal(d.id,pin.edition_id);
  assert.ok(Array.isArray(row.sources) && Array.isArray(row.sibling_editions), 'Source and sibling snapshots required');
  assert.equal(new Set(row.sources.map(s=>s.id)).size,row.sources.length,'Duplicate sources');
  assert.equal(new Set(row.sibling_editions.map(s=>s.id)).size,row.sibling_editions.length,'Duplicate siblings');
  for (const sibling of row.sibling_editions) {
    fullRow(sibling,'edition'); assert.ok(UUID.test(sibling.id)); assert.equal(sibling.event_id,e.id,'Foreign sibling event');
  }
  assert.deepEqual(row.sibling_editions.find(s=>s.id===d.id),d,'Selected edition differs from sibling snapshot');
  const siblingIds=new Set(row.sibling_editions.map(s=>s.id));
  for (const source of row.sources) {
    fullRow(source,'source'); assert.ok(UUID.test(source.id)); assert.equal(source.event_id,e.id,'Foreign source event');
    assert.ok(source.edition_id===null || siblingIds.has(source.edition_id),'Unknown source edition foreign key');
    assert.ok(Object.hasOwn(source,'claimed_at') && Object.hasOwn(source,'claimed_by'),'Incomplete source claim snapshot');
    assert.ok(source.claimed_at===null && source.claimed_by===null,'Claimed source');
  }
  const source=row.sources.find(s=>s.id===pin.source_id);
  assert.ok(source,'Selected source absent'); assert.equal(source.edition_id,d.id);
  assert.equal(source.source_url,pin.source_url); assert.equal(source.source_type,'official_event_website'); assert.equal(source.is_active,true);
  assert.equal(d.source_url,pin.source_url);
  for (const key of ['event_id','edition_id','source_id','source_url']) assert.equal(review[key],pin[key],`Review binding drift: ${key}`);
  for (const key of ['open_tasks','pending_proposals','active_source_jobs']) assert.ok(row[key]===0 || (Array.isArray(row[key]) && row[key].length===0), `Open or missing baseline blocker: ${key}`);
  assert.equal(e.status,'approved'); assert.equal(e.publication_status,'published'); assert.equal(e.event_status,'active');
  assert.equal(d.publication_status,'published'); assert.equal(d.discovery_status,'active'); assert.equal(d.edition_status,'scheduled');
  assert.ok(Number.isInteger(d.edition_year) && /^\d{4}-\d{2}-\d{2}$/.test(d.start_date) && Number(d.start_date.slice(0,4))===d.edition_year,'Edition year/date mismatch');
  assert.equal(e.date,d.start_date.split('-').reverse().join('.'),'Master date differs from selected edition');
  return source;
}

// Pure preparation: no network, auth, database calls, current-clock defaults or writes.
export function prepareBatch(manifest, baseline, reviews) {
  exactKeys(manifest,['schema_version','batch_id','prepared_at','baseline','reviews'],'Manifest');
  assert.equal(manifest.schema_version,1);
  assert.match(manifest.batch_id,/^[a-z0-9][a-z0-9_]{5,79}$/,'Safe unique batch key required');
  const now=time(manifest.prepared_at,'prepared_at');
  exactKeys(manifest.baseline,['file','sha256'],'Baseline reference'); assert.match(manifest.baseline.sha256,SHA);
  assert.ok(Array.isArray(manifest.reviews) && manifest.reviews.length>=1 && manifest.reviews.length<=25,'Exactly 1–25 reviews required');
  const pins=[...manifest.reviews].sort((a,b)=>a.event_id-b.event_id);
  for (const pin of pins) {
    exactKeys(pin,['event_id','edition_id','source_id','source_url','file','sha256'],'Review reference');
    assert.ok(Number.isSafeInteger(pin.event_id) && pin.event_id>0); assert.match(pin.edition_id,UUID); assert.match(pin.source_id,UUID); assert.match(pin.sha256,SHA); https(pin.source_url);
  }
  for (const key of ['event_id','edition_id','source_id']) assert.equal(new Set(pins.map(p=>p[key])).size,pins.length,`Duplicate ${key}`);
  assert.ok(record(baseline) && Array.isArray(baseline.rows),'Baseline rows required');
  recent(baseline.retrieved_at,now,'Baseline time');
  assert.deepEqual(baseline.rows.map(r=>r.event_id).sort((a,b)=>a-b),pins.map(p=>p.event_id),'Baseline target set differs');
  assert.ok(Array.isArray(reviews));
  assert.deepEqual(reviews.map(r=>r.event_id).sort((a,b)=>a-b),pins.map(p=>p.event_id),'Review target set differs');
  const targets=[],imports=[],contexts=[],baselineRows=[];
  let expires=Infinity;
  for (const pin of pins) {
    const row=baseline.rows.find(r=>r.event_id===pin.event_id),review=reviews.find(r=>r.event_id===pin.event_id);
    const source=binding(pin,row,review);
    const eventPatch=cleanPatch(review.event_patch,row.event,EVENT_FIELDS,'event');
    const editionPatch=cleanPatch(review.edition_patch,row.edition,EDITION_FIELDS,'edition');
    const e={...row.event,...eventPatch},d={...row.edition,...editionPatch};
    coordinates(e.latitude,90); coordinates(e.longitude,180); formats(d.race_formats);
    assert.equal(e.distance,d.legacy_distance,'Distance mirrors differ');
    assert.equal(e.distance,d.race_formats.map(f=>f.label).join(' / '),'Flat distance must mirror every structured label');
    assert.ok(['registration_not_open','registration_open','sold_out'].includes(d.registration_status),'Unsupported registration state');
    assert.equal(e.registration_status,d.registration_status,'Registration mirrors differ');
    assert.equal(e.event_url,d.registration_url,'Registration links differ'); https(d.registration_url);
    assert.ok(typeof e.description==='string' && e.description.trim().length>=80,'Complete description required');
    for (const key of ['canonical_name','city','country','address','sport']) assert.ok(typeof e[key]==='string' && e[key].trim(),`Missing factual value ${key}`);
    const currentDate=new Date(now).toISOString().slice(0,10);
    assert.ok((d.end_date||d.start_date)>=currentDate,'Past edition is outside current factual batch scope');
    assert.ok(!row.sibling_editions.some(s=>s.id!==d.id && s.publication_status==='published' && s.discovery_status==='active' && !['cancelled','inactive','completed'].includes(s.edition_status) && (!s.start_date || (s.end_date||s.start_date)>=currentDate)),'Another active edition would receive master sync');
    const storedValues={event_name:e.canonical_name||e.event_name,edition_year:d.edition_year,date:d.start_date,city:e.city,country:e.country,address:e.address,latitude:e.latitude,longitude:e.longitude,sport:e.sport,distances:d.race_formats,description:e.description,registration_status:d.registration_status,official_event_page:source.source_url,registration_link:d.registration_url};
    const context={eventId:String(e.id),editionId:d.id,sourceId:source.id,sourceUrl:source.source_url,storedValues,eligible:true,revision:'projection-only'};
    const result=reviewApi.validateReview(review,context,now);
    assert.ok(result.valid,`${e.id}: ${result.errors.join('; ')}`);
    assert.ok(equal(review.observed_values,storedValues),'Exact observed values required');
    exactKeys(review.field_evidence,FIELDS,'Field evidence');
    expires=Math.min(expires,recent(review.source_checked_at,now,'Source time')+86400000);
    for (const field of FIELDS) {
      const proof=review.field_evidence[field];
      assert.ok(record(proof) && proof.status==='supported' && equal(proof.value,review.observed_values[field]),`Unsupported evidence: ${field}`);
      assert.ok(Array.isArray(proof.evidence) && proof.evidence.length>0,`No primary artifact: ${field}`);
      for (const ref of proof.evidence) {
        assert.ok(record(ref)); https(ref.url); assert.match(ref.sha256,SHA);
        expires=Math.min(expires,recent(ref.retrieved_at,now,'Artifact time')+86400000);
      }
    }
    imports.push(Object.fromEntries(IMPORT_FIELDS.map(key=>[key,clone(review[key])])));
    contexts.push(context);
    if (Object.keys(eventPatch).length || Object.keys(editionPatch).length) {
      targets.push({event_id:e.id,edition_id:d.id,source_id:source.id,source_url:source.source_url,before_event:clone(row.event),before_edition:clone(row.edition),event_patch:eventPatch,edition_patch:editionPatch});
      baselineRows.push({event_id:e.id,sources:clone(row.sources),sibling_editions:clone(row.sibling_editions)});
    }
  }
  const envelope={schema_version:1,reviews:imports};
  assert.ok(Buffer.byteLength(json(envelope))<=2*1024*1024,'Admin import exceeds 2 MB');
  assert.deepEqual(reviewApi.parseImport(JSON.stringify(envelope)),imports);
  return {targets,baselineRows,envelope,contexts,expires_at:new Date(expires).toISOString()};
}

function inside(root,file) { const relative=path.relative(root,file); return relative!=='' && !relative.startsWith('..'+path.sep) && relative!=='..' && !path.isAbsolute(relative); }
function readBound(base,reference,scope) {
  assert.equal(typeof reference.file,'string'); assert.ok(reference.file && !path.isAbsolute(reference.file)); assert.match(reference.sha256,SHA);
  const file=path.resolve(base,reference.file),realScope=fs.realpathSync(scope);
  assert.ok(inside(realScope,fs.realpathSync(file)),'Input or artifact escapes its allowed directory');
  const bytes=fs.readFileSync(file); assert.equal(sha256(bytes),reference.sha256,`Provenance hash mismatch: ${reference.file}`);
  return {file,bytes};
}
const parseJson = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
export function loadPackage(manifestFile,{privateRoot=path.join(REPO,'exports')}={}) {
  const file=fs.realpathSync(manifestFile),base=path.dirname(file);
  assert.ok(inside(fs.realpathSync(privateRoot),file),'Manifest must remain in private input scope');
  const bytes=fs.readFileSync(file),manifest=parseJson(bytes);
  // Validate shape before resolving any manifest-controlled file.
  exactKeys(manifest,['schema_version','batch_id','prepared_at','baseline','reviews'],'Manifest');
  assert.ok(Array.isArray(manifest.reviews) && manifest.reviews.length>=1 && manifest.reviews.length<=25);
  const baseline=readBound(base,manifest.baseline,privateRoot);
  const loaded=manifest.reviews.map(ref=>readBound(base,ref,privateRoot));
  const reviews=loaded.map(item=>parseJson(item.bytes));
  const prepared=prepareBatch(manifest,parseJson(baseline.bytes),reviews);
  const sourceArtifacts=new Map();
  for (let i=0;i<reviews.length;i++) for (const field of FIELDS) for (const ref of reviews[i].field_evidence[field].evidence) {
    const artifact=readBound(path.dirname(loaded[i].file),ref,path.dirname(loaded[i].file));
    const key=manifest.reviews[i].event_id+'|'+ref.file;
    sourceArtifacts.set(key,{event_id:manifest.reviews[i].event_id,file:ref.file,sha256:sha256(artifact.bytes)});
  }
  return {manifest,prepared,provenance:{manifest_sha256:sha256(bytes),baseline_sha256:sha256(baseline.bytes),reviews:[...manifest.reviews].sort((a,b)=>a.event_id-b.event_id),source_artifacts:[...sourceArtifacts.values()].sort((a,b)=>a.event_id-b.event_id||(a.file<b.file?-1:a.file>b.file?1:0))}};
}
export function renderPackage({manifest,prepared,provenance}) {
  const m=prepared.targets.length,outputs={};
  const provenanceJson={...provenance,batch_id:manifest.batch_id,prepared_at:manifest.prepared_at};
  const templateHashes={};
  if (m) {
    const tokens={
      BATCH_KEY:manifest.batch_id, TARGETS_JSON:sqlText(json(prepared.targets)), PROVENANCE_JSON:sqlText(json(provenanceJson)),
      BASELINE_ROWS_JSON:sqlText(json(prepared.baselineRows)), EVENT_IDS:prepared.targets.map(t=>t.event_id).join(', '),
      EDITION_IDS:prepared.targets.map(t=>sqlText(t.edition_id)+'::uuid').join(', '), COUNT:String(m), SNAPSHOT_COUNT:String(4*m+1), BEFORE_COUNT:String(2*m),
      PROGRAM_CASE:'case t.event_id '+prepared.targets.map(t=>'when '+t.event_id+' then '+(t.edition_patch.race_formats||t.before_edition.race_formats).length).join(' ')+' else -1 end',
      PREPARED_AT:new Date(time(manifest.prepared_at,'prepared_at')).toISOString(),EXPIRES_AT:prepared.expires_at
    };
    for (const name of ['apply','verify','rollback']) {
      const template=fs.readFileSync(path.join(HERE,'templates',name+'.sql'),'utf8').replaceAll('\r\n','\n');
      templateHashes[name]=sha256(template);
      tokens.REASON=sqlText(`${name==='rollback'?'Rollback of':'Apply'} ${manifest.batch_id}: independently reviewed existing-event facts only; preserve identities and require separate admin freshness review. Manifest SHA256 ${provenance.manifest_sha256}.`);
      outputs[name+'.sql']=template.replace(/@@([A-Z_]+)@@/g,(_,key)=>{assert.ok(Object.hasOwn(tokens,key),'Unknown template placeholder: '+key);return tokens[key];});
    }
  }
  outputs['targets.json']=json(prepared.targets);
  outputs['admin-import.json']=json(prepared.envelope);
  const report={schema_version:1,batch_id:manifest.batch_id,prepared_at:manifest.prepared_at,expires_at:prepared.expires_at,reviewed_events:prepared.envelope.reviews.length,reviewed_fields:14*prepared.envelope.reviews.length,changed_events:m,snapshot_count:m?4*m+1:0,attestation_only_event_ids:prepared.envelope.reviews.filter(r=>!prepared.targets.some(t=>t.event_id===r.event_id)).map(r=>r.event_id),patched_fields:prepared.targets.reduce((n,t)=>n+Object.keys(t.event_patch).length+Object.keys(t.edition_patch).length,0),projection_only:true,live_state_verified:false,admin_attestation_performed:false,rpc_executed:false,...provenance,template_sha256:templateHashes,outputs:Object.entries(outputs).map(([file,text])=>({file,sha256:sha256(text),bytes:Buffer.byteLength(text)}))};
  outputs['generation-report.json']=json(report);
  return {outputs,report};
}
export function writePackage(outputDir,outputs,{privateRoot=path.join(REPO,'exports')}={}) {
  const dir=path.resolve(outputDir),parent=fs.realpathSync(path.dirname(dir)),scope=fs.realpathSync(privateRoot);
  assert.ok(inside(scope,path.join(parent,path.basename(dir))),'Output must be a new directory in private exports');
  assert.ok(!fs.existsSync(dir),'Refusing to overwrite an existing package');
  for (const name of Object.keys(outputs)) assert.ok(/^(?:apply\.sql|verify\.sql|rollback\.sql|targets\.json|admin-import\.json|generation-report\.json)$/.test(name),'Unexpected output name');
  // Validate/render everything before any writes. A report is written last;
  // a partial I/O failure cannot be mistaken for a completed package.
  fs.mkdirSync(dir);
  for (const [name,content] of Object.entries(outputs)) fs.writeFileSync(path.join(dir,name),content,{encoding:'utf8',flag:'wx'});
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2);
    assert.ok(args.length===4 && args[0]==='--manifest' && args[2]==='--out','Usage: node tools/p0-fact-batch/index.mjs --manifest <private manifest.json> --out <new exports directory>');
    const result=renderPackage(loadPackage(path.resolve(args[1])));
    writePackage(args[3],result.outputs);
    console.log(JSON.stringify({batch_id:result.report.batch_id,reviewed_events:result.report.reviewed_events,changed_events:result.report.changed_events,snapshot_count:result.report.snapshot_count,projection_only:true}));
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
