import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// No external URL, linked project, production credential or existing volume is
// accepted. Every invocation owns a fresh temporary directory and project ID.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratchRoot = path.join(root, 'exports', 'manual-maintenance-tests');
fs.mkdirSync(scratchRoot, { recursive: true });
assert.equal(fs.realpathSync(scratchRoot), path.join(fs.realpathSync(root), 'exports', 'manual-maintenance-tests'));
const stage = fs.mkdtempSync(path.join(scratchRoot, '.tmp-manual-maintenance-'));
const projectId = `sport-event-map-manual-${path.basename(stage).split('-').at(-1).toLowerCase()}`;
const cli = path.join(root, 'node_modules/supabase/dist/supabase.js');
const container = `supabase_db_${projectId}`;
const env = { ...process.env, DO_NOT_TRACK: '1', SUPABASE_TELEMETRY_DISABLED: '1' };
for (const key of Object.keys(env)) if (/^SUPABASE_(ACCESS_TOKEN|DB_PASSWORD|PROJECT_ID|PROJECT_REF|URL|ANON_KEY|PUBLISHABLE_KEY|SERVICE_ROLE_KEY|SECRET_KEY)$/.test(key)) delete env[key];
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'CONTAINER_HOST', 'CONTAINER_CONNECTION']) delete env[key];
env.DOCKER_HOST = process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock';
const containerCli = ['C:\\Program Files\\RedHat\\Podman\\podman.exe', 'docker', 'podman']
  .find(candidate => spawnSync(candidate, ['--version'], { encoding: 'utf8', env }).status === 0);
assert.ok(containerCli, 'Local Podman/Docker is required.');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env, maxBuffer: 8 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${path.basename(command)} failed: ${String(result.stderr || result.error || result.stdout).slice(-10000)}`);
  return result.stdout;
}
function supabase(args) {
  assert.ok(['start', 'stop'].includes(args[0]), 'Only disposable local lifecycle commands are permitted.');
  return run(process.execPath, [cli, '--workdir', stage, ...args]);
}
function sql(input) {
  const labels = JSON.parse(run(containerCli, ['inspect', '--format', '{{json .Config.Labels}}', container]));
  assert.equal(labels['com.supabase.cli.project'], projectId);
  return run(containerCli, ['exec', '-i', container, 'psql', '--quiet', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
    '--username', 'postgres', '--dbname', 'postgres', '--no-align', '--tuples-only'], { input });
}
if (/podman/i.test(containerCli)) {
  const connections = JSON.parse(run(containerCli, ['system', 'connection', 'list', '--format', 'json']));
  const active = connections.find(connection => connection.Default);
  if (active) {
    const endpoint = new URL(active.URI);
    assert.ok(endpoint.protocol === 'unix:' || ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname), 'Remote container engines are forbidden.');
  }
}
async function testCommittedReadback() {
  const actor = randomUUID(), requestId = randomUUID(), marker = `manual-maintenance-commit-${randomUUID()}`;
  const literal = value => `'${String(value).replaceAll("'", "''")}'`;
  const auth = `set local role authenticated; set local request.jwt.claims=${literal(JSON.stringify({ role: 'authenticated', sub: actor }))}; set local request.jwt.claim.sub=${literal(actor)};`;
  const parse = output => JSON.parse(output.trim().split(/\r?\n/).at(-1));
  // These are separate psql processes/sessions, not reads of uncommitted writes.
  const fixture = parse(sql(`begin;
    insert into auth.users(id,aud,role,email,created_at,updated_at) values(${literal(actor)},'authenticated','authenticated',${literal(marker + '@example.invalid')},now(),now());
    insert into public.profiles(id,email,role) values(${literal(actor)},${literal(marker + '@example.invalid')},'admin') on conflict(id) do update set role='admin';
    insert into public.events(event_name,sport,date,city,country,event_url,status) values(${literal(marker)},'Running','01.06.2090','Berlin','Germany','https://example.invalid/committed','approved');
    commit;
    select jsonb_build_object('event_id',e.id,'edition_id',d.id) from public.events e join public.event_editions d on d.event_id=e.id where e.event_name=${literal(marker)};`));
  try {
    const before = parse(sql(`begin; ${auth} select public.admin_manual_event_context(${fixture.event_id}); commit;`));
    const request = { request_id: requestId, action: 'correct', ...fixture, expected_version: before.version,
      edition_patch: { start_date: '2090-06-02', end_date: '2090-06-02' }, confirmations: ['edition.start_date'],
      source_url: 'https://example.invalid/committed', source_result: 'confirmed', notes: 'Separate local session confirms official date.' };
    const requestJson = literal(JSON.stringify(request));
    const saved = parse(sql(`begin; ${auth} select public.save_manual_event_maintenance(${requestJson}::jsonb); commit;`));
    assert.equal(saved.saved, true);
    const reloaded = parse(sql(`begin; ${auth} select public.admin_manual_event_context(${fixture.event_id}); commit;`));
    assert.equal(reloaded.editions.find(row => row.id === fixture.edition_id).start_date, '2090-06-02');
    const verification = reloaded.verifications.find(row => row.field_name === '__manual_field_verification__');
    assert.equal(verification.changed_by, actor);
    assert.equal(verification.new_value.field, 'edition.start_date');
    assert.ok(Date.now() - Date.parse(verification.new_value.checked_at) < 60_000, 'Database supplies current verification time.');
    const published = parse(sql(`begin; set local role anon; set local request.jwt.claims='{"role":"anon"}';
      select jsonb_build_object('date',date,'edition_id',edition_id) from public.public_event_discovery where edition_id=${literal(fixture.edition_id)}; commit;`));
    assert.equal(published.date, '02.06.2090');
    assert.equal(published.edition_id, fixture.edition_id);
    const replay = parse(sql(`begin; ${auth} select public.save_manual_event_maintenance(${requestJson}::jsonb); commit;`));
    assert.equal(replay.replayed, true);
    assert.equal(replay.edition_id, fixture.edition_id);
    const raceContext = parse(sql(`begin; ${auth} select public.admin_manual_event_context(${fixture.event_id}); commit;`));
    const race = price => new Promise((resolve, reject) => {
      const changing = { ...request, request_id: randomUUID(), expected_version: raceContext.version,
        edition_patch: { price_min: price }, confirmations: [] };
      const child = spawn(containerCli, ['exec', '-i', container, 'psql', '--quiet', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
        '--username', 'postgres', '--dbname', 'postgres', '--no-align', '--tuples-only'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', error = '';
      child.stdout.on('data', value => output += value);
      child.stderr.on('data', value => error += value);
      child.on('error', reject);
      child.on('close', status => resolve({ status, output, error }));
      child.stdin.end(`begin; ${auth} select public.save_manual_event_maintenance(${literal(JSON.stringify(changing))}::jsonb); commit;`);
    });
    const results = await Promise.all([race(15), race(20)]);
    assert.equal(results.filter(result => result.status === 0).length, 1, 'Exactly one simultaneous edit should commit.');
    assert.match(results.find(result => result.status !== 0).error, /inzwischen geändert/, 'Other edit must report a readable version conflict.');
    console.log('Separate committed sessions: persisted reload, anonymous public read, server actor/time and idempotent retry passed.');
    console.log('Real simultaneous database sessions: one edit committed, second returned understandable version conflict.');
  } finally {
    sql(`begin; delete from private.manual_event_maintenance_receipts where actor_id=${literal(actor)};
      delete from public.events where id=${fixture.event_id}; delete from auth.users where id=${literal(actor)}; commit;`);
  }
}
let started = false;
let primaryError;
try {
  const target = path.join(stage, 'supabase');
  fs.mkdirSync(target);
  fs.cpSync(path.join(root, 'supabase/migrations'), path.join(target, 'migrations'), { recursive: true });
  let config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')
    .replace(/^project_id\s*=.*$/m, `project_id = "${projectId}"`)
    .replace(/\b543(\d\d)\b/g, '563$1').replace(/\b8083\b/g, '18093');
  fs.writeFileSync(path.join(target, 'config.toml'), config);
  assert.equal(fs.existsSync(path.join(target, '.temp/project-ref')), false);
  console.log(`Starting fresh local test stack ${projectId}; no production connection.`);
  started = true;
  supabase(['start', '-x', 'edge-runtime,imgproxy,logflare,mailpit,postgres-meta,realtime,storage-api,studio,supavisor,vector']);
  const expected = fs.readdirSync(path.join(target, 'migrations')).map(name => name.match(/^(\d+)_.*\.sql$/)?.[1]).filter(Boolean).sort();
  const actual = sql('select version from supabase_migrations.schema_migrations order by version;').trim().split(/\r?\n/);
  assert.deepEqual(actual, expected, 'All current migrations must apply on a clean database.');
  console.log(`Applied ${actual.length} migrations to fresh database.`);
  const output = sql("set sporteventmap.test_manual_maintenance = 'isolated';\n" + fs.readFileSync(path.join(root, 'tests/manual-event-maintenance.sql'), 'utf8'));
  process.stdout.write(output);
  assert.match(output, /MANUAL_MAINTENANCE_ASSERTIONS=\d+/);
  assert.equal(sql("select count(*) from public.events where event_name like 'manual-maintenance-%';").trim(), '0', 'Test fixtures must be rolled back.');
  console.log('Database integration passed; synthetic fixtures rolled back.');
  await testCommittedReadback();
} catch (error) {
  primaryError = error;
  throw error;
} finally {
  if (started) {
    // Supabase's --no-backup currently uses a Docker volume-prune filter that
    // Podman rejects. Remove only individually inspected project-owned volumes.
    try {
      supabase(['stop']);
      const volumes = run(containerCli, ['volume', 'ls', '--filter', `label=com.supabase.cli.project=${projectId}`, '--format', '{{.Name}}']).trim().split(/\r?\n/).filter(Boolean);
      for (const volume of volumes) {
        const [info] = JSON.parse(run(containerCli, ['volume', 'inspect', volume]));
        assert.equal(info.Labels['com.supabase.cli.project'], projectId);
        run(containerCli, ['volume', 'rm', volume]);
      }
    } catch (cleanupError) {
      if (!primaryError) throw cleanupError;
      console.error(`Additional disposable cleanup error: ${cleanupError.message}`);
    }
  }
  assert.equal(path.dirname(fs.realpathSync(stage)), fs.realpathSync(scratchRoot));
  assert.ok(path.basename(stage).startsWith('.tmp-manual-maintenance-'));
  assert.equal(fs.lstatSync(stage).isSymbolicLink(), false);
  fs.rmSync(stage, { recursive: true, force: true });
}
