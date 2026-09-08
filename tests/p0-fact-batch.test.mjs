import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareBatch,loadPackage,renderPackage,writePackage,sha256 } from '../tools/p0-fact-batch/index.mjs';
import { fixture,writeFixture,clone,CLOCK } from './p0-fact-batch-fixtures.mjs';

const prepare=data=>prepareBatch(data.manifest,data.baseline,data.reviews);
function rendered(data) {
  return renderPackage({manifest:data.manifest,prepared:prepare(data),provenance:{manifest_sha256:sha256(JSON.stringify(data.manifest)),baseline_sha256:data.manifest.baseline.sha256,reviews:data.manifest.reviews,source_artifacts:[]}});
}
for(const count of [1,10,25]) test(`${count} complete synthetic reviews produce one bounded factual package`,()=>{
  const data=fixture(count),result=rendered(data);
  assert.equal(result.report.changed_events,count);assert.equal(result.report.snapshot_count,4*count+1);
  assert.equal(result.report.reviewed_fields,14*count);
  assert.equal(JSON.parse(result.outputs['admin-import.json']).reviews.length,count);
  assert.equal(JSON.parse(result.outputs['targets.json']).length,count);
  for(const name of ['apply.sql','verify.sql','rollback.sql']) {
    const sql=result.outputs[name];
    assert.ok(sql.includes(`<> ${4*count+1}`));assert.ok(!sql.includes('@@'));
    assert.ok(!sql.includes('20260908_p0_event_facts_batch_05'));
    assert.ok(!sql.includes('request.jwt.claims\',') && !sql.includes("set_config('app.freshness_verification'"));
  }
  assert.match(result.outputs['apply.sql'],/source_crawl_jobs in share mode/);
  assert.match(result.outputs['apply.sql'],/'queued', 'processing', 'retry_scheduled'/);
  assert.match(result.outputs['apply.sql'],/reviewed source or sibling snapshot drifted/);
  assert.match(result.outputs['apply.sql'],/reviewed before-state drifted/);
  assert.match(result.outputs['apply.sql'],/a factual change lacks its automatic field audit/);
  assert.match(result.outputs['rollback.sql'],/snapshot or current post-state drift/);
  assert.match(result.outputs['verify.sql'],/public_event_discovery/);
  assert.deepEqual(result,rendered(clone(data)),'Deterministic inputs, no wall-clock or RNG output');
});

test('mixed and all-no-op reviews preserve evidence without manufactured factual writes',()=>{
  const mixed=rendered(fixture(10,{noop:[1,2,3,4]}));
  assert.equal(mixed.report.changed_events,6);assert.equal(mixed.report.snapshot_count,25);
  assert.equal(JSON.parse(mixed.outputs['admin-import.json']).reviews.length,10);
  assert.deepEqual(mixed.report.attestation_only_event_ids,[10001,10002,10003,10004]);
  const data=fixture(1,{noop:[1]}),result=rendered(data);
  assert.equal(result.report.snapshot_count,0);assert.equal(result.report.changed_events,0);
  assert.deepEqual(Object.keys(result.outputs),['targets.json','admin-import.json','generation-report.json']);
  const review=JSON.parse(result.outputs['admin-import.json']).reviews[0];
  assert.deepEqual(review.observed_values,data.reviews[0].observed_values);
  assert.equal(review.source_checked_at,data.reviews[0].source_checked_at);
  assert.ok(!('confirmed' in review));
});

test('apply and read-only verify bind the same live conflict policy to the factual target set',()=>{
  const result=rendered(fixture(10,{noop:[1]}));
  const guards=['apply.sql','verify.sql'].map(name=>{
    const sql=result.outputs[name];
    const guard=/  if exists \(\s+select 1 from public\.source_review_tasks[\s\S]*?P0 facts live conflict:[\s\S]*?  end if;/.exec(sql)?.[0];
    assert.ok(guard,'Live conflict policy is required in '+name);
    for(const relation of ['source_review_tasks','event_change_proposals','validation_issues','data_workflow_alerts','user_feedback']) assert.ok(guard.includes('public.'+relation));
    assert.ok(guard.includes('10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10010'));
    assert.ok(!guard.includes('10001'));
    assert.ok(!/update |delete /i.test(guard),'Conflict guards cannot resolve or delete blockers');
    return guard;
  });
  assert.equal(guards[0],guards[1]);
  assert.ok(result.outputs['apply.sql'].indexOf('order by e.event_id, e.id for update')<result.outputs['apply.sql'].indexOf(guards[0]));
  assert.ok(result.outputs['apply.sql'].indexOf(guards[0])<result.outputs['apply.sql'].indexOf('insert into private.event_data_workflow_backup'));
});

test('empty master or edition patch remains valid; generated assignment is never id=id',()=>{
  const data=fixture();data.reviews[0].event_patch={};
  data.reviews[0].observed_values.description=data.baseline.rows[0].event.description;
  data.reviews[0].field_evidence.description.value=data.baseline.rows[0].event.description;
  data.reviews[0].edition_patch={race_formats:[{label:'5 km',distance_km:5,terrain:'road'}]};
  data.reviews[0].observed_values.distances=clone(data.reviews[0].edition_patch.race_formats);
  data.reviews[0].field_evidence.distances.value=clone(data.reviews[0].edition_patch.race_formats);
  const result=rendered(data);
  assert.match(result.outputs['apply.sql'],/coalesce\(assignments \|\| ', ', ''\)/);
  assert.ok(!result.outputs['apply.sql'].includes('id=id'));
});

const negativeCases=[
  ['0 reviews',data=>{data.manifest.reviews=[];data.reviews=[];data.baseline.rows=[];}],
  ['26 reviews',data=>Object.assign(data,fixture(26))],
  ['duplicate event',data=>data.manifest.reviews.push(clone(data.manifest.reviews[0]))],
  ['duplicate edition',data=>data.manifest.reviews[1].edition_id=data.manifest.reviews[0].edition_id],
  ['duplicate source',data=>data.manifest.reviews[1].source_id=data.manifest.reviews[0].source_id],
  ['foreign source event',data=>data.baseline.rows[0].sources[0].event_id=999],
  ['foreign source edition',data=>data.baseline.rows[0].sources[0].edition_id=data.baseline.rows[1].edition.id],
  ['foreign sibling event',data=>data.baseline.rows[0].sibling_editions[0].event_id=999],
  ['sibling snapshot drift',data=>data.baseline.rows[0].sibling_editions[0].description='changed'],
  ['missing whole-row field',data=>delete data.baseline.rows[0].event.canonical_key],
  ['missing whole source snapshot field',data=>delete data.baseline.rows[0].sources[0].last_http_status],
  ['review source URL drift',data=>data.reviews[0].source_url+='wrong'],
  ['review field drift',data=>data.reviews[0].observed_values.city='Different city'],
  ['numeric coordinate coercion',data=>data.reviews[0].event_patch.latitude=52.5],
  ['missing baseline target',data=>data.baseline.rows.pop()],
  ['uncertain field',data=>data.reviews[0].uncertain_fields=['distances']],
  ['one missing confirmation',data=>data.reviews[0].confirmed_fields.pop()],
  ['low confidence',data=>data.reviews[0].confidence=0.79],
  ['old evidence',data=>data.reviews[0].source_checked_at='2030-05-31T11:59:59Z'],
  ['future evidence in one member',data=>data.reviews[1].source_checked_at='2030-06-01T12:05:01Z'],
  ['impossible evidence date',data=>data.reviews[0].source_checked_at='2030-02-30T12:00:00Z'],
  ['missing explicit clock',data=>delete data.manifest.prepared_at],
  ['clock without timezone',data=>data.manifest.prepared_at='2030-06-01T12:00:00'],
  ['old baseline',data=>data.baseline.retrieved_at='2030-05-30T12:00:00Z'],
  ['old artifact despite fresh review',data=>data.reviews[0].field_evidence.city.evidence[0].retrieved_at='2030-05-30T12:00:00Z'],
  ['missing artifact for a field',data=>data.reviews[0].field_evidence.city.evidence=[]],
  ['unsupported primary field',data=>data.reviews[0].field_evidence.city.status='uncertain'],
  ['wrong primary value',data=>data.reviews[0].field_evidence.city.value='Different city'],
  ['missing primary SHA',data=>delete data.reviews[0].field_evidence.city.evidence[0].sha256],
  ['queue retry/processing blocker',data=>data.baseline.rows[0].active_source_jobs=1],
  ['open review task',data=>data.baseline.rows[0].open_tasks=1],
  ['pending proposal',data=>data.baseline.rows[0].pending_proposals=1],
  ['unknown readiness',data=>data.baseline.rows[0].open_tasks=null],
  ['claimed source',data=>data.baseline.rows[0].sources[0].claimed_by='worker'],
  ['source no longer active',data=>data.baseline.rows[0].sources[0].is_active=false],
  ['distance mirror mismatch',data=>data.reviews[0].edition_patch.legacy_distance='10 km'],
  ['unapproved year change',data=>data.reviews[0].edition_patch.edition_year=2031],
  ['date change',data=>data.reviews[0].event_patch.date='03.06.2030'],
  ['edition date change',data=>data.reviews[0].edition_patch.start_date='2030-06-03'],
  ['publication change',data=>data.reviews[0].edition_patch.publication_status='published'],
  ['identity change',data=>data.reviews[0].event_patch.event_name='Another identity'],
  ['foreign-key change',data=>data.reviews[0].edition_patch.predecessor_edition_id=data.reviews[1].edition_id],
  ['freshness change',data=>data.reviews[0].edition_patch.last_verified_at=CLOCK],
  ['source change',data=>data.reviews[0].edition_patch.source_url='https://other.example/'],
  ['SQL batch-key injection',data=>data.manifest.batch_id="bad';select 1;--"],
  ['unknown manifest option',data=>data.manifest.skip_guards=true]
];
for(const [name,mutate] of negativeCases) test(`reject ${name}`,()=>{const data=fixture(2);mutate(data);assert.throws(()=>prepare(data));});

test('source evidence strings cannot introduce executable SQL or alter placeholders',()=>{
  const data=fixture(),value="Text ' \\ $reviewed_batch$ @@COUNT@@ ; DROP TABLE events; -- "+'supported synthetic description '.repeat(4);
  data.reviews[0].event_patch.description=value;
  data.reviews[0].observed_values.description=value;data.reviews[0].field_evidence.description.value=value;
  const result=rendered(data),sql=result.outputs['apply.sql'];
  assert.ok(sql.includes("Text '' \\\\ $reviewed_batch$ @@COUNT@@"));
  const encoded=/jsonb_to_recordset\('((?:''|[^'])*)'::jsonb\)/.exec(sql);
  assert.ok(encoded);const targets=JSON.parse(encoded[1].replaceAll("''","'"));
  assert.equal(targets[0].event_patch.description,value);
  assert.match(sql,/set local standard_conforming_strings = on/);
});

test('file-bound generation checks baseline/review/artifact bytes, preserves originals, refuses overwrite and path escape',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sem-p0-batch-unit-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const data=fixture(2),manifestFile=writeFixture(path.join(root,'inputs'),data);
  const original=fs.readFileSync(manifestFile);
  const loaded=loadPackage(manifestFile,{privateRoot:root}),result=renderPackage(loaded);
  assert.equal(loaded.provenance.source_artifacts.length,2);
  const output=path.join(root,'package');writePackage(output,result.outputs,{privateRoot:root});
  assert.throws(()=>writePackage(output,result.outputs,{privateRoot:root}));
  assert.deepEqual(fs.readFileSync(manifestFile),original);
  assert.equal(sha256(fs.readFileSync(path.join(output,'apply.sql'))),result.report.outputs.find(o=>o.file==='apply.sql').sha256);
  for (const relative of ['baseline.json','event-1/review.json','event-1/official.html']) {
    const file=path.join(root,'inputs',relative),before=fs.readFileSync(file);
    fs.appendFileSync(file,' ');
    assert.throws(()=>loadPackage(manifestFile,{privateRoot:root}),/Provenance hash mismatch/);
    fs.writeFileSync(file,before);
  }
  const escaped=clone(data);escaped.reviews[0].field_evidence.city.evidence[0].file='../baseline.json';
  escaped.reviews[0].field_evidence.city.evidence[0].sha256=sha256(JSON.stringify(escaped.baseline));
  escaped.manifest.reviews[0].sha256=sha256(JSON.stringify(escaped.reviews[0]));
  const escapeManifest=writeFixture(path.join(root,'escape'),escaped);
  assert.throws(()=>loadPackage(escapeManifest,{privateRoot:root}),/escapes its allowed directory/);
  assert.throws(()=>writePackage(path.join(os.tmpdir(),'outside-sem-p0-batch'),result.outputs,{privateRoot:root}),/private exports/);
});
