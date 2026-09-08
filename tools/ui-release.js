/* Standalone, explicitly scoped UI overlay. Full catalog release gates remain unchanged. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OVERLAY_PATHS = Object.freeze([
  'index.html', 'about.html', 'contact.html', 'imprint.html', 'legal.html', 'privacy.html',
  'css/style.css', 'css/mobile-discovery.css',
  'js/app.js', 'js/events.js', 'js/freshness-batch-review.js', 'js/i18n.js',
  'js/mobile-discovery.js', 'js/supabase.js', 'RELEASE_VERSION.txt'
]);
const RUNTIME_PATHS = Object.freeze([
  'css/style.css', 'css/mobile-discovery.css', 'css/data-operations.css', 'css/source-monitor.css',
  'js/theme.js', 'js/app.js', 'js/mobile-discovery.js', 'js/i18n.js', 'js/supabase-loader.js',
  'js/freshness-batch-review.js', 'js/data-freshness-health.js', 'js/event-catalog-loader.js',
  'js/events.js', 'js/event-marker-types.js', 'js/event-detail.js', 'js/event-detail-supabase.js',
  'js/map.js', 'js/search.js', 'js/supabase.js'
]);
const BASE_CRITICAL_PATHS = Object.freeze([
  'index.html', 'css/style.css', 'js/app.js', 'js/supabase.js', 'data/events.csv',
  'data/event-editions-public.json', 'data/catalog-export-manifest.json', 'sitemap.xml'
]);
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const inventoryDigest = entries => sha256(entries.map(e => `${e.path}\0${e.sha256}\n`).join(''));
const sortEntries = entries => [...entries].sort((a, b) => a.path.localeCompare(b.path));

function validateBaseUrl(value) {
  assert.equal(typeof value, 'string', 'Explicit immutable base URL required');
  assert.match(value, /^https:\/\/[a-f0-9]{8}\.sporteventmap\.pages\.dev\/?$/, 'Base must be an HTTPS 8-hex immutable sporteventmap.pages.dev deployment');
  return value.replace(/\/$/, '');
}
function safeRelative(relative) {
  assert.equal(typeof relative, 'string');
  assert.ok(relative && !relative.includes('\\') && !relative.includes('\0') && !relative.includes(':') && !relative.startsWith('/') && relative.split('/').every(p => p && p !== '.' && p !== '..'), `Unsafe artifact path: ${relative}`);
  return relative;
}
function assertOrdinaryPath(target) {
  const stat = fs.lstatSync(target);
  assert.equal(stat.isSymbolicLink(), false, `Symlink is not an artifact: ${target}`);
  assert.ok(stat.isFile() || stat.isDirectory(), `Unexpected filesystem entry: ${target}`);
  return stat;
}
function assertUnder(root, target) {
  const relative = path.relative(root, target);
  assert.ok(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative), 'Path must be strictly inside its authorized root');
  let cursor = root;
  assertOrdinaryPath(root);
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (fs.existsSync(cursor)) assertOrdinaryPath(cursor);
  }
}
function artifactInventory(directory) {
  assert.ok(assertOrdinaryPath(directory).isDirectory(), 'Artifact root must be a directory');
  const entries = [];
  function visit(current) {
    for (const name of fs.readdirSync(current)) {
      const file = path.join(current, name), stat = assertOrdinaryPath(file);
      if (stat.isDirectory()) { visit(file); continue; }
      const relative = safeRelative(path.relative(directory, file).replaceAll('\\', '/'));
      if (relative !== 'release.json') entries.push({ path: relative, sha256: sha256(fs.readFileSync(file)) });
    }
  }
  visit(directory);
  return sortEntries(entries);
}
function parseJson(bytes, label) {
  assert.ok(bytes.length <= 2 * 1024 * 1024, `${label} is too large`);
  let parsed;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw new Error(`Invalid JSON: ${label}`); }
  assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed), `Expected object: ${label}`);
  return parsed;
}
function isoDate(value, label) {
  assert.equal(typeof value, 'string', `Missing ${label}`);
  assert.match(value, /^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/, `Timezone required: ${label}`);
  assert.ok(Number.isFinite(Date.parse(value)), `Invalid ${label}`);
  return value;
}
function validateBaseRelease(directory, expectedReleaseSha256) {
  assert.match(expectedReleaseSha256 || '', SHA, 'Root-checked base release SHA256 required');
  const releasePath = path.join(directory, 'release.json');
  assertOrdinaryPath(releasePath);
  const bytes = fs.readFileSync(releasePath);
  assert.equal(sha256(bytes), expectedReleaseSha256, 'Base release bytes differ from explicitly checked SHA256');
  const release = parseJson(bytes, 'base release.json');
  assert.equal(release.schema_version, 1, 'Unsupported base release schema');
  assert.equal(release.source_dirty, false, 'Base release must identify a clean source');
  assert.match(release.git_commit || '', COMMIT, 'Base Git identity missing');
  assert.match(release.version || '', /^\d{8}-[a-z0-9-]+-v\d+$/, 'Invalid base version');
  isoDate(release.built_at, 'base built_at');
  const entries = artifactInventory(directory), byPath = new Map(entries.map(e => [e.path, e.sha256]));
  assert.ok(release.critical_files && typeof release.critical_files === 'object' && !Array.isArray(release.critical_files), 'Base critical checksums missing');
  for (const relative of BASE_CRITICAL_PATHS) assert.match(release.critical_files[relative] || '', SHA, `Base critical checksum missing: ${relative}`);
  for (const [relative, expected] of Object.entries(release.critical_files)) {
    safeRelative(relative); assert.match(expected || '', SHA, `Invalid critical hash: ${relative}`);
    assert.equal(byPath.get(relative), expected, `Base critical hash mismatch: ${relative}`);
  }
  const eventPages = entries.filter(e => /^event\/[^/]+\/index\.html$/.test(e.path));
  assert.equal(release.artifacts?.count, entries.length, 'Base artifact count mismatch (unknown/missing file)');
  assert.equal(release.artifacts?.aggregate_sha256, inventoryDigest(entries), 'Base full artifact inventory hash mismatch');
  assert.equal(release.event_pages?.count, eventPages.length, 'Base event-page count mismatch');
  assert.equal(release.event_pages?.aggregate_sha256, inventoryDigest(eventPages), 'Base event-page aggregate mismatch');
  const catalog = parseJson(fs.readFileSync(path.join(directory, 'data/catalog-export-manifest.json')), 'base catalog export manifest');
  const archive = JSON.parse(fs.readFileSync(path.join(directory, 'data/event-editions-public.json'), 'utf8'));
  assert.ok(Array.isArray(archive.editions), 'Base archive editions missing');
  assert.equal(archive.editions.length, catalog.metrics?.archive_rows, 'Base archive count differs from catalog manifest');
  assert.equal(eventPages.length, archive.editions.length, 'Base archive and static page counts differ');
  assert.ok(byPath.has('js/config.js'), 'Deployed public runtime configuration missing');
  isoDate(catalog.exported_at, 'original catalog exported_at');
  isoDate(archive.exported_at, 'original archive exported_at');
  return { bytes, release, entries, byPath, eventPages, dataTimestamps: { catalog_exported_at: catalog.exported_at, archive_exported_at: archive.exported_at } };
}
async function verifyRemoteBase(baseUrl, localBytes, fetchImpl = fetch) {
  const url = `${validateBaseUrl(baseUrl)}/release.json`;
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  assert.equal(response.status, 200, 'Immutable base release fetch did not return HTTP 200');
  assert.equal(response.redirected, false, 'Base release redirects are forbidden');
  assert.equal(response.url, url, 'Base release response URL changed');
  const declared = Number(response.headers.get('content-length'));
  assert.ok(!Number.isFinite(declared) || declared <= 2 * 1024 * 1024, 'Remote release manifest too large');
  assert.ok(response.body, 'Base release body missing');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; assert.ok(length <= 2 * 1024 * 1024, 'Remote release manifest too large'); chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  assert.ok(Buffer.concat(chunks).equals(localBytes), 'Remote base release.json differs from local bytes');
}
function git(root, args, input) {
  return execFileSync('git', args, { cwd: root, input, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).trim();
}
function sourceSnapshot(root, expectedCommit) {
  assert.match(expectedCommit || '', COMMIT, 'Explicit source commit required');
  assert.equal(fs.realpathSync(git(root, ['rev-parse', '--show-toplevel'])), fs.realpathSync(root), 'Source must be the Git repository root');
  assert.equal(git(root, ['rev-parse', 'HEAD']), expectedCommit, 'Current source HEAD differs from explicit source commit');
  assert.equal(git(root, ['status', '--porcelain=v1', '--untracked-files=all']), '', 'UI release requires a clean committed source tree');
  const files = new Map(), paths = [...new Set([...OVERLAY_PATHS, ...RUNTIME_PATHS])];
  const tracked = new Map(git(root, ['ls-tree', '-r', 'HEAD', '--', ...paths]).split('\n').map(line => {
    const match = /^100(?:644|755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    assert.ok(match, 'Every UI source must be a committed regular file'); return [match[2], match[1]];
  }));
  const normalizedBlobs = git(root, ['hash-object', '--stdin-paths'], `${paths.join('\n')}\n`).split('\n');
  assert.equal(normalizedBlobs.length, paths.length, 'Incomplete Git source hash inventory');
  for (const [index, relative] of paths.entries()) {
    const file = path.join(root, relative); assertUnder(root, file);
    assert.ok(assertOrdinaryPath(file).isFile(), `Source file missing: ${relative}`);
    const bytes = fs.readFileSync(file);
    // Git's clean filter respects the repository's committed CRLF/LF attributes.
    // The separate SHA256 binds the EXACT deployed worktree bytes as well.
    const gitBlob = tracked.get(relative); assert.match(gitBlob || '', COMMIT, `Untracked UI source: ${relative}`);
    assert.equal(normalizedBlobs[index], gitBlob, `Source bytes differ from committed blob: ${relative}`);
    files.set(relative, { bytes, sha256: sha256(bytes), git_blob: gitBlob });
  }
  return files;
}
function assertSourceUnchanged(root, commit, before) {
  const after = sourceSnapshot(root, commit);
  for (const [relative, record] of before) assert.equal(after.get(relative).sha256, record.sha256, `Source changed during operation: ${relative}`);
}
function injectIdentity(bytes, identity) {
  const html = bytes.toString('utf8');
  assert.ok(html.includes('</head>'), 'Source index has no closing head');
  assert.equal(/<meta\b[^>]*name\s*=\s*["']sport-event-map-(?:release|git-commit|build-time)["']/i.test(html), false, 'Source index already contains generated release metadata');
  const marker = [
    `  <meta name="sport-event-map-release" content="${identity.version}" />`,
    `  <meta name="sport-event-map-git-commit" content="${identity.git_commit}" />`,
    `  <meta name="sport-event-map-build-time" content="${identity.built_at}" />`,
    '  <meta name="sport-event-map-release-scope" content="ui_only" />'
  ].join('\n');
  return Buffer.from(html.replace('</head>', `${marker}\n</head>`));
}
function assertOverlaySafe(bytes, relative) {
  const text = bytes.toString('utf8');
  const forbidden = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
    /\bsb_secret_[A-Za-z0-9_-]{8,}\b/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
    /\b(?:api[_-]?secret|client[_-]?secret|private[_-]?key|secret[_-]?access[_-]?key|(?:supabase[_-]?)?service[_-]?role[_-]?key)\s*["']?\s*[:=]\s*["'`][^"'`\r\n]{8,}["'`]/i
  ];
  assert.ok(!forbidden.some(rule => rule.test(text)), `Potential private credential in UI overlay: ${relative}`);
  for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g)) {
    let payload; try { payload = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString('utf8')); } catch { throw new Error(`Unrecognized embedded JWT in UI overlay: ${relative}`); }
    assert.equal(payload.role, 'anon', `Non-public JWT credential in UI overlay: ${relative}`);
  }
}
function makeOverlay(source, identity) {
  assert.match(identity.version || '', /^\d{8}-ui-only-v\d+$/, 'Explicit ui-only version required');
  assert.match(identity.git_commit || '', COMMIT); isoDate(identity.built_at, 'UI built_at');
  const version = /^Version:\s*(\S+)\s*$/m.exec(source.get('RELEASE_VERSION.txt').bytes.toString('utf8'))?.[1];
  assert.equal(version, identity.version, 'Committed RELEASE_VERSION.txt differs from UI version');
  return new Map(OVERLAY_PATHS.map(relative => {
    const bytes = relative === 'index.html' ? injectIdentity(source.get(relative).bytes, identity) : source.get(relative).bytes;
    assertOverlaySafe(bytes, relative); return [relative, bytes];
  }));
}
function assertRuntime(base, source, overlay) {
  for (const relative of RUNTIME_PATHS) {
    if (!overlay.has(relative)) assert.equal(base.byPath.get(relative), source.get(relative).sha256, `Unchanged runtime dependency differs from deployed base; explicit scope review required: ${relative}`);
  }
  const paths = new Set([...base.byPath.keys(), ...overlay.keys()]);
  for (const [relative, bytes] of overlay) {
    if (!relative.endsWith('.html')) continue;
    for (const tag of bytes.toString('utf8').matchAll(/<(?:script|link)\b[^>]*>/gi)) {
      const resource = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(tag[0])?.[1]; if (!resource) continue;
      if (/^(?:https?:)?\/\//i.test(resource) || /^data:/i.test(resource)) continue;
      const resolved = new URL(resource, `https://package.invalid/${relative}`);
      assert.equal(resolved.origin, 'https://package.invalid', 'Unsupported local UI resource URL');
      const target = safeRelative(decodeURIComponent(resolved.pathname.slice(1)));
      assert.ok(paths.has(target), `Missing UI dependency: ${target}`);
      if (/\.(?:js|css)$/i.test(target)) assert.ok(RUNTIME_PATHS.includes(target) || target === 'js/config.js', `Unreviewed UI runtime dependency: ${target}`);
    }
  }
}
function makeRelease(base, baseUrl, identity, source, overlay, entries) {
  const byPath = new Map(entries.map(e => [e.path, e.sha256]));
  const protectedEntries = entries.filter(e => !OVERLAY_PATHS.includes(e.path));
  const originalProtected = base.entries.filter(e => !OVERLAY_PATHS.includes(e.path));
  assert.deepEqual(protectedEntries, originalProtected, 'Protected deployed artifact inventory changed');
  const expectedPaths = [...new Set([...base.entries.map(e => e.path), ...OVERLAY_PATHS])].sort();
  assert.deepEqual(entries.map(e => e.path).sort(), expectedPaths, 'Unexpected or missing package artifact');
  for (const [relative, bytes] of overlay) assert.equal(byPath.get(relative), sha256(bytes), `Overlay bytes differ from committed source: ${relative}`);
  const criticalPaths = [...new Set([...Object.keys(base.release.critical_files), ...OVERLAY_PATHS, ...RUNTIME_PATHS, 'js/config.js'])].sort((a, b) => a.localeCompare(b));
  return {
    schema_version: 1, release_scope: 'ui_only', ...identity, source_dirty: false,
    data_updated: false, full_data_quality_release: false,
    base_release: { url: validateBaseUrl(baseUrl), release_json_sha256: sha256(base.bytes), version: base.release.version, git_commit: base.release.git_commit, built_at: base.release.built_at, artifacts: base.release.artifacts, event_pages: base.release.event_pages, original_data_timestamps: base.dataTimestamps },
    overlay_files: Object.fromEntries(OVERLAY_PATHS.map(relative => [relative, { source_sha256: source.get(relative).sha256, source_git_blob: source.get(relative).git_blob, artifact_sha256: byPath.get(relative) }])),
    protected_artifacts: { count: protectedEntries.length, aggregate_sha256: inventoryDigest(protectedEntries) },
    critical_files: Object.fromEntries(criticalPaths.map(relative => [relative, byPath.get(relative)])),
    event_pages: base.release.event_pages,
    artifacts: { count: entries.length, aggregate_sha256: inventoryDigest(entries) }
  };
}
function normalizedOptions(options, mode) {
  const root = path.resolve(options.root || ROOT), baseDir = path.resolve(root, options.baseDir || 'dist');
  const directory = path.resolve(root, mode === 'build' ? options.out || '' : options.package || '');
  assertUnder(root, baseDir); assertUnder(root, directory);
  const relative = path.relative(root, directory).replaceAll('\\', '/');
  assert.match(relative, /^exports\/ui-release-\d{8}\/package$/, 'UI package must use a separate exports/ui-release-YYYYMMDD/package directory');
  assert.notEqual(baseDir, directory); assert.ok(!baseDir.startsWith(directory + path.sep) && !directory.startsWith(baseDir + path.sep), 'Base and output may not contain one another');
  validateBaseUrl(options.baseUrl); assert.match(options.baseReleaseSha256 || '', SHA); assert.match(options.sourceCommit || '', COMMIT);
  assert.match(options.version || '', /^\d{8}-ui-only-v\d+$/);
  return { ...options, root, baseDir, directory };
}
async function buildUiRelease(options, dependencies = {}) {
  const opts = normalizedOptions(options, 'build');
  assert.equal(fs.existsSync(opts.directory), false, 'Refusing existing UI package output; no recursive removal is performed');
  const source = sourceSnapshot(opts.root, opts.sourceCommit), base = validateBaseRelease(opts.baseDir, opts.baseReleaseSha256);
  await verifyRemoteBase(opts.baseUrl, base.bytes, dependencies.fetchImpl);
  assertSourceUnchanged(opts.root, opts.sourceCommit, source);
  const identity = { version: opts.version, git_commit: opts.sourceCommit, built_at: (dependencies.now || (() => new Date()))().toISOString() };
  assert.ok(Date.parse(identity.built_at) >= Date.parse(base.release.built_at), 'UI build cannot precede its deployed base');
  const overlay = makeOverlay(source, identity); assertRuntime(base, source, overlay);
  assert.deepEqual(validateBaseRelease(opts.baseDir, opts.baseReleaseSha256).entries, base.entries, 'Base changed during preparation');
  fs.mkdirSync(path.dirname(opts.directory), { recursive: true }); assertUnder(opts.root, opts.directory);
  fs.mkdirSync(opts.directory); // exclusive: a racing output creation also fails
  for (const entry of base.entries) {
    if (overlay.has(entry.path)) continue;
    const bytes = fs.readFileSync(path.join(opts.baseDir, entry.path)); assert.equal(sha256(bytes), entry.sha256, `Base changed while copying: ${entry.path}`);
    const target = path.join(opts.directory, entry.path); fs.mkdirSync(path.dirname(target), { recursive: true }); assertUnder(opts.directory, target); fs.writeFileSync(target, bytes, { flag: 'wx' });
  }
  for (const [relative, bytes] of overlay) {
    const target = path.join(opts.directory, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); assertUnder(opts.directory, target); fs.writeFileSync(target, bytes, { flag: 'wx' });
  }
  const entries = artifactInventory(opts.directory), release = makeRelease(base, opts.baseUrl, identity, source, overlay, entries);
  fs.writeFileSync(path.join(opts.directory, 'release.json'), `${JSON.stringify(release, null, 2)}\n`, { flag: 'wx' });
  assertSourceUnchanged(opts.root, opts.sourceCommit, source);
  assert.deepEqual(validateBaseRelease(opts.baseDir, opts.baseReleaseSha256).entries, base.entries, 'Base changed during build');
  assert.deepEqual(artifactInventory(opts.directory), entries, 'Output changed during build');
  return release;
}
async function verifyUiRelease(options, dependencies = {}) {
  const opts = normalizedOptions(options, 'verify'), source = sourceSnapshot(opts.root, opts.sourceCommit);
  const base = validateBaseRelease(opts.baseDir, opts.baseReleaseSha256);
  await verifyRemoteBase(opts.baseUrl, base.bytes, dependencies.fetchImpl);
  const releasePath = path.join(opts.directory, 'release.json'); assertOrdinaryPath(releasePath);
  const bytes = fs.readFileSync(releasePath), release = parseJson(bytes, 'UI release.json');
  assert.equal(release.release_scope, 'ui_only', 'Not a scoped UI package');
  assert.equal(release.version, opts.version, 'UI version differs from explicit version'); assert.equal(release.git_commit, opts.sourceCommit, 'Package source identity changed');
  isoDate(release.built_at, 'UI built_at');
  assert.ok(Date.parse(release.built_at) >= Date.parse(base.release.built_at) && Date.parse(release.built_at) <= (dependencies.now || (() => new Date()))().getTime() + 5 * 60000, 'Invalid UI build time');
  const identity = { version: opts.version, git_commit: opts.sourceCommit, built_at: release.built_at }, overlay = makeOverlay(source, identity);
  assertRuntime(base, source, overlay);
  const entries = artifactInventory(opts.directory), expected = makeRelease(base, opts.baseUrl, identity, source, overlay, entries);
  assert.deepEqual(release, expected, 'UI manifest differs from its committed source, protected base or truthful scope');
  assert.deepEqual(validateBaseRelease(opts.baseDir, opts.baseReleaseSha256).entries, base.entries, 'Base changed during verification');
  assertSourceUnchanged(opts.root, opts.sourceCommit, source);
  assert.ok(fs.readFileSync(releasePath).equals(bytes), 'UI manifest changed during verification');
  assert.deepEqual(artifactInventory(opts.directory), entries, 'Output changed during verification');
  return release;
}
async function main(argv = process.argv.slice(2)) {
  const [mode, ...args] = argv; assert.ok(['build', 'verify'].includes(mode), 'Usage: ui-release.js build|verify --base-dir dist --base-url https://<8hex>.sporteventmap.pages.dev --base-release-sha256 <sha256> --source-commit <HEAD> --version YYYYMMDD-ui-only-vN --out|--package exports/ui-release-YYYYMMDD/package');
  const names = { '--base-dir': 'baseDir', '--base-url': 'baseUrl', '--base-release-sha256': 'baseReleaseSha256', '--source-commit': 'sourceCommit', '--version': 'version', [mode === 'build' ? '--out' : '--package']: mode === 'build' ? 'out' : 'package' }, options = {};
  assert.equal(args.length % 2, 0, 'Each option requires one value');
  for (let i = 0; i < args.length; i += 2) { const key = names[args[i]]; assert.ok(key && !Object.hasOwn(options, key), `Unknown or duplicate option: ${args[i]}`); options[key] = args[i + 1]; }
  const release = await (mode === 'build' ? buildUiRelease : verifyUiRelease)(options);
  console.log(JSON.stringify({ mode, release_scope: release.release_scope, version: release.version, git_commit: release.git_commit, built_at: release.built_at, base_version: release.base_release.version, original_data_timestamps: release.base_release.original_data_timestamps, overlay_files: Object.keys(release.overlay_files).length, protected_artifacts: release.protected_artifacts, artifacts: release.artifacts, data_updated: false }));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { OVERLAY_PATHS, RUNTIME_PATHS, BASE_CRITICAL_PATHS, sha256, inventoryDigest, artifactInventory, validateBaseUrl, validateBaseRelease, verifyRemoteBase, sourceSnapshot, injectIdentity, assertOverlaySafe, makeOverlay, assertRuntime, makeRelease, buildUiRelease, verifyUiRelease, main };
