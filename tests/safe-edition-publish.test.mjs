import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20260908090111_safe_successor_edition_publication.sql', import.meta.url), 'utf8');
const dynamic = readFileSync(new URL('./safe-edition-publish.sql', import.meta.url), 'utf8');
const functions = [...sql.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)\n\)\s*returns[\s\S]*?as \$\$([\s\S]*?)\$\$;/gi)];
const register = functions.find((entry) => entry[1] === 'register_edition_successor_candidate')[3];
const legacy = functions.find((entry) => entry[1] === 'approve_edition_succession_candidates' && !entry[2].includes('p_notes'))[3];
const publish = functions.find((entry) => entry[1] === 'approve_edition_succession_candidates' && entry[2].includes('p_notes'))[3];

test('closure replaces only detection and the two approval overloads', () => {
  assert.deepEqual(functions.map((entry) => entry[1]), [
    'register_edition_successor_candidate', 'approve_edition_succession_candidates', 'approve_edition_succession_candidates',
  ]);
  assert.doesNotMatch(sql, /create\s+(?:or replace\s+)?(?:view|trigger|policy)/i);
  assert.doesNotMatch(sql, /alter table public\.(?:events|event_editions|season_planner_events)\b/i);
  assert.match(sql, /partial candidate validation schema/);
  assert.match(sql, /edition_lifecycle_publication_automation_disabled_check/);
});

test('detection never creates editions and cannot rewrite terminal reviews', () => {
  assert.doesNotMatch(register, /(?:insert into|update|delete from) public\.event_editions/i);
  assert.match(register, /candidate_already_reviewed/);
  assert.match(register, /crawl_row\.edition_id is distinct from source_row\.edition_id/);
  assert.ok(register.indexOf('where id = p_source_id') < register.indexOf('where id = source_row.event_id for update'));
  assert.ok(register.indexOf('order by edition.event_id, edition.id for update') < register.indexOf('order by candidate.id for update'));
});

test('legacy API fails closed and publication requires exact bounded explicit selection', () => {
  assert.match(legacy, /raise exception 'publication requires/);
  assert.doesNotMatch(legacy, /\b(update|insert|delete)\b/i);
  assert.match(publish, /requested_count not between 1 and 25/);
  assert.match(publish, /count\(distinct id\)/);
  assert.match(publish, /p_limit is distinct from requested_count/);
  assert.doesNotMatch(publish, /skip locked|\blimit\s+\d/i);
});

test('publisher holds sources parents editions and candidates in the established order', () => {
  const lockSource = publish.indexOf('order by s.id for update');
  const lockEvent = publish.indexOf('order by e.id for update');
  const lockEdition = publish.indexOf('order by e.event_id, e.id for update');
  const lockCandidate = publish.indexOf('order by c.id for update');
  assert.ok(lockSource > 0 && lockSource < lockEvent && lockEvent < lockEdition && lockEdition < lockCandidate);
  assert.match(publish, /candidate identity changed concurrently/);
  assert.match(publish, /'queued', 'processing', 'retry_scheduled'/);
  assert.match(publish, /publication_source\.edition_id is distinct from draft_row\.id/);
  assert.match(publish, /crawl_row\.edition_id is distinct from source_row\.edition_id/);
});

test('publication changes no facts and delegates attestation to unchanged transactional verifier', () => {
  assert.doesNotMatch(publish, /(?:update|insert into|delete from) public\.events\b/i);
  assert.doesNotMatch(publish, /set_config\('(?:request\.|app\.freshness_verification)/i);
  assert.doesNotMatch(publish, /\blast_verified_at\s*=|\bverification_status\s*=|\brace_formats\s*=/i);
  assert.match(publish, /freshness_result := public\.verify_freshness_review_editions\(edition_ids, notes, p_evidence\)/);
  assert.ok(publish.indexOf("set publication_status = 'published'") < publish.indexOf('freshness_result := public.verify_freshness_review_editions'));
  assert.doesNotMatch(publish, /exception when/i);
  for (const key of ['requested_count', 'approved_count', 'approved_candidate_ids', 'published_edition_ids', 'publication_verified', 'freshness']) {
    assert.ok(publish.includes(`'${key}'`), key);
  }
});

test('API grants retain admin invoker and service-only candidate detection', () => {
  assert.match(sql, /returns jsonb language plpgsql security invoker/g);
  assert.match(publish, /private\.is_admin\(\)/);
  assert.match(publish, /reviewer_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(sql, /revoke all on function public\.approve_edition_succession_candidates\(uuid\[\], integer, text, jsonb\)\s+from public, anon, service_role/);
  assert.match(sql, /grant execute on function public\.register_edition_successor_candidate\(uuid, bigint, jsonb, text\)\s+to service_role/);
});

test('isolated acceptance suite exercises batch sizes and final-member rollback under API roles', () => {
  assert.match(dynamic, /test_isolated_edition_publish/);
  assert.match(dynamic, /array\[1,10,25\]/);
  assert.match(dynamic, /last-member evidence failure rejects whole batch/);
  assert.match(dynamic, /before_rows=after_rows and before_audits=after_audits/);
  for (const role of ['anon', 'authenticated', 'service_role']) assert.ok(dynamic.includes(`set local role ${role}`));
  assert.match(dynamic.trim(), /rollback;$/);
});
