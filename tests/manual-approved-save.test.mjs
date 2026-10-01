import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r', '');
const sql = read('supabase/migrations/20261001104403_manual_approved_save.sql');
const base = read('supabase/migrations/20260929104600_manual_event_maintenance.sql');
const knowledge = read('supabase/migrations/20260929190137_manual_event_knowledge_fields.sql');
const regression = read('tests/manual-approved-save.sql');
const fragments = [...sql.matchAll(/definition:=pg_temp\.sem_manual_patch\(definition,\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$,'([^']+)'\);/g)];
assert.equal(fragments.length, 14, 'Every additive function patch must have an exact fail-closed needle.');
let definition = base.match(/create or replace function private\.save_manual_event_maintenance\(p_request jsonb\)[\s\S]*?\n\$\$;/)?.[0];
assert.ok(definition);
// The later existing Knowledge integration adds this exact hook. Other existing
// integrations are not reconstructed or replaced by the new migration.
definition = definition.replace('  result:=jsonb_build_object(', "  if p_request ? 'knowledge' then perform private.apply_manual_event_knowledge(event_id,edition_id,p_request); end if;\n  result:=jsonb_build_object(");
for (const [, needle, replacement, label] of fragments) {
  if (label === 'public approved field names') {
    assert.equal(knowledge.split(needle).length - 1, 1);
    continue;
  }
  assert.equal(definition.split(needle).length - 1, 1, label);
  definition = definition.replace(needle, replacement);
}
assert.match(definition, /actor is null or not private\.is_admin\(\).*42501/);
assert.match(definition, /pg_advisory_xact_lock\(hashtextextended\(request_id::text,0\)\)/);
assert.match(definition, /receipt\.actor_id<>actor or receipt\.request<>p_request/);
assert.match(definition, /if manual_mode then\s*select receipt\.result[\s\S]*live\.publication_status/);
assert.match(definition, /expected_version.*context->>'version'/);
assert.match(definition, /manual_mode.*action='correct'/);
assert.match(definition, /action<>'create' and \(dp \? 'edition_year' or dp \? 'edition_key'\)/);
assert.equal((definition.match(/action='create' and not manual_mode and ep<>'\{\}'::jsonb/g) || []).length, 2,
  'Only manual approval permits actual shared brand changes alongside explicit creation.');
assert.doesNotMatch(sql, /update public\.event_editions set edition_year|update public\.favorites|update public\.season_planner_events/);
assert.match(definition, /if manual_mode then[\s\S]*source_url:=null;/);
assert.match(definition, /manual_mode and \(cardinality\(confirms\)>0/);
assert.match(definition, /if not manual_mode then\s*if complete_review then/);
assert.match(definition, /verify_freshness_review_editions\(array\[edition_id\],notes,evidence\)/);
assert.match(sql, /value is distinct from expected->key.*23514/);
assert.match(sql, /value is distinct from expected then.*23514/);
assert.match(sql, /cardinality\(fields\)=0[\s\S]*Es wurden keine geänderten Werte gespeichert/);
assert.match(sql, /__manual_change_approval__[\s\S]*'source_verified',false/);
assert.match(sql, /__manual_knowledge_approval__[\s\S]*'source_verified',false/);
assert.doesNotMatch(sql, /set last_verified|set last_fetched|insert into public\.event_detail_sources|insert into public\.event_sources|crawler_domain_policies|cron\.schedule/);
assert.match(sql, /public_view_available.*public\.public_event_archive/);
assert.match(sql, /search_available.*public\.public_event_discovery/);
assert.match(sql, /if problem is null then\s*update public\.event_editions set publication_status='published'/);
assert.match(sql, /is_locked[\s\S]*Veröffentlichungssperre/);
assert.match(sql, /manual_approved_fields.*manual_knowledge_approved_fields/);
const publicBundle = knowledge.match(/create function public\.get_public_event_detail_bundle[\s\S]*?\$public\$;/)?.[0];
assert.ok(publicBundle.includes('jsonb_agg(private.manual_knowledge_record(k.id)'), 'Public bundle preserves the additive field-name metadata.');
assert.match(sql, /a\.new_value->'value'[\s\S]*p_record->split_part/, 'Public approval is bound to the current exact value.');
assert.match(sql, /revoke all on function private\.approve_manual_event_save.*from public,anon,authenticated/);
assert.match(regression, /is distinct from 'isolated'/);
assert.match(regression, /formal update success with suppressed value must fail/);
assert.match(regression, /source verification timestamps are not fabricated/);
assert.match(regression, /c\.edition_id is null and c\.field_name='city'/);
assert.match(regression, /admin maintenance does not grant cross-user Planner visibility/);
assert.match(regression, /request\.jwt\.claim\.sub',user_id::text[\s\S]*existing personal references remain attached to original identity/);
assert.match(regression, /a\.date=to_char\(postponed_date,'DD\.MM\.YYYY'\)/);
assert.doesNotMatch(regression, /(?:where|and) edition_id is null|select start_date=postponed_date.*public\.public_event_archive/);
assert.match(regression, /rollback;\s*$/);
console.log('Manual save static contract passed: approval without source proof, identity preserved, strict readback, targeted publication and approved Knowledge fields. SQL/RLS execution remains a separate isolated test.');
