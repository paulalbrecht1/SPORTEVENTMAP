import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const plannerSource = fs.readFileSync(new URL('../js/events.js', import.meta.url), 'utf8');
const profileSource = fs.readFileSync(new URL('../js/supabase.js', import.meta.url), 'utf8');
function shippedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\nfunction ', start + 10);
  assert.ok(start >= 0 && end > start, `${name} is a shipped function`);
  return source.slice(start, end);
}

function fixture() {
  const meta = {};
  const writes = [];
  const listeners = {};
  const nodes = Object.fromEntries(['profileCompletedEvents', 'profileCompletedCount', 'profileTrophyStatus', 'profileAchievementBadges']
    .map(id => [id, { textContent: '', innerHTML: '' }]));
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [2026, 9, 1, 12])); }
  }
  const context = vm.createContext({
    Date: FixtureDate, console,
    plannedEditions: [], events: [], personalPlannedCatalog: new Map(),
    window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    document: { getElementById: id => nodes[id] || null },
    localStorage: { getItem: () => JSON.stringify(meta), setItem: (...args) => writes.push(args) },
    getSeasonPlanMeta: () => meta,
    getSeasonPlannerDetails: event => meta[context.getEventKey(event)]?.planner_details || {},
    renderProfileCompletedArchive: () => {}
  });
  for (const name of ['cleanValue', 'getEventKey', 'getExactPlannedMatches', 'getPersonalPlannedEvents', 'createPersonalPlannerPlaceholder', 'getPersonalParticipationState',
    'createLocalSeasonDate', 'parseSeasonDateRange', 'parseSeasonDate', 'parseSeasonEndDate', 'getLocalDateStart']) {
    vm.runInContext(shippedFunction(plannerSource, name), context);
  }
  const snapshotStart = plannerSource.indexOf('function personalPlannerSnapshot(');
  vm.runInContext(plannerSource.slice(snapshotStart, plannerSource.indexOf('\n}', snapshotStart) + 2), context);
  context.window.getPersonalPlannedEvents = context.getPersonalPlannedEvents;
  context.window.getPersonalParticipationState = context.getPersonalParticipationState;
  for (const name of ['getProfilePlannedEvents', 'getProfileParticipationState', 'getProfileFavoriteKey',
    'parseProfileDate', 'getCompletedProfileEvents', 'getProfileTrophyLabel', 'escapeProfileHTML',
    'getProfileSeasonMeta', 'getDefaultProfilePlannerDetails', 'normalizeProfilePlannerDetails',
    'getProfilePlannerEntry', 'hasProfileResult', 'getProfileCompletedArchiveEvents',
    'getFilteredProfileArchiveEvents', 'getProfileArchiveFilterCounts', 'renderProfileAchievementBadges', 'renderProfileCompletedEvents']) {
    vm.runInContext(shippedFunction(profileSource, name), context);
  }
  const add = (key, status = '', options = {}) => {
    const row = { event_id: 7, event_key: key, edition_id: key, event_name: 'Recurring race',
      date: '10.09.2026', end_date: '2026-09-10', event_status: 'completed', ...options };
    context.plannedEditions.push(key);
    meta[key] = { edition_id: row.edition_id, planner_details: { result: { finish_status: status }, post_race: {} } };
    if (!options.unresolved) context.personalPlannedCatalog.set(key, row);
    return row;
  };
  return { context, meta, writes, nodes, listeners, add };
}

test('profile counts explicit personal outcomes across archived editions, never past dates or catalog completion', () => {
  const { context, add, meta } = fixture();
  add('pending'); add('finished', 'Finished'); add('dnf', 'DNF'); add('dns', 'DNS'); add('dsq', 'DSQ');
  add('legacy', '  Finisher  '); add('unavailable-finish', 'Finished', { unresolved: true });
  add('next-year', '', { date: '10.09.2027', end_date: '2027-09-10', event_status: 'scheduled' });
  context.events.push({ edition_id: 'only-favorite', event_name: 'Unplanned favorite', date: '01.01.2020' });
  meta['finished'].planner_details.post_race.archived = true;
  assert.deepEqual(Array.from(context.getCompletedProfileEvents(), row => row.edition_id).sort(),
    ['finished', 'legacy', 'unavailable-finish']);
  assert.deepEqual(JSON.parse(JSON.stringify(context.getProfileArchiveFilterCounts(context.getProfileCompletedArchiveEvents()))),
    { all: 7, finisher: 3, dnf_dns: 3, with_result: 6, without_result: 1 });
  vm.runInContext('profileCompletedArchiveFilter="finisher"', context);
  assert.equal(context.getFilteredProfileArchiveEvents(context.getProfileCompletedArchiveEvents()).length, 3);
  vm.runInContext('profileCompletedArchiveFilter="dnf_dns"', context);
  assert.equal(context.getFilteredProfileArchiveEvents(context.getProfileCompletedArchiveEvents()).length, 3);
});

test('result edits and removal derive counts again without persistent badge grants or duplicate participations', () => {
  const { context, add, meta, writes, nodes } = fixture();
  for (let i = 0; i < 5; i++) add(`finished-${i}`, 'Finished');
  const before = JSON.stringify(meta);
  context.renderProfileCompletedEvents();
  assert.equal(nodes.profileCompletedCount.textContent, '5 completed');
  assert.equal((nodes.profileAchievementBadges.innerHTML.match(/is-unlocked/g) || []).length, 1);
  assert.equal(JSON.stringify(meta), before);
  meta['finished-0'].planner_details.result.finish_status = 'DNF';
  context.renderProfileCompletedEvents();
  assert.equal(nodes.profileCompletedCount.textContent, '4 completed');
  assert.equal((nodes.profileAchievementBadges.innerHTML.match(/is-unlocked/g) || []).length, 0);
  meta['finished-0'].planner_details.result.finish_status = 'Finished';
  meta['finished-0'].planner_details.post_race.archived = true;
  context.renderProfileCompletedEvents(); context.renderProfileCompletedEvents();
  assert.equal(nodes.profileCompletedCount.textContent, '5 completed');
  assert.equal(context.getProfilePlannedEvents().length, 5);
  assert.deepEqual(writes, []);
});

test('result details alone and catalogue cancellation are not an explicit finish', () => {
  const { context, add, meta } = fixture();
  add('time-only'); meta['time-only'].planner_details.result.finish_time = '01:25:00';
  add('cancelled', '', { event_status: 'cancelled' });
  add('unknown-date', '', { date: '', end_date: '' });
  assert.equal(context.getCompletedProfileEvents().length, 0);
  assert.equal(context.getProfileCompletedArchiveEvents().length, 2);
  assert.equal(context.getProfileParticipationState(context.getProfilePlannedEvents()[2]).temporal, 'unknown');
});

test('historical yearly editions stay distinct and profile dates use the planner calendar parser', () => {
  const { context, add } = fixture();
  add('race-2025', 'Finished', { date: '10.09.2025', end_date: '2025-09-10' });
  add('race-2026', 'Finished');
  add('race-2027', '', { date: '2027-09-10', end_date: '2027-09-10', event_status: 'scheduled' });
  assert.equal(context.getCompletedProfileEvents().length, 2);
  assert.equal(context.parseProfileDate('2026-10-01').getDate(), 1);
  assert.equal(context.parseProfileDate('01.10.2026 – 03.10.2026').getDate(), 1);
  assert.equal(context.parseProfileDate('31.02.2026'), null);
  assert.equal(context.getProfileParticipationState(context.getProfilePlannedEvents()[2]).isUpcoming, true);
});

test('two stored aliases for one edition cannot grant two lifetime finishes', () => {
  const { context, add, meta } = fixture();
  const original = add('historic-original', 'Finished');
  context.plannedEditions.push('historic-alias');
  context.personalPlannedCatalog.set('historic-alias', { ...original, event_key: 'historic-alias' });
  meta['historic-alias'] = { edition_id: original.edition_id, planner_details: { result: { finish_status: 'Finished' } } };
  assert.equal(context.getProfilePlannedEvents().length, 1);
  assert.equal(context.getCompletedProfileEvents().length, 1);
  // Deduplication for display never destroys either stored participation key.
  assert.equal(context.plannedEditions.length, 2);
  assert.equal(Object.keys(meta).length, 2);
});

test('profile download includes metadata only for the current personal planned cohort and never deletes old data', () => {
  const { context, add, meta, writes } = fixture();
  add('own-historical', 'Finished');
  add('own-unavailable', 'DNS', { unresolved: true });
  meta['unassigned-old-note'] = { planner_details: { personal_note: 'Unassigned legacy note' } };
  meta['other-account-key'] = { planner_details: { personal_note: 'Private old account note' } };
  const before = JSON.stringify(meta);
  let download;
  context.Blob = class { constructor(parts) { download = JSON.parse(parts.join('')); } };
  context.URL = { createObjectURL: () => 'blob:test-only', revokeObjectURL: () => {} };
  context.document.body = { appendChild: () => {} };
  context.document.createElement = () => ({ click() {}, remove() {} });
  context.showToast = () => {};
  context.getProfileFavoriteEvents = () => [];
  const start = profileSource.indexOf('function exportProfileData(');
  vm.runInContext(profileSource.slice(start, profileSource.indexOf('async function openProfileModal(', start)), context);
  context.exportProfileData();
  assert.deepEqual(Object.keys(download.season_meta).sort(), ['own-historical', 'own-unavailable']);
  assert.equal(download.season_meta['own-historical'].planner_details.result.finish_status, 'Finished');
  assert.equal(JSON.stringify(meta), before);
  assert.deepEqual(writes, []);
});
